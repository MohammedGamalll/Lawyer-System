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

export const PULL_PAGE_SIZE = 500
export const FULL_PULL_SINCE = '1970-01-01T00:00:00.000Z'

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

export async function pullChanges(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const stored = getSetting('sync_last_pulled_at', FULL_PULL_SINCE)
  const since = pullSince(stored, localCasesEmpty())
  let maxTs = since
  let i = 0
  for (const table of SYNC_TABLES) {
    i += 1
    const pk = pkColumn(table)
    let offset = 0
    for (;;) {
      const { from, to } = pullPageRange(offset)
      emitSyncStatus('syncing', `جاري سحب ${table} (${i}/${SYNC_TABLES.length})`)
      const { data, error } = await withTimeout(
        sb
          .from(table)
          .select('*')
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .order(pk, { ascending: true })
          .range(from, to)
      )
      if (error) {
        log.warn('pull failed', table, error.message)
        throw new Error(`فشل سحب ${table}: ${error.message}`)
      }
      const rows = data || []
      for (const row of rows) {
        try {
          applyRemoteWrite(table, row as Record<string, unknown>, row.deleted_at ? 'DELETE' : 'UPDATE')
          const u = String((row as { updated_at?: string }).updated_at || '')
          if (u > maxTs) maxTs = u
        } catch (err) {
          log.warn('pull apply failed', table, err)
        }
      }
      if (rows.length < PULL_PAGE_SIZE) break
      offset += PULL_PAGE_SIZE
    }
  }
  setSettingSilent('sync_last_pulled_at', maxTs)
}
