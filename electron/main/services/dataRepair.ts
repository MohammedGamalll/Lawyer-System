import type Database from 'better-sqlite3'
import { archiveCaseRecnoFromHex } from '@shared/archiveMigrate'
import { getDb } from '../db/database'
import { newId, notDeleted } from '../db/ids'
import { nowIso } from '../utils/time'
import { recordLocalChange } from '../sync/queue'
import { audit } from './audit'
import type { AuthedUser } from '../ipc/helpers'

type Db = Database.Database

const CLIENT_ID_TABLES = [
  'cases',
  'case_clients',
  'client_contacts',
  'documents',
  'payments',
  'expenses',
  'invoices',
  'receipts',
  'appointments',
  'tasks',
  'reminders',
  'contracts',
  'power_of_attorney',
  'consultations',
  'correspondence'
] as const

function tableExists(db: Db, name: string): boolean {
  return Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name)
  )
}

function tableCols(db: Db, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set()
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function extractHexFromPayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload)
  const prefer = keys.find((k) => /hex|هكس|الرمز/i.test(k))
  if (prefer) return String(payload[prefer] ?? '').trim()
  for (const v of Object.values(payload)) {
    const s = String(v ?? '').trim()
    if (/^[0-9A-Fa-f]{3,8}$/.test(s)) return s
    if (/^\d+\s+[0-9A-Fa-f]{3,8}$/.test(s)) return s
  }
  return ''
}

function officeFromFile(file: string): string {
  if (/mas001/i.test(file)) return 'Mas001'
  if (/mas002/i.test(file)) return 'Mas002'
  return 'Mas002'
}

function count(db: Db, sql: string, params: unknown[] = []): number {
  return Number((db.prepare(sql).get(...params) as { c?: number } | undefined)?.c || 0)
}

export type OfficeAudit = {
  orphanTitleCases: number
  orphanTitleHearings: number
  danglingHearings: number
  legacyHearingOrphans: number
  sampleHex: {
    hearingId: string | null
    sourceFile: string
    hearingRecno: number
    hex: string
    decodedRecno: number | null
    mappedCaseId: string | null
  }[]
  case512: {
    id: string
    case_number: string
    is_archived: number
    hearing_count: number
    first_instance_number: string | null
    office_case_number: string | null
  }[]
  nameDupes: { name: string; count: number }[]
  primaryMismatch: number
}

function resolveCaseId(db: Db, office: string, recno: number): string | null {
  if (tableExists(db, 'archive_migration_map')) {
    const keys = [`case:${office}:${recno}`, `cases:${office}:${recno}`, `${office}:${recno}`]
    for (const key of keys) {
      const hit = db
        .prepare(`SELECT live_id FROM archive_migration_map WHERE archive_key = ?`)
        .get(key) as { live_id: string } | undefined
      if (hit?.live_id) return hit.live_id
    }
  }
  if (tableExists(db, 'legacy_import_rows')) {
    const hit = db
      .prepare(
        `SELECT mapped_id FROM legacy_import_rows
         WHERE mapped_table = 'cases' AND mapped_id IS NOT NULL
           AND source_row = ?
           AND (source_file LIKE '%CASES1%' OR source_file LIKE '%Cases1%' OR entity_hint = 'case')
         LIMIT 1`
      )
      .get(recno) as { mapped_id: string } | undefined
    if (hit?.mapped_id) return hit.mapped_id
  }
  return null
}

export function auditOfficeData(): OfficeAudit {
  const db = getDb()
  const orphanTitleCases = count(
    db,
    `SELECT COUNT(*) as c FROM cases WHERE ${notDeleted()} AND title LIKE 'قضية غير مربوطة%'`
  )
  const orphanTitleHearings = count(
    db,
    `SELECT COUNT(*) as c FROM hearings h
     JOIN cases c ON c.id = h.case_id
     WHERE ${notDeleted('h')} AND ${notDeleted('c')} AND c.title LIKE 'قضية غير مربوطة%'`
  )
  const danglingHearings = count(
    db,
    `SELECT COUNT(*) as c FROM hearings h
     LEFT JOIN cases c ON c.id = h.case_id AND ${notDeleted('c')}
     WHERE ${notDeleted('h')} AND c.id IS NULL`
  )
  const legacyHearingOrphans = tableExists(db, 'legacy_import_rows')
    ? count(
        db,
        `SELECT COUNT(*) as c FROM legacy_import_rows
         WHERE mapped_table = 'hearings' AND link_status = 'orphan'`
      )
    : 0

  const sampleHex: OfficeAudit['sampleHex'] = []
  if (tableExists(db, 'legacy_import_rows')) {
    const rows = db
      .prepare(
        `SELECT mapped_id, source_file, source_row, payload_json
         FROM legacy_import_rows
         WHERE mapped_table = 'hearings' AND link_status = 'orphan'
         LIMIT 8`
      )
      .all() as { mapped_id: string | null; source_file: string; source_row: number; payload_json: string }[]
    for (const row of rows) {
      const payload = payloadObject(row.payload_json)
      const hex = extractHexFromPayload(payload)
      const decoded = archiveCaseRecnoFromHex(hex, row.source_row)
      const office = officeFromFile(row.source_file)
      sampleHex.push({
        hearingId: row.mapped_id,
        sourceFile: row.source_file,
        hearingRecno: row.source_row,
        hex,
        decodedRecno: decoded,
        mappedCaseId: decoded ? resolveCaseId(db, office, decoded) : null
      })
    }
  }

  const case512 = db
    .prepare(
      `SELECT c.id, c.case_number, c.is_archived, c.first_instance_number, c.office_case_number,
              (SELECT COUNT(*) FROM hearings h WHERE h.case_id = c.id AND ${notDeleted('h')}) as hearing_count
       FROM cases c
       WHERE ${notDeleted('c')} AND (
         CAST(REPLACE(REPLACE(IFNULL(c.case_number,''), 'CS-', ''), 'cs-', '') AS INTEGER) = 512
         OR CAST(IFNULL(c.first_instance_number,'') AS INTEGER) = 512
         OR CAST(IFNULL(c.office_case_number,'') AS INTEGER) = 512
       )
       LIMIT 20`
    )
    .all() as OfficeAudit['case512']

  const nameDupes = db
    .prepare(
      `SELECT full_name as name, COUNT(*) as count
       FROM clients
       WHERE ${notDeleted()} AND TRIM(IFNULL(full_name,'')) != ''
       GROUP BY full_name
       HAVING COUNT(*) > 1
       ORDER BY count DESC, full_name
       LIMIT 20`
    )
    .all() as OfficeAudit['nameDupes']

  const primaryMismatch = count(
    db,
    `SELECT COUNT(*) as c FROM cases c
     WHERE ${notDeleted('c')}
       AND IFNULL(c.client_id,'') != ''
       AND NOT EXISTS (
         SELECT 1 FROM case_clients x
         WHERE x.case_id = c.id AND x.client_id = c.client_id AND x.is_primary = 1 AND ${notDeleted('x')}
       )`
  )

  return {
    orphanTitleCases,
    orphanTitleHearings,
    danglingHearings,
    legacyHearingOrphans,
    sampleHex,
    case512,
    nameDupes,
    primaryMismatch
  }
}

export function relinkOrphanHearings(apply: boolean): {
  scanned: number
  wouldRelink: number
  relinked: number
  skipped: number
} {
  const db = getDb()
  if (!tableExists(db, 'legacy_import_rows')) {
    return { scanned: 0, wouldRelink: 0, relinked: 0, skipped: 0 }
  }
  const rows = db
    .prepare(
      `SELECT mapped_id, source_file, source_row, payload_json
       FROM legacy_import_rows
       WHERE mapped_table = 'hearings' AND IFNULL(mapped_id,'') != ''
         AND (link_status = 'orphan' OR link_status IS NULL)`
    )
    .all() as { mapped_id: string; source_file: string; source_row: number; payload_json: string }[]

  let wouldRelink = 0
  let relinked = 0
  let skipped = 0
  const ts = nowIso()
  const updHearing = apply
    ? db.prepare(`UPDATE hearings SET case_id = ?, updated_at = ? WHERE id = ? AND ${notDeleted()}`)
    : null
  const updLegacy = apply
    ? db.prepare(`UPDATE legacy_import_rows SET link_status = 'linked' WHERE mapped_id = ? AND mapped_table = 'hearings'`)
    : null

  if (apply) db.exec('BEGIN')
  try {
    for (const row of rows) {
      const payload = payloadObject(row.payload_json)
      const hex = extractHexFromPayload(payload)
      const decoded = archiveCaseRecnoFromHex(hex, row.source_row)
      if (!decoded) {
        skipped += 1
        continue
      }
      const caseId = resolveCaseId(db, officeFromFile(row.source_file), decoded)
      if (!caseId) {
        skipped += 1
        continue
      }
      const current = db
        .prepare(`SELECT case_id FROM hearings WHERE id = ? AND ${notDeleted()}`)
        .get(row.mapped_id) as { case_id: string } | undefined
      if (!current) {
        skipped += 1
        continue
      }
      if (current.case_id === caseId) {
        skipped += 1
        continue
      }
      wouldRelink += 1
      if (apply && updHearing && updLegacy) {
        updHearing.run(caseId, ts, row.mapped_id)
        updLegacy.run(row.mapped_id)
        recordLocalChange('hearings', row.mapped_id, 'UPDATE')
        relinked += 1
      }
    }
    if (apply) db.exec('COMMIT')
  } catch (err) {
    if (apply) db.exec('ROLLBACK')
    throw err
  }

  return { scanned: rows.length, wouldRelink, relinked: apply ? relinked : 0, skipped }
}

export function normalizePrimaryCaseClients(apply: boolean): { wouldFix: number; fixed: number } {
  const db = getDb()
  const cases = db
    .prepare(`SELECT id, client_id FROM cases WHERE ${notDeleted()} AND IFNULL(client_id,'') != ''`)
    .all() as { id: string; client_id: string }[]
  const ts = nowIso()
  let wouldFix = 0
  let fixed = 0
  if (apply) db.exec('BEGIN')
  try {
    for (const row of cases) {
      const links = db
        .prepare(
          `SELECT id, client_id, is_primary FROM case_clients WHERE case_id = ? AND ${notDeleted()}`
        )
        .all(row.id) as { id: string; client_id: string; is_primary: number }[]
      const primary = links.filter((l) => l.is_primary === 1)
      const keepLink = links.find((l) => l.client_id === row.client_id)
      const needs =
        !keepLink || primary.length !== 1 || primary[0]?.client_id !== row.client_id
      if (!needs) continue
      wouldFix += 1
      if (!apply) continue
      if (!keepLink) {
        db.prepare(
          `INSERT INTO case_clients (id, case_id, client_id, is_primary, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, 1, 0, ?, ?)`
        ).run(newId(), row.id, row.client_id, ts, ts)
      }
      for (const link of links) {
        const next = link.client_id === row.client_id ? 1 : 0
        if (link.is_primary !== next) {
          db.prepare(`UPDATE case_clients SET is_primary = ?, updated_at = ? WHERE id = ?`).run(next, ts, link.id)
          recordLocalChange('case_clients', link.id, 'UPDATE')
        }
      }
      if (!keepLink) {
        const created = db
          .prepare(`SELECT id FROM case_clients WHERE case_id = ? AND client_id = ? AND ${notDeleted()}`)
          .get(row.id, row.client_id) as { id: string }
        recordLocalChange('case_clients', created.id, 'INSERT')
      }
      fixed += 1
    }
    if (apply) db.exec('COMMIT')
  } catch (err) {
    if (apply) db.exec('ROLLBACK')
    throw err
  }
  return { wouldFix, fixed: apply ? fixed : 0 }
}

export function mergeClientsByChoice(actor: AuthedUser, keepId: string, dupId: string): { merged: string } {
  const db = getDb()
  if (!keepId || !dupId || keepId === dupId) throw new Error('اختر موكلين مختلفين للدمج')
  const keep = db.prepare(`SELECT * FROM clients WHERE id = ? AND ${notDeleted()}`).get(keepId) as
    | Record<string, unknown>
    | undefined
  const dup = db.prepare(`SELECT * FROM clients WHERE id = ? AND ${notDeleted()}`).get(dupId) as
    | Record<string, unknown>
    | undefined
  if (!keep || !dup) throw new Error('الموكل غير موجود')
  const ts = nowIso()
  const fillable = [
    'phone',
    'phone2',
    'whatsapp',
    'email',
    'address',
    'governorate',
    'district',
    'profession',
    'notes',
    'birth_date',
    'national_id'
  ]
  db.exec('BEGIN')
  try {
    for (const key of fillable) {
      if (!String(keep[key] ?? '').trim() && String(dup[key] ?? '').trim()) {
        db.prepare(`UPDATE clients SET ${key} = ?, updated_at = ? WHERE id = ?`).run(dup[key], ts, keepId)
        keep[key] = dup[key]
      }
    }
    if (tableCols(db, 'case_clients').has('client_id')) {
      const links = db
        .prepare(`SELECT id, case_id FROM case_clients WHERE client_id = ? AND ${notDeleted()}`)
        .all(dupId) as { id: string; case_id: string }[]
      for (const link of links) {
        const other = db
          .prepare(
            `SELECT id FROM case_clients WHERE case_id = ? AND client_id = ? AND ${notDeleted()}`
          )
          .get(link.case_id, keepId) as { id: string } | undefined
        if (other) {
          db.prepare(`UPDATE case_clients SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, link.id)
          recordLocalChange('case_clients', link.id, 'UPDATE')
        } else {
          db.prepare(`UPDATE case_clients SET client_id = ?, updated_at = ? WHERE id = ?`).run(keepId, ts, link.id)
          recordLocalChange('case_clients', link.id, 'UPDATE')
        }
      }
    }
    for (const table of CLIENT_ID_TABLES) {
      if (table === 'case_clients') continue
      if (!tableCols(db, table).has('client_id')) continue
      const ids = db
        .prepare(`SELECT id FROM ${table} WHERE client_id = ?`)
        .all(dupId) as { id: string }[]
      db.prepare(`UPDATE ${table} SET client_id = ?, updated_at = ? WHERE client_id = ?`).run(keepId, ts, dupId)
      for (const r of ids) recordLocalChange(table, r.id, 'UPDATE')
    }
    db.prepare(`UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, dupId)
    recordLocalChange('clients', keepId, 'UPDATE')
    recordLocalChange('clients', dupId, 'UPDATE')
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  audit(actor, 'update', 'clients', keepId, `دمج الموكل ${dupId} في ${keepId}`)
  normalizePrimaryCaseClients(true)
  return { merged: keepId }
}
