import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { expertHearingSchema, parseSchema } from '@shared/schemas'
import { rememberLookup } from './lookups'
import { clampPageSize, pageKind, applyColumnFilters, orderBySql, programCodeSortSql, courtNumberSortSql } from '../db/queryLimits'
import { casePrintJoinSql, casePrintSelectSql, enrichPrintRow, enrichPrintRows } from './printCaseFields'
import { parsePostponedDate } from '@shared/hearingText'

export function listExpertHearings(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('e')}`
  if (query.search) {
    const s = `%${query.search}%`
    where += ` AND (cs.title LIKE ? OR cs.case_number LIKE ? OR cl.full_name LIKE ? OR e.expert_name LIKE ? OR e.expert_office LIKE ? OR IFNULL(e.venue,'') LIKE ?)`
    params.push(s, s, s, s, s, s)
  }
  const f = query.filters ?? {}
  if (f.case_id) {
    where += ' AND e.case_id = ?'
    params.push(f.case_id)
  }
  if (f.date_from) {
    where += ' AND e.hearing_date >= ?'
    params.push(f.date_from)
  }
  if (f.date_to) {
    where += ' AND e.hearing_date <= ?'
    params.push(f.date_to)
  }
  if (f.status) {
    where += ' AND e.status = ?'
    params.push(f.status)
  }
  if (f.venue) {
    const s = `%${String(f.venue).trim()}%`
    where += ` AND (
      IFNULL(e.venue,'') LIKE ?
      OR IFNULL(e.expert_office,'') LIKE ?
      OR IFNULL(e.expert_name,'') LIKE ?
      OR IFNULL(cs.court,'') LIKE ?
      OR IFNULL(cs.session_place,'') LIKE ?
      OR EXISTS (
        SELECT 1 FROM hearings hx
        WHERE hx.case_id = e.case_id AND ${notDeleted('hx')} AND IFNULL(hx.venue,'') LIKE ?
      )
    )`
    params.push(s, s, s, s, s, s)
  }
  where = applyColumnFilters(where, params, query.columnFilters, {
    case_number: 'cs.case_number',
    office_case_number: `(IFNULL(cs.first_instance_number,'') || IFNULL(cs.office_case_number,'') || IFNULL(cs.appeal_number,'') || IFNULL(cs.cassation_number,''))`,
    parties: `(IFNULL(cl.full_name,'') || IFNULL(cs.opponent_name,''))`,
    status: 'e.status',
    hearing_date: 'e.hearing_date',
    hearing_time: 'e.hearing_time',
    venue: 'e.venue',
    expert_office: 'e.expert_office',
    expert_name: 'e.expert_name',
    floor: 'e.floor',
    hall: 'e.hall',
    previous_action: 'e.previous_action',
    current_action: 'e.current_action'
  })
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM expert_hearings e
         LEFT JOIN cases cs ON cs.id = e.case_id AND ${notDeleted('cs')}
         LEFT JOIN clients cl ON cl.id = cs.client_id AND ${notDeleted('cl')}
         ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const order = orderBySql(
    query.sortBy,
    query.sortDir,
    {
      case_number: programCodeSortSql('cs.case_number'),
      office_case_number: courtNumberSortSql('cs'),
      parties: `(IFNULL(cl.full_name,'') || IFNULL(cs.opponent_name,'')) COLLATE NOCASE`,
      status: 'e.status',
      hearing_date: 'e.hearing_date',
      hearing_time: 'e.hearing_time',
      venue: 'e.venue COLLATE NOCASE',
      expert_office: 'e.expert_office COLLATE NOCASE',
      expert_name: 'e.expert_name COLLATE NOCASE',
      floor: 'e.floor COLLATE NOCASE',
      hall: 'e.hall COLLATE NOCASE',
      previous_action: 'e.previous_action COLLATE NOCASE',
      current_action: 'e.current_action COLLATE NOCASE'
    },
    'e.hearing_date DESC, e.hearing_time DESC'
  )
  const rows = db
    .prepare(
      `SELECT e.id, e.case_id, e.hearing_date, e.hearing_time, e.venue, e.expert_office, e.expert_name, e.floor, e.hall,
              e.previous_action, e.current_action, e.notes, e.lawyer_id, e.status,
              ${casePrintSelectSql('cs')},
              cl.full_name as client_name,
              l.full_name as lawyer_name
       FROM expert_hearings e
       ${casePrintJoinSql('e.case_id')}
       LEFT JOIN clients cl ON cl.id = cs.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = e.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows: enrichPrintRows(rows), total, page, pageSize }
}

export function getExpertHearing(id: string) {
  const row = getDb()
    .prepare(
      `SELECT e.*, ${casePrintSelectSql('cs')},
              cl.full_name as client_name, l.full_name as lawyer_name
       FROM expert_hearings e
       ${casePrintJoinSql('e.case_id')}
       LEFT JOIN clients cl ON cl.id = cs.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = e.lawyer_id AND ${notDeleted('l')}
       WHERE e.id = ? AND ${notDeleted('e')}`
    )
    .get(id)
  if (!row) throw new Error('جلسة الخبير غير موجودة')
  return enrichPrintRow(row as Record<string, unknown>)
}

export function createExpertHearing(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(expertHearingSchema, data) as Record<string, unknown>
  const caseId = asId(data.case_id)
  if (!caseId) throw new Error('لا يمكن إنشاء جلسة خبير بدون قضية')
  if (!data.hearing_date) throw new Error('تاريخ الجلسة مطلوب')
  const db = getDb()
  const cs = db.prepare(`SELECT id FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId)
  if (!cs) throw new Error('القضية غير موجودة')
  const ts = nowIso()
  const id = newId()
  db.prepare(
    `INSERT INTO expert_hearings (
        id, case_id, hearing_date, hearing_time, venue, expert_office, expert_name, floor, hall,
        previous_action, current_action, notes, lawyer_id, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    caseId,
    data.hearing_date,
    data.hearing_time ?? null,
    data.venue ?? null,
    data.expert_office ?? null,
    data.expert_name ?? null,
    data.floor ?? null,
    data.hall ?? null,
    data.previous_action ?? null,
    data.current_action ?? null,
    data.notes ?? null,
    asIdOrNull(data.lawyer_id),
    data.status ?? 'upcoming',
    ts,
    ts
  )
  recordLocalChange('expert_hearings', id, 'INSERT')
  rememberLookup('venue', data.venue)
  rememberLookup('hearing_decision', data.previous_action)
  rememberLookup('hearing_decision', data.current_action)
  const parsedNext = parsePostponedDate(
    [data.current_action, data.notes].map((v) => String(v ?? '')).join(' '),
    String(data.hearing_date)
  )
  let autoHearing = false
  if (parsedNext && parsedNext !== String(data.hearing_date)) {
    autoHearing = ensureNextExpertHearing(actor, caseId, parsedNext, {
      hearing_time: data.hearing_time as string | undefined,
      venue: (data.venue as string) || null,
      expert_office: (data.expert_office as string) || null,
      expert_name: (data.expert_name as string) || null,
      floor: (data.floor as string) || null,
      hall: (data.hall as string) || null,
      lawyer_id: asIdOrNull(data.lawyer_id),
      current_action: String(data.current_action ?? '')
    })
  }
  audit(actor, 'create', 'expert_hearings', id, `تم إنشاء جلسة خبير بتاريخ ${data.hearing_date}`)
  return { id, autoHearing }
}

export function updateExpertHearing(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(expertHearingSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT * FROM expert_hearings WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { id: string; case_id: string; hearing_date: string }
    | undefined
  if (!old) throw new Error('جلسة الخبير غير موجودة')
  db.prepare(
    `UPDATE expert_hearings SET case_id=?, hearing_date=?, hearing_time=?, venue=?, expert_office=?, expert_name=?, floor=?, hall=?,
      previous_action=?, current_action=?, notes=?, lawyer_id=?, status=?, updated_at=? WHERE id=?`
  ).run(
    asId(data.case_id),
    data.hearing_date,
    data.hearing_time ?? null,
    data.venue ?? null,
    data.expert_office ?? null,
    data.expert_name ?? null,
    data.floor ?? null,
    data.hall ?? null,
    data.previous_action ?? null,
    data.current_action ?? null,
    data.notes ?? null,
    asIdOrNull(data.lawyer_id),
    data.status ?? 'upcoming',
    nowIso(),
    id
  )
  recordLocalChange('expert_hearings', id, 'UPDATE')
  rememberLookup('venue', data.venue)
  rememberLookup('hearing_decision', data.previous_action)
  rememberLookup('hearing_decision', data.current_action)
  const parsedNext = parsePostponedDate(
    [data.current_action, data.notes].map((v) => String(v ?? '')).join(' '),
    String(data.hearing_date || old.hearing_date)
  )
  let autoHearing = false
  if (parsedNext && parsedNext !== String(data.hearing_date || old.hearing_date)) {
    autoHearing = ensureNextExpertHearing(actor, String(data.case_id || old.case_id), parsedNext, {
      hearing_time: data.hearing_time as string | undefined,
      venue: (data.venue as string) || null,
      expert_office: (data.expert_office as string) || null,
      expert_name: (data.expert_name as string) || null,
      floor: (data.floor as string) || null,
      hall: (data.hall as string) || null,
      lawyer_id: asIdOrNull(data.lawyer_id),
      current_action: String(data.current_action ?? '')
    })
  }
  audit(actor, 'update', 'expert_hearings', id, `تم تعديل جلسة خبير رقم ${id}`)
  return { id, autoHearing }
}

function ensureNextExpertHearing(
  actor: AuthedUser,
  caseId: string,
  nextDate: string,
  old: {
    hearing_time?: string
    venue?: string | null
    expert_office?: string | null
    expert_name?: string | null
    floor?: string | null
    hall?: string | null
    lawyer_id?: string | null
    current_action?: string
  }
) {
  const exists = getDb()
    .prepare(`SELECT id FROM expert_hearings WHERE case_id = ? AND hearing_date = ? AND ${notDeleted()}`)
    .get(caseId, nextDate) as { id: string } | undefined
  if (exists) return false
  createExpertHearing(actor, {
    case_id: caseId,
    hearing_date: nextDate,
    hearing_time: old.hearing_time,
    venue: old.venue,
    expert_office: old.expert_office,
    expert_name: old.expert_name,
    floor: old.floor,
    hall: old.hall,
    lawyer_id: old.lawyer_id,
    previous_action: old.current_action || undefined,
    status: 'upcoming'
  })
  return true
}

export function removeExpertHearing(actor: AuthedUser, id: string) {
  softDelete('expert_hearings', id)
  audit(actor, 'delete', 'expert_hearings', id, `تم حذف جلسة خبير رقم ${id}`)
}
