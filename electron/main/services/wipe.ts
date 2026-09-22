import { getDb } from '../db/database'
import { garbageCollectOrphans } from './documents'
import { audit } from './audit'
import { nowIso } from '../utils/time'
import type { AuthedUser } from '../ipc/helpers'
import { getSetting, setSettingSilent } from './settings'
import { SYNC_TABLES } from '../db/schema'
import { getSupabase } from '../sync/client'
import { dropFtsTriggers, ensureFts } from '../db/fts'

export const KEEP = new Set([
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'settings',
  'case_types',
  'expense_categories',
  'number_sequences',
  'cashboxes',
  'sessions',
  'lookup_values'
])

function wipeExceptAdminTx(): number {
  const db = getDb()
  dropFtsTriggers(db)
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[]
  let n = 0
  for (const t of tables) {
    if (KEEP.has(t.name)) continue
    db.exec(`DELETE FROM "${t.name}"`)
    n++
  }
  db.exec('DELETE FROM local_sync_queue')
  db.prepare(
    `DELETE FROM user_permissions WHERE user_id NOT IN (SELECT id FROM users WHERE lower(username) = 'admin')`
  ).run()
  db.prepare(`DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users WHERE lower(username) = 'admin')`).run()
  db.prepare(`DELETE FROM users WHERE lower(username) != 'admin'`).run()
  db.prepare('UPDATE number_sequences SET current_value = 0').run()
  db.prepare(`UPDATE number_sequences SET current_value = 7000 WHERE name = 'case'`).run()
  db.prepare(`DELETE FROM settings WHERE key = 'sync_disabled'`).run()
  db.prepare('UPDATE cashboxes SET current_balance = 0').run()
  setSettingSilent('sync_last_pulled_at', nowIso())
  try {
    db.exec(
      `DELETE FROM sqlite_sequence WHERE name NOT IN (${[...KEEP].map((x) => `'${x}'`).join(',')})`
    )
  } catch {
    /* sqlite_sequence may not exist with UUID PKs */
  }
  return n
}

export function wipeBusinessData(actor: AuthedUser): { tables: number } {
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF')
  let count = 0
  try {
    count = db.transaction(() => wipeExceptAdminTx())()
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  garbageCollectOrphans(actor)
  audit(actor, 'wipe', 'system', null, 'تم مسح بيانات العمل مع الإبقاء على حساب الأدمن والإعدادات')
  getDb().exec('DELETE FROM local_sync_queue')
  setSettingSilent('sync_last_pulled_at', nowIso())
  setSettingSilent('sync_parents_bootstrapped', '0')
  try {
    ensureFts(getDb(), { forceRebuild: true })
  } catch {
    /* search index rebuilt on next launch */
  }
  return { tables: count }
}

/** مرة واحدة بعد التحديث: مكتب فاضي + حساب admin فقط */
export function ensureAdminOnlyReset(): void {
  if (getSetting('keep_admin_reset_done') === '1') return
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.transaction(() => {
      wipeExceptAdminTx()
      setSettingSilent('keep_admin_reset_done', '1')
    })()
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  try {
    garbageCollectOrphans(null)
  } catch {
    /* ignore */
  }
}

const KEEP_REMOTE = new Set([
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'settings',
  'case_types',
  'expense_categories',
  'number_sequences',
  'cashboxes',
  'lookup_values'
])

export async function wipeRemoteBusinessData(): Promise<{ deleted: string[]; errors: string[] }> {
  const sb = getSupabase()
  if (!sb) return { deleted: [], errors: ['supabase not configured'] }
  const tables = [...SYNC_TABLES].reverse().filter((t) => !KEEP_REMOTE.has(t))
  const deleted: string[] = []
  const errors: string[] = []
  for (let pass = 0; pass < 5; pass++) {
    let failed = 0
    for (const table of tables) {
      const pk = table === 'settings' ? 'key' : table === 'number_sequences' ? 'name' : 'id'
      const { error } = await sb.from(table).delete().not(pk, 'is', null)
      if (error) {
        failed += 1
        if (pass === 4) errors.push(`${table}: ${error.message}`)
      } else if (!deleted.includes(table)) deleted.push(table)
    }
    if (!failed) break
  }
  return { deleted, errors }
}
