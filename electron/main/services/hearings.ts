import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { hearingSchema, parseSchema } from '@shared/schemas'

export function listHearings(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (query.search) {
    where += ` AND (cs.title LIKE ? OR cs.case_number LIKE ? OR cl.full_name LIKE ?)`
    const s = `%${query.search}%`
    params.push(s, s, s)
  }
  const f = query.filters ?? {}
  if (f.status) {
    where += ' AND h.status = ?'
    params.push(f.status)
  }
  if (f.date_from) {
    where += ' AND h.hearing_date >= ?'
    params.push(f.date_from)
  }
  if (f.date_to) {
    where += ' AND h.hearing_date <= ?'
    params.push(f.date_to)
  }
  if (f.case_id) {
    where += ' AND h.case_id = ?'
    params.push(f.case_id)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT h.*, cs.title as case_title, cs.case_number, cs.court, cs.circuit, cl.full_name as client_name,
              l.full_name as lawyer_name
       FROM hearings h
       JOIN cases cs ON cs.id = h.case_id
       JOIN clients cl ON cl.id = cs.client_id
       LEFT JOIN lawyers l ON l.id = h.lawyer_id
       ${where} ORDER BY h.hearing_date DESC, h.hearing_time DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getHearing(id: number) {
  const row = getDb()
    .prepare(
      `SELECT h.*, cs.title as case_title, cs.case_number, cl.full_name as client_name
       FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id WHERE h.id = ?`
    )
    .get(id)
  if (!row) throw new Error('الجلسة غير موجودة')
  return row
}

function attachHearingReminder(hearingId: number, caseId: number, date: string, time?: string | null) {
  const cs = getDb().prepare('SELECT title, case_number, client_id FROM cases WHERE id = ?').get(caseId) as {
    title: string
    case_number: string
    client_id: number
  }
  const remindAt = `${date}T${time || '09:00'}:00`
  createReminder({
    reminder_type: 'hearing',
    title: `جلسة القضية ${cs.case_number} — ${cs.title}`,
    remind_at: remindAt,
    notify_before_minutes: 1440,
    case_id: caseId,
    client_id: cs.client_id,
    related_type: 'hearing',
    related_id: hearingId
  })
}

export function createHearing(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(hearingSchema, data) as Record<string, unknown>
  const caseId = Number(data.case_id)
  if (!caseId) throw new Error('لا يمكن إنشاء جلسة بدون قضية')
  if (!data.hearing_date) throw new Error('تاريخ الجلسة مطلوب')
  const db = getDb()
  const cs = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId)
  if (!cs) throw new Error('القضية غير موجودة')
  const ts = nowIso()
  const info = db
    .prepare(
      `INSERT INTO hearings (
        case_id, hearing_date, hearing_time, hearing_type, lawyer_id, status, result, court_decision,
        postponement_reason, next_hearing_date, what_happened, required_documents, next_actions, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      caseId,
      data.hearing_date,
      data.hearing_time ?? null,
      data.hearing_type ?? null,
      data.lawyer_id || null,
      data.status ?? 'upcoming',
      data.result ?? null,
      data.court_decision ?? null,
      data.postponement_reason ?? null,
      data.next_hearing_date ?? null,
      data.what_happened ?? null,
      data.required_documents ?? null,
      data.next_actions ?? null,
      data.notes ?? null,
      ts,
      ts
    )
  const id = Number(info.lastInsertRowid)
  attachHearingReminder(id, caseId, String(data.hearing_date), data.hearing_time as string | undefined)
  audit(actor, 'create', 'hearings', id, `تم إنشاء جلسة للقضية بتاريخ ${data.hearing_date}`)
  return { id }
}

export function updateHearing(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM hearings WHERE id = ?').get(id) as {
    case_id: number
    lawyer_id: number | null
    hearing_type: string | null
    status: string
  } | undefined
  if (!old) throw new Error('الجلسة غير موجودة')
  db.prepare(
    `UPDATE hearings SET hearing_date=?, hearing_time=?, hearing_type=?, lawyer_id=?, status=?, result=?,
      court_decision=?, postponement_reason=?, next_hearing_date=?, what_happened=?, required_documents=?,
      next_actions=?, notes=?, updated_at=? WHERE id=?`
  ).run(
    data.hearing_date,
    data.hearing_time ?? null,
    data.hearing_type ?? null,
    data.lawyer_id || null,
    data.status ?? 'upcoming',
    data.result ?? null,
    data.court_decision ?? null,
    data.postponement_reason ?? null,
    data.next_hearing_date ?? null,
    data.what_happened ?? null,
    data.required_documents ?? null,
    data.next_actions ?? null,
    data.notes ?? null,
    nowIso(),
    id
  )
  if (data.status === 'postponed' && data.next_hearing_date && old.status !== 'postponed') {
    createHearing(actor, {
      case_id: old.case_id,
      hearing_date: data.next_hearing_date,
      hearing_time: data.hearing_time,
      hearing_type: old.hearing_type,
      lawyer_id: old.lawyer_id,
      status: 'upcoming'
    })
  }
  audit(actor, 'update', 'hearings', id, `تم تعديل الجلسة رقم ${id}`, old, data)
  return { id }
}

export function postponeHearing(actor: AuthedUser, id: number, nextDate: string, nextTime?: string, reason?: string) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM hearings WHERE id = ?').get(id) as {
    case_id: number
    lawyer_id: number | null
    hearing_type: string | null
  } | undefined
  if (!old) throw new Error('الجلسة غير موجودة')
  if (!nextDate) throw new Error('موعد الجلسة الجديدة مطلوب')
  db.prepare(
    `UPDATE hearings SET status='postponed', postponement_reason=?, next_hearing_date=?, updated_at=? WHERE id=?`
  ).run(reason ?? null, nextDate, nowIso(), id)
  const created = createHearing(actor, {
    case_id: old.case_id,
    hearing_date: nextDate,
    hearing_time: nextTime,
    hearing_type: old.hearing_type,
    lawyer_id: old.lawyer_id,
    status: 'upcoming'
  })
  audit(actor, 'postpone', 'hearings', id, `تم تأجيل الجلسة وإنشاء جلسة جديدة بتاريخ ${nextDate}`)
  return created
}

export function removeHearing(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM hearings WHERE id = ?').run(id)
  audit(actor, 'delete', 'hearings', id, `تم حذف الجلسة رقم ${id}`)
}
