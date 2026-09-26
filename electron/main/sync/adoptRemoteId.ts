import { getDb } from '../db/database'
import { isRemoteNewer } from './conflicts'
import { isQueued } from './queue'

export const NATURAL_KEY: Record<string, string[]> = {
  roles: ['code'],
  permissions: ['code'],
  users: ['username'],
  lookup_values: ['kind', 'value'],
  role_permissions: ['role_id', 'permission_id'],
  user_permissions: ['user_id', 'permission_id']
}

const USER_ID_COLUMNS = new Set(['user_id', 'created_by', 'assignee_id', 'responsible_user_id'])

export function isUniqueConflict(err: unknown): boolean {
  const rec = err as { message?: string; code?: string } | null
  const msg = String(rec?.message || err || '').toLowerCase()
  return rec?.code === '23505' || msg.includes('unique') || msg.includes('duplicate key')
}

export function naturalKeyOf(
  table: string,
  row: Record<string, unknown>
): { columns: string[]; values: string[] } | null {
  const columns = NATURAL_KEY[table]
  if (!columns?.length) return null
  const values = columns.map((c) => String(row[c] ?? '').trim())
  if (values.some((v) => !v)) return null
  return { columns, values }
}

function listUserTables(): string[] {
  return (
    getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
  ).map((r) => r.name)
}

function tableColumns(table: string): Set<string> {
  return new Set(
    (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  )
}

export function referencesTo(pkTable: string): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = []
  const seen = new Set<string>()
  for (const table of listUserTables()) {
    const fks = getDb().prepare(`PRAGMA foreign_key_list(${table})`).all() as {
      table: string
      from: string
      to: string
    }[]
    for (const fk of fks) {
      if (fk.table === pkTable && (fk.to === 'id' || !fk.to)) {
        const key = `${table}.${fk.from}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ table, column: fk.from })
      }
    }
    if (pkTable === 'users') {
      const cols = tableColumns(table)
      for (const column of USER_ID_COLUMNS) {
        if (!cols.has(column)) continue
        const key = `${table}.${column}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ table, column })
      }
    }
    if (pkTable === 'roles' && tableColumns(table).has('role_id')) {
      const key = `${table}.role_id`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ table, column: 'role_id' })
      }
    }
    if (pkTable === 'permissions' && tableColumns(table).has('permission_id')) {
      const key = `${table}.permission_id`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ table, column: 'permission_id' })
      }
    }
  }
  return out
}

function replaceIdDeep(value: unknown, localId: string, remoteId: string): unknown {
  if (value === localId) return remoteId
  if (Array.isArray(value)) return value.map((v) => replaceIdDeep(v, localId, remoteId))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceIdDeep(v, localId, remoteId)
    }
    return out
  }
  return value
}

function rewriteQueueIds(table: string, localId: string, remoteId: string): void {
  const db = getDb()
  const items = db.prepare('SELECT id, table_name, record_id, payload FROM local_sync_queue').all() as {
    id: string
    table_name: string
    record_id: string
    payload: string
  }[]
  for (const item of items) {
    let recordId = item.record_id
    let payload = item.payload
    let changed = false
    if (item.table_name === table && recordId === localId) {
      recordId = remoteId
      changed = true
    }
    if (payload.includes(localId)) {
      try {
        payload = JSON.stringify(replaceIdDeep(JSON.parse(payload), localId, remoteId))
        changed = true
      } catch {
        payload = payload.split(localId).join(remoteId)
        changed = true
      }
    }
    if (!changed) continue
    db.prepare('DELETE FROM local_sync_queue WHERE table_name = ? AND record_id = ? AND id != ?').run(
      item.table_name,
      recordId,
      item.id
    )
    db.prepare('UPDATE local_sync_queue SET record_id = ?, payload = ? WHERE id = ?').run(recordId, payload, item.id)
  }
}

function mergeLocalOntoRemote(table: string, localId: string, remoteId: string): void {
  if (table !== 'users') return
  const db = getDb()
  const localRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(localId) as
    | { password_hash: string; updated_at?: string }
    | undefined
  const remoteRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(remoteId) as
    | { password_hash: string; updated_at?: string }
    | undefined
  if (!localRow || !remoteRow) return
  const queued = isQueued('users', localId) || isQueued('users', remoteId)
  const localNewer = !isRemoteNewer(String(remoteRow.updated_at || ''), String(localRow.updated_at || ''))
  if (!queued && !localNewer) return
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    localRow.password_hash,
    localRow.updated_at || remoteRow.updated_at,
    remoteId
  )
}

/** Point local row + FKs + queue at the remote primary key. Never changes the remote id. */
export function adoptRemoteId(table: string, localId: string, remoteId: string): void {
  if (!table || !localId || !remoteId || localId === remoteId) return
  const db = getDb()
  const local = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(localId) as { id: string } | undefined
  if (!local) return
  const remoteHere = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(remoteId) as { id: string } | undefined
  const refs = referencesTo(table)
  db.pragma('foreign_keys = OFF')
  try {
    for (const ref of refs) {
      if (!tableColumns(ref.table).has(ref.column)) continue
      db.prepare(`UPDATE ${ref.table} SET ${ref.column} = ? WHERE ${ref.column} = ?`).run(remoteId, localId)
    }
    if (remoteHere) {
      mergeLocalOntoRemote(table, localId, remoteId)
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(localId)
    } else {
      db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).run(remoteId, localId)
    }
    rewriteQueueIds(table, localId, remoteId)
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

export function findLocalIdByNaturalKey(table: string, row: Record<string, unknown>): string | null {
  const key = naturalKeyOf(table, row)
  if (!key) return null
  const where = key.columns.map((c) => `${c} = ?`).join(' AND ')
  const found = getDb()
    .prepare(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`)
    .get(...key.values) as { id: string } | undefined
  return found?.id || null
}
