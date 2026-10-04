import log from 'electron-log'
import { SYNC_TABLES } from '../db/schema'
import { getSetting, setSettingSilent } from '../services/settings'
import { applyRemoteWrite } from './applyRemote'
import { getSupabase } from './client'
import { emitSyncStatus } from './status'
import { withTimeout } from './timeout'
import { dropParentQueue, pkColumn } from './queue'
import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'

export const PULL_PAGE_SIZE = 200
export const PULL_REQUEST_TIMEOUT_MS = 90_000
export const FULL_PULL_SINCE = '1970-01-01T00:00:00.000Z'
export const FULL_PULL_FLAG = 'sync_full_pull_v125'
const CHECKPOINT_KEY = 'sync_pull_checkpoint'
const PASS_KEY = 'sync_full_pull_pass'
const MAX_COUNT_RETRIES = 3
const COUNT_GATE_TABLES = new Set(['clients', 'cases', 'hearings'])

export type PullCheckpoint = {
  full: boolean
  since: string
  tableIndex: number
  lastId: string
  offset: number
  maxTs: string
}

export type PullResult = { done: boolean }

export function pullPageRange(offset: number, pageSize = PULL_PAGE_SIZE): { from: number; to: number } {
  return { from: offset, to: offset + pageSize - 1 }
}

export function lastCursorFromRows(rows: Record<string, unknown>[], pk: string): string {
  if (!rows.length) return ''
  return String(rows[rows.length - 1]?.[pk] ?? '')
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
    const parsed = JSON.parse(raw) as Partial<PullCheckpoint>
    if (!parsed || typeof parsed.tableIndex !== 'number') return null
    return {
      full: Boolean(parsed.full),
      since: String(parsed.since || FULL_PULL_SINCE),
      tableIndex: parsed.tableIndex,
      lastId: typeof parsed.lastId === 'string' ? parsed.lastId : '',
      offset: typeof parsed.offset === 'number' ? parsed.offset : 0,
      maxTs: String(parsed.maxTs || parsed.since || FULL_PULL_SINCE)
    }
  } catch {
    return null
  }
}

export function hasIncompletePull(): boolean {
  return Boolean(parseCheckpoint(getSetting(CHECKPOINT_KEY, '')))
}

export function needsFullPull(): boolean {
  try {
    if (hasIncompletePull()) return true
    return getSetting(FULL_PULL_FLAG, '') !== 'done'
  } catch {
    return true
  }
}

function saveCheckpoint(cp: PullCheckpoint): void {
  setSettingSilent(CHECKPOINT_KEY, JSON.stringify(cp))
}

function clearCheckpoint(): void {
  setSettingSilent(CHECKPOINT_KEY, '')
}

function localTableCount(table: string): number {
  try {
    return Number((getDb().prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c || 0)
  } catch {
    return 0
  }
}

async function remoteExactCount(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  table: string
): Promise<number | null> {
  try {
    const { count, error } = await withTimeout(
      sb.from(table).select('*', { count: 'exact', head: true }),
      PULL_REQUEST_TIMEOUT_MS
    )
    if (error) {
      log.warn('pull remote count failed', table, error.message)
      return null
    }
    return count ?? 0
  } catch (err) {
    log.warn('pull remote count failed', table, err)
    return null
  }
}

function applyPulledRows(table: string, rows: Record<string, unknown>[], full: boolean, maxTs: string): string {
  const db = getDb()
  if (full) db.exec('PRAGMA foreign_keys = OFF')
  try {
    for (const row of rows) {
      applyRemoteWrite(table, row, row.deleted_at ? 'DELETE' : 'UPDATE')
      const u = String((row.updated_at as string) || '')
      if (u > maxTs) maxTs = u
    }
  } finally {
    if (full) db.exec('PRAGMA foreign_keys = ON')
  }
  return maxTs
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
  let startLastId = existing?.lastId || ''
  let startOffset = existing?.offset || 0

  if (full) dropParentQueue()

  for (let i = startTable; i < SYNC_TABLES.length; i += 1) {
    const table = SYNC_TABLES[i]
    const pk = pkColumn(table)
    let lastId = i === startTable ? startLastId : ''
    let offset = i === startTable ? startOffset : 0
    for (;;) {
      emitSyncStatus(
        'syncing',
        `جاري سحب ${table} (${i + 1}/${SYNC_TABLES.length}) · ${full ? lastId || '1' : String(offset + 1)}`
      )
      saveCheckpoint({ full, since, tableIndex: i, lastId, offset, maxTs })
      let rows: Record<string, unknown>[] = []
      let lastErr = ''
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          let q = full
            ? sb.from(table).select('*').order(pk, { ascending: true }).limit(PULL_PAGE_SIZE)
            : sb
                .from(table)
                .select('*')
                .gt('updated_at', since)
                .order('updated_at', { ascending: true })
                .order(pk, { ascending: true })
                .range(offset, offset + PULL_PAGE_SIZE - 1)
          if (full && lastId) q = q.gt(pk, lastId)
          const { data, error } = await withTimeout(q, PULL_REQUEST_TIMEOUT_MS)
          if (error) throw new Error(error.message)
          rows = (data || []) as Record<string, unknown>[]
          lastErr = ''
          break
        } catch (err) {
          lastErr = String((err as Error).message || err)
          log.warn('pull page retry', table, full ? lastId : offset, attempt, lastErr)
          if (attempt === 3) {
            saveCheckpoint({ full, since, tableIndex: i, lastId, offset, maxTs })
            log.warn('pull paused at checkpoint', table, full ? lastId : offset, lastErr)
            return { done: false }
          }
        }
      }
      try {
        maxTs = applyPulledRows(table, rows, full, maxTs)
      } catch (err) {
        log.warn('pull apply failed', table, err)
      }
      if (rows.length < PULL_PAGE_SIZE) break
      if (full) lastId = lastCursorFromRows(rows, pk)
      else offset += PULL_PAGE_SIZE
    }

    if (full && COUNT_GATE_TABLES.has(table)) {
      const remote = await remoteExactCount(sb, table)
      const local = localTableCount(table)
      if (remote != null && local < remote) {
        const pass = Number(getSetting(PASS_KEY, '0') || 0) + 1
        setSettingSilent(PASS_KEY, String(pass))
        log.warn('pull count mismatch', table, { local, remote, pass })
        if (pass < MAX_COUNT_RETRIES) {
          saveCheckpoint({ full, since, tableIndex: i, lastId: '', offset: 0, maxTs })
          return { done: false }
        }
      }
    }
    startLastId = ''
    startOffset = 0
  }
  clearCheckpoint()
  setSettingSilent('sync_last_pulled_at', maxTs)
  setSettingSilent(FULL_PULL_FLAG, 'done')
  setSettingSilent(PASS_KEY, '')
  setSettingSilent('sync_full_pull_v124', 'done')
  return { done: true }
}
