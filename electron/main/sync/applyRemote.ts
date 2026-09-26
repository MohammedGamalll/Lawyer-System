import { getDb } from '../db/database'
import { SYNC_TABLES } from '../db/schema'
import { adoptRemoteId, findLocalIdByNaturalKey, isUniqueConflict } from './adoptRemoteId'
import { onRemoteUserApplied } from './authGuard'
import { isRemoteNewer } from './conflicts'
import { runAsRemote } from './origin'
import { isQueued, pkColumn } from './queue'

const SYNC_SET = new Set<string>(SYNC_TABLES)

export function applyRemoteWrite(table: string, incoming: Record<string, unknown> | null, event: 'INSERT' | 'UPDATE' | 'DELETE'): void {
  if (!SYNC_SET.has(table) || !incoming) return
  let row: Record<string, unknown> = incoming
  const pk = pkColumn(table)
  const id = row[pk]
  if (id == null || id === '') return
  const db = getDb()
  runAsRemote(() => {
    const twin = findLocalIdByNaturalKey(table, row)
    if (twin && String(twin) !== String(id)) adoptRemoteId(table, twin, String(id))
    const local = db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(id) as Record<string, unknown> | undefined
    if (event === 'DELETE') {
      if (local && isRemoteNewer(String(row.deleted_at || row.updated_at || ''), String(local.updated_at || ''))) {
        upsertRow(db, table, pk, row)
      }
      return
    }
    if (table === 'users' && local) {
      const localLogin = Date.parse(String(local.last_login_at || ''))
      const remoteLogin = Date.parse(String(row.last_login_at || ''))
      if (!Number.isNaN(localLogin) && (Number.isNaN(remoteLogin) || localLogin > remoteLogin)) {
        row = { ...row, last_login_at: local.last_login_at, last_login_device: local.last_login_device }
      }
      if (isQueued('users', String(id))) {
        row = { ...row, password_hash: local.password_hash }
      } else {
        const keep = onRemoteUserApplied(
          {
            id: String(local.id),
            password_hash: String(local.password_hash || ''),
            is_active: Number(local.is_active),
            role_id: String(local.role_id || '')
          },
          row
        )
        if (keep.password_hash) row = { ...row, password_hash: keep.password_hash }
      }
    }
    if (local && !isRemoteNewer(String(row.updated_at || ''), String(local.updated_at || ''))) {
      if (
        table === 'users' &&
        row.password_hash &&
        String(row.password_hash) !== String(local.password_hash) &&
        !isQueued('users', String(id))
      ) {
        db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(row.password_hash, id)
      }
      return
    }
    try {
      upsertRow(db, table, pk, row)
    } catch (err) {
      if (!isUniqueConflict(err)) throw err
      const again = findLocalIdByNaturalKey(table, row)
      if (!again || String(again) === String(id)) throw err
      adoptRemoteId(table, again, String(id))
      upsertRow(db, table, pk, row)
    }
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
