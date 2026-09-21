import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { expertHearingSchema, parseSchema } from '@shared/schemas'
import { clampPageSize, pageKind, pickSort, sqlDir } from '../db/queryLimits'
import { casePrintJoinSql, casePrintSelectSql, enrichPrintRow, enrichPrintRows } from './printCaseFields'

export function listExpertHearings(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('e')}`
  if (query.search) {
    const s = `%${query.search}%`
    where += ` AND (cs.title LIKE ? OR cs.case_number LIKE ? OR cl.full_name LIKE ? OR e.expert_name LIKE ? OR e.expert_office LIKE ?)`
    params.push(s, s, s, s, s)
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
  const order = pickSort(
    query.sortBy,
    {
      hearing_date: 'e.hearing_date',
      expert_name: 'e.expert_name',
      expert_office: 'e.expert_office',
      case_number: 'cs.case_number',
      status: 'e.status'
    },
    'e.hearing_date DESC, e.hearing_time DESC'
  )
  const dir = query.sortBy ? ` ${sqlDir(query.sortDir)}` : ''
  const rows = db
    .prepare(
      `SELECT e.id, e.case_id, e.hearing_date, e.hearing_time, e.expert_office, e.expert_name, e.floor, e.hall,
              e.previous_action, e.current_action, e.notes, e.lawyer_id, e.status,
              ${casePrintSelectSql('cs')},
              cl.full_name as client_name,
              l.full_name as lawyer_name
       FROM expert_hearings e
       ${casePrintJoinSql('e.case_id')}
       LEFT JOIN clients cl ON cl.id = cs.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = e.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY ${order}${dir} LIMIT ? OFFSET ?`
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
        id, case_id, hearing_date, hearing_time, expert_office, expert_name, floor, hall,
        previous_action, current_action, notes, lawyer_id, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    caseId,
    data.hearing_date,
    data.hearing_time ?? null,
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
  audit(actor, 'create', 'expert_hearings', id, `تم إنشاء جلسة خبير بتاريخ ${data.hearing_date}`)
  return { id }
}

export function updateExpertHearing(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(expertHearingSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT id FROM expert_hearings WHERE id = ? AND ${notDeleted()}`).get(id)
  if (!old) throw new Error('جلسة الخبير غير موجودة')
  db.prepare(
    `UPDATE expert_hearings SET case_id=?, hearing_date=?, hearing_time=?, expert_office=?, expert_name=?, floor=?, hall=?,
      previous_action=?, current_action=?, notes=?, lawyer_id=?, status=?, updated_at=? WHERE id=?`
  ).run(
    asId(data.case_id),
    data.hearing_date,
    data.hearing_time ?? null,
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
  audit(actor, 'update', 'expert_hearings', id, `تم تعديل جلسة خبير رقم ${id}`)
  return { id }
}

export function removeExpertHearing(actor: AuthedUser, id: string) {
  softDelete('expert_hearings', id)
  audit(actor, 'delete', 'expert_hearings', id, `تم حذف جلسة خبير رقم ${id}`)
}
