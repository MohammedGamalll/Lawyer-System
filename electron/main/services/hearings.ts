import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { hearingSchema, parseSchema } from '@shared/schemas'
import { rememberLookup } from './lookups'
import { createTask } from './schedule'
import { clampPageSize, pageKind, pickSort, sqlDir } from '../db/queryLimits'

export function listHearings(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('h')} AND ${notDeleted('cs')} AND ${notDeleted('cl')}`
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
  if (f.venue) {
    where += ' AND h.venue LIKE ?'
    params.push(`%${String(f.venue).trim()}%`)
  }
  if (f.hearing_kind === 'expert') {
    where += ` AND (h.hearing_type LIKE '%خبير%' OR h.hearing_type LIKE '%expert%')`
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const order = pickSort(query.sortBy, {
    hearing_date: 'h.hearing_date',
    hearing_type: 'h.hearing_type',
    venue: 'h.venue',
    status: 'h.status',
    case_number: 'cs.case_number',
    client_name: 'cl.full_name'
  }, 'h.hearing_date DESC, h.hearing_time DESC')
  const dir = query.sortBy ? ` ${sqlDir(query.sortDir)}` : ''
  const rows = db
    .prepare(
      `SELECT h.id, h.case_id, h.hearing_date, h.hearing_time, h.hearing_type, h.previous_decision, h.court_decision,
              h.hall, h.floor, h.venue, h.status, h.result, h.lawyer_id,
              cs.title as case_title, cs.case_number, cs.court, cs.circuit, cs.client_id, cl.full_name as client_name,
              l.full_name as lawyer_name
       FROM hearings h
       JOIN cases cs ON cs.id = h.case_id
       JOIN clients cl ON cl.id = cs.client_id
       LEFT JOIN lawyers l ON l.id = h.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY ${order}${dir} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getHearing(id: string) {
  const row = getDb()
    .prepare(
      `SELECT h.*, cs.title as case_title, cs.case_number, cl.full_name as client_name
       FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id
       WHERE h.id = ? AND ${notDeleted('h')}`
    )
    .get(id)
  if (!row) throw new Error('الجلسة غير موجودة')
  return row
}

function attachHearingReminder(hearingId: string, caseId: string, date: string, time?: string | null) {
  const cs = getDb().prepare(`SELECT title, case_number, client_id FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId) as {
    title: string
    case_number: string
    client_id: string
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
  const caseId = asId(data.case_id)
  if (!caseId) throw new Error('لا يمكن إنشاء جلسة بدون قضية')
  if (!data.hearing_date) throw new Error('تاريخ الجلسة مطلوب')
  const db = getDb()
  const cs = db.prepare(`SELECT id FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId)
  if (!cs) throw new Error('القضية غير موجودة')
  const ts = nowIso()
  const id = newId()
  db.prepare(
    `INSERT INTO hearings (
        id, case_id, hearing_date, hearing_time, hearing_type, previous_decision, hall, floor, venue, lawyer_id, status, result, court_decision,
        postponement_reason, next_hearing_date, what_happened, required_documents, next_actions, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    caseId,
    data.hearing_date,
    data.hearing_time ?? null,
    data.hearing_type ?? null,
    data.previous_decision ?? null,
    data.hall ?? null,
    data.floor ?? null,
    data.venue ?? null,
    asIdOrNull(data.lawyer_id),
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
  recordLocalChange('hearings', id, 'INSERT')
  rememberLookup('hearing_type', data.hearing_type)
  rememberLookup('venue', data.venue)
  attachHearingReminder(id, caseId, String(data.hearing_date), data.hearing_time as string | undefined)
  const blob = [data.court_decision, data.postponement_reason, data.next_hearing_date, data.result, data.notes]
    .map((v) => String(v ?? ''))
    .join(' ')
  const parsedNext =
    normalizeHearingDate(data.next_hearing_date, String(data.hearing_date)) ||
    parsePostponedDate(blob, String(data.hearing_date))
  let autoHearing = false
  if (parsedNext && parsedNext !== String(data.hearing_date)) {
    autoHearing = ensureNextHearing(
      actor,
      caseId,
      parsedNext,
      data.hearing_time as string | undefined,
      {
        lawyer_id: asIdOrNull(data.lawyer_id),
        hearing_type: (data.hearing_type as string) || null,
        venue: (data.venue as string) || null
      }
    )
  }
  const followUp = judgmentFollowUp(String(data.court_decision ?? data.result ?? blob))
  const autoTasks = migrateAdminFromHearing(actor, caseId, data)
  audit(actor, 'create', 'hearings', id, `تم إنشاء جلسة للقضية بتاريخ ${data.hearing_date}`)
  return { id, autoHearing, followUp, autoTasks }
}

export function updateHearing(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  const db = getDb()
  const old = db.prepare(`SELECT * FROM hearings WHERE id = ? AND ${notDeleted()}`).get(id) as
    | {
        case_id: string
        lawyer_id: string | null
        hearing_type: string | null
        status: string
        hearing_date: string
        court_decision?: string | null
      }
    | undefined
  if (!old) throw new Error('الجلسة غير موجودة')
  const blob = [data.court_decision, data.postponement_reason, data.next_hearing_date, data.result, data.notes]
    .map((v) => String(v ?? ''))
    .join(' ')
  const parsedNext =
    normalizeHearingDate(data.next_hearing_date, old.hearing_date) || parsePostponedDate(blob, old.hearing_date)
  let status = String(data.status ?? 'upcoming')
  if (parsedNext && parsedNext !== old.hearing_date) {
    status = 'postponed'
    data.next_hearing_date = parsedNext
  }
  db.prepare(
    `UPDATE hearings SET hearing_date=?, hearing_time=?, hearing_type=?, previous_decision=?, hall=?, floor=?, venue=?, lawyer_id=?, status=?, result=?,
      court_decision=?, postponement_reason=?, next_hearing_date=?, what_happened=?, required_documents=?,
      next_actions=?, notes=?, updated_at=? WHERE id=?`
  ).run(
    data.hearing_date,
    data.hearing_time ?? null,
    data.hearing_type ?? null,
    data.previous_decision ?? null,
    data.hall ?? null,
    data.floor ?? null,
    data.venue ?? null,
    asIdOrNull(data.lawyer_id),
    status,
    data.result ?? null,
    data.court_decision ?? null,
    data.postponement_reason ?? null,
    parsedNext || data.next_hearing_date || null,
    data.what_happened ?? null,
    data.required_documents ?? null,
    data.next_actions ?? null,
    data.notes ?? null,
    nowIso(),
    id
  )
  recordLocalChange('hearings', id, 'UPDATE')
  rememberLookup('hearing_type', data.hearing_type)
  rememberLookup('venue', data.venue)
  let autoHearing = false
  if (parsedNext && parsedNext !== old.hearing_date) {
    autoHearing = ensureNextHearing(actor, old.case_id, parsedNext, data.hearing_time as string | undefined, {
      lawyer_id: old.lawyer_id,
      hearing_type: (data.hearing_type as string) || old.hearing_type,
      venue: (data.venue as string) || null,
      court_decision: String(data.court_decision ?? old.court_decision ?? '')
    })
  }
  const followUp = judgmentFollowUp(blob)
  const autoTasks = migrateAdminFromHearing(actor, old.case_id, data)
  audit(actor, 'update', 'hearings', id, `تم تعديل الجلسة رقم ${id}`, old, data)
  return { id, autoHearing, followUp, autoTasks }
}

export function postponeHearing(actor: AuthedUser, id: string, nextDate: string, nextTime?: string, reason?: string) {
  const db = getDb()
  const old = db.prepare(`SELECT * FROM hearings WHERE id = ? AND ${notDeleted()}`).get(id) as
    | {
        case_id: string
        lawyer_id: string | null
        hearing_type: string | null
      }
    | undefined
  if (!old) throw new Error('الجلسة غير موجودة')
  if (!nextDate) throw new Error('موعد الجلسة الجديدة مطلوب')
  db.prepare(
    `UPDATE hearings SET status='postponed', postponement_reason=?, next_hearing_date=?, updated_at=? WHERE id=?`
  ).run(reason ?? null, nextDate, nowIso(), id)
  recordLocalChange('hearings', id, 'UPDATE')
  const created = ensureNextHearing(actor, old.case_id, nextDate, nextTime, old)
  audit(actor, 'postpone', 'hearings', id, `تم تأجيل الجلسة وإنشاء جلسة جديدة بتاريخ ${nextDate}`)
  return { autoHearing: Boolean(created) }
}

function ensureNextHearing(
  actor: AuthedUser,
  caseId: string,
  nextDate: string,
  nextTime: string | undefined,
  old: { lawyer_id: string | null; hearing_type: string | null; court_decision?: string | null; venue?: string | null }
) {
  const exists = getDb()
    .prepare(`SELECT id FROM hearings WHERE case_id = ? AND hearing_date = ? AND ${notDeleted()}`)
    .get(caseId, nextDate) as { id: string } | undefined
  if (exists) return false
  createHearing(actor, {
    case_id: caseId,
    hearing_date: nextDate,
    hearing_time: nextTime,
    hearing_type: old.hearing_type,
    lawyer_id: old.lawyer_id,
    venue: old.venue,
    previous_decision: old.court_decision || undefined,
    status: 'upcoming'
  })
  return true
}

function normalizeHearingDate(raw: unknown, refDate?: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return parseLooseDate(t, refDate) || ''
}

function parseLooseDate(text: string, refDate?: string): string | null {
  const t = String(text || '')
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const m = t.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
  let y = m[3] ? Number(m[3]) : undefined
  if (y && y < 100) y += 2000
  const ref = refDate ? new Date(`${refDate}T12:00:00`) : new Date()
  if (!y || Number.isNaN(y)) {
    y = ref.getFullYear()
    const candidate = new Date(y, mo - 1, d)
    if (candidate.getTime() < ref.getTime() - 36 * 3600 * 1000) y += 1
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function migrateAdminFromHearing(actor: AuthedUser, caseId: string, data: Record<string, unknown>): number {
  const dueFallback =
    normalizeHearingDate(data.next_hearing_date, String(data.hearing_date)) || String(data.hearing_date || '')
  const items: { title: string; due_date: string }[] = []
  const upcoming = data.upcoming_procedures as { title?: string; due_date?: string }[] | undefined
  if (Array.isArray(upcoming)) {
    for (const p of upcoming) {
      const title = String(p?.title ?? '').trim()
      if (title.length < 2) continue
      items.push({ title, due_date: String(p.due_date || '').trim() || dueFallback })
    }
  }
  const blob = [data.required_documents, data.next_actions]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join('\n')
  if (blob) {
    for (const part of blob.split(/\s*[+\n؛;]\s*/).map((s) => s.replace(/\s+/g, ' ').trim())) {
      if (part.length < 4) continue
      if (items.some((x) => x.title === part)) continue
      items.push({ title: part, due_date: dueFallback })
    }
  }
  if (!items.length) return 0
  const db = getDb()
  const cs = db.prepare(`SELECT client_id, title FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId) as
    | { client_id: string; title: string }
    | undefined
  let n = 0
  for (const item of items) {
    if (!item.due_date) continue
    const exists = db
      .prepare(`SELECT id FROM tasks WHERE case_id = ? AND description = ? AND ${notDeleted()}`)
      .get(caseId, item.title) as { id: string } | undefined
    if (exists) continue
    createTask(actor, {
      title: item.title.slice(0, 48),
      description: item.title,
      venue: data.venue || null,
      case_subject: cs?.title || null,
      due_date: item.due_date,
      case_id: caseId,
      client_id: cs?.client_id,
      work_kind: 'admin',
      status: 'not_done'
    })
    n += 1
  }
  return n
}

export function parsePostponedDate(text: string, refDate?: string): string | null {
  const t = String(text || '')
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  if (!/أجل|تأجيل|مؤجل|لجلسة/.test(t)) return null
  const m = t.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
  let y = m[3] ? Number(m[3]) : undefined
  if (y && y < 100) y += 2000
  const ref = refDate ? new Date(`${refDate}T12:00:00`) : new Date()
  if (!y || Number.isNaN(y)) {
    y = ref.getFullYear()
    const candidate = new Date(y, mo - 1, d)
    if (candidate.getTime() < ref.getTime() - 36 * 3600 * 1000) y += 1
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function judgmentFollowUp(text: string): string | undefined {
  if (/براءة|إدانة|ادانة|حكم نهائي|رفض الدعوى|قبول الطعن/.test(text)) {
    return 'يُستحسن استخراج صورة رسمية من الحكم وإضافتها كعمل إداري.'
  }
  return undefined
}

export function removeHearing(actor: AuthedUser, id: string) {
  softDelete('hearings', id)
  audit(actor, 'delete', 'hearings', id, `تم حذف الجلسة رقم ${id}`)
}
