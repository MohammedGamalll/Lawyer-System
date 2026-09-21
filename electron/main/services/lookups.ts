import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { newId, notDeleted } from '../db/ids'
import { recordLocalChange } from '../sync/queue'

export function listLookups(kind: string): { value: string }[] {
  if (!kind) return []
  return getDb()
    .prepare(
      `SELECT value FROM lookup_values WHERE kind = ? AND ${notDeleted()} ORDER BY IFNULL(sort_order, 0), value COLLATE NOCASE`
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
  const max = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) as m FROM lookup_values WHERE kind = ? AND ${notDeleted()}`
    )
    .get(kind) as { m: number }
  db.prepare(
    'INSERT INTO lookup_values (id, kind, value, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, kind, value, Number(max?.m ?? -1) + 1, ts, ts)
  recordLocalChange('lookup_values', id, 'INSERT')
}

export function updateLookup(kind: string, oldRaw: unknown, newRaw: unknown): void {
  const from = String(oldRaw ?? '').trim()
  const to = String(newRaw ?? '').trim()
  if (!kind || !from || !to) throw new Error('قيمة غير صالحة')
  if (from === to) return
  const db = getDb()
  const row = db
    .prepare(`SELECT id FROM lookup_values WHERE kind = ? AND value = ? AND ${notDeleted()}`)
    .get(kind, from) as { id: string } | undefined
  if (!row) throw new Error('العنصر غير موجود في القائمة')
  const clash = db
    .prepare(`SELECT id FROM lookup_values WHERE kind = ? AND value = ? AND ${notDeleted()}`)
    .get(kind, to) as { id: string } | undefined
  const ts = nowIso()
  if (clash) {
    db.prepare('UPDATE lookup_values SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id)
    recordLocalChange('lookup_values', row.id, 'UPDATE')
    return
  }
  db.prepare('UPDATE lookup_values SET value = ?, updated_at = ? WHERE id = ?').run(to, ts, row.id)
  recordLocalChange('lookup_values', row.id, 'UPDATE')
}

export function reorderLookup(kind: string, raw: unknown, dirRaw: unknown): void {
  const value = String(raw ?? '').trim()
  const dir = String(dirRaw ?? '') === 'down' ? 'down' : 'up'
  if (!kind || !value) return
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, value FROM lookup_values WHERE kind = ? AND ${notDeleted()} ORDER BY IFNULL(sort_order, 0), value COLLATE NOCASE`
    )
    .all(kind) as { id: string; value: string }[]
  const i = rows.findIndex((r) => r.value === value)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= rows.length) return
  const swapped = [...rows]
  const tmp = swapped[i]
  swapped[i] = swapped[j]
  swapped[j] = tmp
  const ts = nowIso()
  const upd = db.prepare('UPDATE lookup_values SET sort_order = ?, updated_at = ? WHERE id = ?')
  const tx = db.transaction(() => {
    swapped.forEach((r, idx) => {
      upd.run(idx, ts, r.id)
      recordLocalChange('lookup_values', r.id, 'UPDATE')
    })
  })
  tx()
}

export function removeLookup(kind: string, raw?: unknown): void {
  const value = String(raw ?? '').trim()
  if (!kind || !value) throw new Error('قيمة غير صالحة')
  const db = getDb()
  const row = db
    .prepare(`SELECT id FROM lookup_values WHERE kind = ? AND value = ? AND ${notDeleted()}`)
    .get(kind, value) as { id: string } | undefined
  if (!row) throw new Error('العنصر غير موجود في القائمة')
  const ts = nowIso()
  db.prepare('UPDATE lookup_values SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id)
  recordLocalChange('lookup_values', row.id, 'UPDATE')
}
