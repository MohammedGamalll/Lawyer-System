import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { newId, notDeleted } from '../db/ids'
import { recordLocalChange } from '../sync/queue'

export function listLookups(kind: string): { value: string }[] {
  if (!kind) return []
  return getDb()
    .prepare(
      `SELECT value FROM lookup_values WHERE kind = ? AND ${notDeleted()} ORDER BY value COLLATE NOCASE`
    )
    .all(kind) as { value: string }[]
}

export function rememberLookup(kind: string, raw?: unknown): void {
  const value = String(raw ?? '').trim()
  if (!kind || !value) return
  const db = getDb()
  const row = db
    .prepare(`SELECT id, deleted_at FROM lookup_values WHERE kind = ? AND value = ?`)
    .get(kind, value) as { id: string; deleted_at: string | null } | undefined
  const ts = nowIso()
  if (row) {
    if (row.deleted_at) {
      db.prepare('UPDATE lookup_values SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(ts, row.id)
      recordLocalChange('lookup_values', row.id, 'UPDATE')
    }
    return
  }
  const id = newId()
  db.prepare('INSERT INTO lookup_values (id, kind, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    kind,
    value,
    ts,
    ts
  )
  recordLocalChange('lookup_values', id, 'INSERT')
}
