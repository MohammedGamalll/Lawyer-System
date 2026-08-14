import { getDb } from '../db/database'
import { SYNC_TABLES } from '../db/schema'
import { isRemoteNewer } from './conflicts'
import { runAsRemote } from './origin'
import { pkColumn } from './queue'

const SYNC_SET = new Set<string>(SYNC_TABLES)

export function applyRemoteWrite(table: string, row: Record<string, unknown> | null, event: 'INSERT' | 'UPDATE' | 'DELETE'): void {
  if (!SYNC_SET.has(table) || !row) return
  const pk = pkColumn(table)
  const id = row[pk]
  if (id == null || id === '') return
  const db = getDb()
  runAsRemote(() => {
    const local = db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(id) as Record<string, unknown> | undefined
    if (event === 'DELETE') {
      if (local && isRemoteNewer(String(row.deleted_at || row.updated_at || ''), String(local.updated_at || ''))) {
        upsertRow(db, table, pk, row)
      }
      return
    }
    if (local && !isRemoteNewer(String(row.updated_at || ''), String(local.updated_at || ''))) return
    if (table === 'users' && local) {
      const localLogin = Date.parse(String(local.last_login_at || ''))
      const remoteLogin = Date.parse(String(row.last_login_at || ''))
      if (!Number.isNaN(localLogin) && (Number.isNaN(remoteLogin) || localLogin > remoteLogin)) {
        row = { ...row, last_login_at: local.last_login_at, last_login_device: local.last_login_device }
      }
    }
    upsertRow(db, table, pk, row)
  })
}

function upsertRow(db: ReturnType<typeof getDb>, table: string, pk: string, row: Record<string, unknown>): void {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  const allowed = new Set(info.map((c) => c.name))
  const cols = Object.keys(row).filter((k) => allowed.has(k))
  if (!cols.length) return
  const placeholders = cols.map(() => '?').join(',')
  const updates = cols.filter((c) => c !== pk).map((c) => `${c}=excluded.${c}`).join(',')
  db.prepare(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`
  ).run(...cols.map((c) => row[c] ?? null))
}
