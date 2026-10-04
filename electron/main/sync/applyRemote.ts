import log from 'electron-log'
import { getDb } from '../db/database'
import { SYNC_TABLES } from '../db/schema'
import { adoptRemoteId, findLocalIdByNaturalKey, isUniqueConflict } from './adoptRemoteId'
import { onRemoteUserApplied } from './authGuard'
import { isRemoteNewer } from './conflicts'
import { runAsRemote } from './origin'
import { isQueued, pkColumn } from './queue'

const SYNC_SET = new Set<string>(SYNC_TABLES)

type ColInfo = { name: string; notnull: number; pk: number; dflt_value: unknown }

function isMissing(v: unknown): boolean {
  return v == null || v === ''
}

function isNotNullConflict(err: unknown): boolean {
  const rec = err as { message?: string } | null
  return /NOT NULL constraint failed/i.test(String(rec?.message || err || ''))
}

function prepareRemoteRow(
  db: ReturnType<typeof getDb>,
  table: string,
  incoming: Record<string, unknown>,
  local: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[]
  const allowed = new Set(info.map((c) => c.name))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (allowed.has(k)) out[k] = v
  }
  for (const col of info) {
    if (!col.notnull) continue
    if (!isMissing(out[col.name])) continue
    if (local && !isMissing(local[col.name])) {
      out[col.name] = local[col.name]
      continue
    }
    if (col.dflt_value != null) {
      delete out[col.name]
      continue
    }
    if (col.pk || !local) return null
    delete out[col.name]
  }
  return out
}

export function applyRemoteWrite(
  table: string,
  incoming: Record<string, unknown> | null,
  event: 'INSERT' | 'UPDATE' | 'DELETE'
): void {
  try {
    applyRemoteWriteInner(table, incoming, event)
  } catch (err) {
    log.warn('applyRemoteWrite failed', table, err)
  }
}

function applyRemoteWriteInner(
  table: string,
  incoming: Record<string, unknown> | null,
  event: 'INSERT' | 'UPDATE' | 'DELETE'
): void {
  if (!SYNC_SET.has(table) || !incoming) return
  let row: Record<string, unknown> = incoming
  const pk = pkColumn(table)
  const id = row[pk]
  if (id == null || id === '') return
  if (table === 'settings' && String(id).startsWith('sync_')) return
  const db = getDb()
  runAsRemote(() => {
    const twin = findLocalIdByNaturalKey(table, row)
    if (twin && String(twin) !== String(id)) adoptRemoteId(table, twin, String(id))
    const local = db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(id) as Record<string, unknown> | undefined
    if (event === 'DELETE') {
      if (local && isRemoteNewer(String(row.deleted_at || row.updated_at || ''), String(local.updated_at || ''))) {
        writePrepared(db, table, pk, row, local)
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
    writePrepared(db, table, pk, row, local)
  })
}

function writePrepared(
  db: ReturnType<typeof getDb>,
  table: string,
  pk: string,
  row: Record<string, unknown>,
  local: Record<string, unknown> | undefined
): void {
  const prepared = prepareRemoteRow(db, table, row, local)
  if (!prepared) {
    log.warn('skip remote row missing NOT NULL', table, row[pk])
    return
  }
  try {
    upsertRow(db, table, pk, prepared)
  } catch (err) {
    if (isNotNullConflict(err)) {
      log.warn('skip remote row NOT NULL', table, row[pk], err)
      return
    }
    if (/FOREIGN KEY constraint failed/i.test(String((err as { message?: string })?.message || err || ''))) {
      log.warn('skip remote row FK', table, row[pk], err)
      return
    }
    if (!isUniqueConflict(err)) throw err
    const again = findLocalIdByNaturalKey(table, prepared)
    if (!again || String(again) === String(row[pk])) throw err
    adoptRemoteId(table, again, String(row[pk]))
    upsertRow(db, table, pk, prepared)
  }
}

function upsertRow(db: ReturnType<typeof getDb>, table: string, pk: string, row: Record<string, unknown>): void {
  const cols = Object.keys(row)
  if (!cols.length) return
  const placeholders = cols.map(() => '?').join(',')
  const updates = cols.filter((c) => c !== pk)
  const sql = updates.length
    ? `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates
        .map((c) => `${c}=excluded.${c}`)
        .join(',')}`
    : `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO NOTHING`
  db.prepare(sql).run(...cols.map((c) => row[c] ?? null))
}
