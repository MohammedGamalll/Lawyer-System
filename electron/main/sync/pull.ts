import { SYNC_TABLES } from '../db/schema'
import { getSetting, setSettingSilent } from '../services/settings'
import { applyRemoteWrite } from './applyRemote'
import { getSupabase } from './client'

export async function pullChanges(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const since = getSetting('sync_last_pulled_at', '1970-01-01T00:00:00.000Z')
  let maxTs = since
  for (const table of SYNC_TABLES) {
    const { data, error } = await sb.from(table).select('*').gt('updated_at', since).order('updated_at', { ascending: true }).limit(500)
    if (error) continue
    for (const row of data || []) {
      applyRemoteWrite(table, row as Record<string, unknown>, row.deleted_at ? 'DELETE' : 'UPDATE')
      const u = String((row as { updated_at?: string }).updated_at || '')
      if (u > maxTs) maxTs = u
    }
  }
  setSettingSilent('sync_last_pulled_at', maxTs)
}
