import log from 'electron-log'
import { SYNC_TABLES } from '../db/schema'
import { getSetting, setSettingSilent } from '../services/settings'
import { applyRemoteWrite } from './applyRemote'
import { getSupabase } from './client'
import { emitSyncStatus } from './status'
import { withTimeout } from './timeout'
import { pkColumn } from './queue'
import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'

export const PULL_PAGE_SIZE = 200
export const PULL_REQUEST_TIMEOUT_MS = 90_000
export const FULL_PULL_SINCE = '1970-01-01T00:00:00.000Z'
const CHECKPOINT_KEY = 'sync_pull_checkpoint'
const FULL_PULL_FLAG = 'sync_full_pull_v124'

export type PullCheckpoint = {
  full: boolean
  since: string
  tableIndex: number
  offset: number
  maxTs: string
}

export type PullResult = { done: boolean }

export function pullPageRange(offset: number, pageSize = PULL_PAGE_SIZE): { from: number; to: number } {
  return { from: offset, to: offset + pageSize - 1 }
}

function localCasesEmpty(): boolean {
  try {
    const row = getDb().prepare(`SELECT COUNT(*) AS c FROM cases WHERE ${notDeleted()}`).get() as { c: number }
    return Number(row?.c || 0) === 0
  } catch {
    return false
  }
}

export function pullSince(stored: string, emptyOffice: boolean): string {
  if (emptyOffice) return FULL_PULL_SINCE
  return stored || FULL_PULL_SINCE
}

export function parseCheckpoint(raw: string): PullCheckpoint | null {
  try {
    const parsed = JSON.parse(raw) as PullCheckpoint
    if (!parsed || typeof parsed.tableIndex !== 'number' || typeof parsed.offset !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function hasIncompletePull(): boolean {
  return Boolean(parseCheckpoint(getSetting(CHECKPOINT_KEY, '')))
}

function saveCheckpoint(cp: PullCheckpoint): void {
  setSettingSilent(CHECKPOINT_KEY, JSON.stringify(cp))
}

function clearCheckpoint(): void {
  setSettingSilent(CHECKPOINT_KEY, '')
}

export async function pullChanges(): Promise<PullResult> {
  const sb = getSupabase()
  if (!sb) return { done: true }
  const stored = getSetting('sync_last_pulled_at', FULL_PULL_SINCE)
  const empty = localCasesEmpty()
  const needFull = empty || getSetting(FULL_PULL_FLAG, '') !== 'done'
  const existing = parseCheckpoint(getSetting(CHECKPOINT_KEY, ''))
  const full = existing?.full ?? needFull
  const since = existing?.since ?? (full ? FULL_PULL_SINCE : pullSince(stored, empty))
  let maxTs = existing?.maxTs || since
  let startTable = existing?.tableIndex || 0
  let startOffset = existing?.offset || 0

  for (let i = startTable; i < SYNC_TABLES.length; i += 1) {
    const table = SYNC_TABLES[i]
    const pk = pkColumn(table)
    let offset = i === startTable ? startOffset : 0
    for (;;) {
      const { from, to } = pullPageRange(offset)
      emitSyncStatus('syncing', `جاري سحب ${table} (${i + 1}/${SYNC_TABLES.length}) · ${from + 1}`)
      saveCheckpoint({ full, since, tableIndex: i, offset, maxTs })
      let rows: Record<string, unknown>[] = []
      let lastErr = ''
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          let q = sb.from(table).select('*').order(pk, { ascending: true }).range(from, to)
          if (!full) {
            q = sb
              .from(table)
              .select('*')
              .gt('updated_at', since)
              .order('updated_at', { ascending: true })
              .order(pk, { ascending: true })
              .range(from, to)
          }
          const { data, error } = await withTimeout(q, PULL_REQUEST_TIMEOUT_MS)
          if (error) throw new Error(error.message)
          rows = (data || []) as Record<string, unknown>[]
          lastErr = ''
          break
        } catch (err) {
          lastErr = String((err as Error).message || err)
          log.warn('pull page retry', table, from, attempt, lastErr)
          if (attempt === 3) {
            saveCheckpoint({ full, since, tableIndex: i, offset, maxTs })
            log.warn('pull paused at checkpoint', table, from, lastErr)
            return { done: false }
          }
        }
      }
      for (const row of rows) {
        try {
          applyRemoteWrite(table, row, row.deleted_at ? 'DELETE' : 'UPDATE')
          const u = String((row.updated_at as string) || '')
          if (u > maxTs) maxTs = u
        } catch (err) {
          log.warn('pull apply failed', table, err)
        }
      }
      if (rows.length < PULL_PAGE_SIZE) break
      offset += PULL_PAGE_SIZE
    }
    startOffset = 0
  }
  clearCheckpoint()
  setSettingSilent('sync_last_pulled_at', maxTs)
  setSettingSilent(FULL_PULL_FLAG, 'done')
  return { done: true }
}
