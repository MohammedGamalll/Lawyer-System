import { getDb } from '../db/database'
import { newId } from '../db/ids'
import { SYNC_TABLES } from '../db/schema'
import { isRemoteWrite } from './origin'
import { nowIso } from '../utils/time'

const SYNC_SET = new Set<string>(SYNC_TABLES)

export type SyncOp = 'INSERT' | 'UPDATE' | 'DELETE'

export function pkColumn(tableName: string): string {
  if (tableName === 'settings') return 'key'
  if (tableName === 'number_sequences') return 'name'
  return 'id'
}

export function enqueue(tableName: string, recordId: string, operation: SyncOp, payload: unknown): void {
  if (isRemoteWrite()) return
  if (!SYNC_SET.has(tableName) || !recordId) return
  const db = getDb()
  db.prepare(
    `INSERT INTO local_sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (?,?,?,?,?,?)`
  ).run(newId(), tableName, recordId, operation, JSON.stringify(payload ?? {}), Date.now())
}

/** Local IPC writes only. Remote apply must never call this. */
export function recordLocalChange(tableName: string, recordId: string, operation: SyncOp): void {
  if (isRemoteWrite()) return
  if (!SYNC_SET.has(tableName) || !recordId) return
  const db = getDb()
  const pk = pkColumn(tableName)
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE ${pk} = ?`).get(recordId)
  enqueue(tableName, recordId, operation, row || { [pk]: recordId, deleted_at: nowIso() })
}

export const touchAndQueue = recordLocalChange

export function listQueue(limit = 50) {
  const tableOrder = SYNC_TABLES.map((name, i) => `WHEN '${name}' THEN ${i}`).join(' ')
  return getDb()
    .prepare(
      `SELECT * FROM local_sync_queue
       ORDER BY CASE table_name ${tableOrder} ELSE 999 END, created_at ASC
       LIMIT ?`
    )
    .all(limit) as {
    id: string
    table_name: string
    record_id: string
    operation: SyncOp
    payload: string
    created_at: number
  }[]
}

export function removeQueueItem(id: string): void {
  getDb().prepare('DELETE FROM local_sync_queue WHERE id = ?').run(id)
}

export function pendingCount(): number {
  return (getDb().prepare('SELECT COUNT(*) as c FROM local_sync_queue').get() as { c: number }).c
}

export function isQueued(tableName: string, recordId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 as x FROM local_sync_queue WHERE table_name = ? AND record_id = ?')
    .get(tableName, recordId) as { x: number } | undefined
  return Boolean(row)
}

export function enqueueIfAbsent(tableName: string, recordId: string, operation: SyncOp = 'UPDATE'): void {
  if (!recordId || isQueued(tableName, recordId)) return
  recordLocalChange(tableName, recordId, operation)
}

const PARENT_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_permissions',
  'settings',
  'number_sequences',
  'case_types',
  'cashboxes',
  'expense_categories'
] as const

let parentsBootstrapped = false

function catalogAlreadyPushed(): boolean {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = 'sync_parents_bootstrapped'`)
    .get() as { value: string } | undefined
  return row?.value === '1'
}

function markCatalogPushed(): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('sync_parents_bootstrapped', '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`
    )
    .run(nowIso())
}

export function enqueueParentSnapshot(): number {
  if (parentsBootstrapped || catalogAlreadyPushed()) {
    parentsBootstrapped = true
    return 0
  }
  parentsBootstrapped = true
  const db = getDb()
  let n = 0
  for (const table of PARENT_TABLES) {
    const pk = pkColumn(table)
    const rows = db.prepare(`SELECT ${pk} as id FROM ${table} WHERE deleted_at IS NULL`).all() as { id: string }[]
    for (const row of rows) {
      if (!row.id || String(row.id).startsWith('sync_')) continue
      if (isQueued(table, row.id)) continue
      recordLocalChange(table, row.id, 'UPDATE')
      n += 1
    }
  }
  markCatalogPushed()
  return n
}

export function softDelete(tableName: string, recordId: string): void {
  const ts = nowIso()
  const pk = pkColumn(tableName)
  getDb()
    .prepare(`UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE ${pk} = ? AND deleted_at IS NULL`)
    .run(ts, ts, recordId)
  recordLocalChange(tableName, recordId, 'DELETE')
}
