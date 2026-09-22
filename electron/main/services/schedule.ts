import { getDb } from '../db/database'
import { nowIso, todayIso } from '../utils/time'
import { audit } from './audit'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { parseSchema, reminderSchema, taskSchema } from '@shared/schemas'
import { rememberLookup } from './lookups'
import { clampPageSize, pageKind, pickSort, sqlDir } from '../db/queryLimits'
import { casePrintJoinSql, casePrintSelectSql, enrichPrintRows } from './printCaseFields'

function opponentContactFromCase(caseId: string | null) {
  if (!caseId) return { address: '', phone: '' }
  const row = getDb()
    .prepare(
      `SELECT ox.address as address, ox.phone as phone
       FROM case_opponents xo
       JOIN opponents ox ON ox.id = xo.opponent_id AND ${notDeleted('ox')}
       WHERE xo.case_id = ? AND ${notDeleted('xo')}
       ORDER BY IFNULL(xo.sort_order, 0)
       LIMIT 1`
    )
    .get(caseId) as { address?: string; phone?: string } | undefined
  return { address: String(row?.address || '').trim(), phone: String(row?.phone || '').trim() }
}

function looksMasked(v: unknown) {
  return String(v ?? '').includes('****')
}

export function listTasks(query: ListQuery = {}, userId?: string) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('t')}`
  const f = query.filters ?? {}
  const cairoToday = todayIso()
  if (f.view === 'mine' && userId) {
    where += ' AND t.assignee_id = ?'
    params.push(userId)
  }
  if (f.view === 'overdue') {
    where += ` AND t.status NOT IN ('completed','cancelled') AND t.due_date < ?`
    params.push(cairoToday)
  }
  if (f.view === 'today') {
    where += ` AND t.due_date = ? AND t.status NOT IN ('completed','cancelled')`
    params.push(cairoToday)
  }
  if (f.view === 'upcoming') {
    where += ` AND t.due_date > ? AND t.status NOT IN ('completed','cancelled')`
    params.push(cairoToday)
  }
  if (f.assignee_id) {
    where += ' AND t.assignee_id = ?'
    params.push(f.assignee_id)
  }
  if (f.case_id) {
    where += ' AND t.case_id = ?'
    params.push(f.case_id)
  }
  if (f.work_kind) {
    where += ' AND IFNULL(t.work_kind, \'admin\') = ?'
    params.push(f.work_kind)
  }
  if (f.venue) {
    where += ' AND t.venue LIKE ?'
    params.push(`%${String(f.venue).trim()}%`)
  }
  if (f.date_from) {
    where += ' AND t.due_date >= ?'
    params.push(f.date_from)
  }
  if (f.date_to) {
    where += ' AND t.due_date <= ?'
    params.push(f.date_to)
  }
  if (query.search) {
    where += ' AND t.title LIKE ?'
    params.push(`%${query.search}%`)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM tasks t ${where}`).get(...params) as { c: number }).c
  const order = pickSort(query.sortBy, {
    title: 't.title',
    due_date: 't.due_date',
    status: 't.status',
    venue: 't.venue',
    case_number: 'cs.case_number',
    office_case_number: 'cs.office_case_number',
    description: 't.description',
    notes: 't.notes',
    assignee_name: 'u.full_name'
  }, 't.due_date IS NULL, t.due_date ASC')
  const dir = query.sortBy ? ` ${sqlDir(query.sortDir)}` : ''
  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.description as required_action, t.description, t.venue, t.notes,
              t.opponent_address, t.opponent_phone,
              t.case_subject, t.assignee_id, t.case_id, t.client_id,
              t.start_date, t.due_date, t.priority, t.status, t.progress, t.work_kind, t.hearing_id, t.execution_kind,
              t.police_report_no, t.police_report_kind, t.police_station,
              t.execution_number, t.execution_officer, t.judgment_date, t.judgment_text,
              u.full_name as assignee_name,
              h.hall, h.floor,
              ${casePrintSelectSql('cs')},
              COALESCE(cl.full_name, c2.full_name) as client_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id AND ${notDeleted('u')}
       ${casePrintJoinSql('t.case_id')}
       LEFT JOIN hearings h ON h.id = t.hearing_id AND ${notDeleted('h')}
       LEFT JOIN clients cl ON cl.id = t.client_id AND ${notDeleted('cl')}
       LEFT JOIN clients c2 ON c2.id = cs.client_id AND ${notDeleted('c2')}
       ${where} ORDER BY ${order}${dir} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows: enrichPrintRows(rows), total, page, pageSize }
}

export function getTask(id: string) {
  const row = getDb()
    .prepare(
      `SELECT t.*, u.full_name as assignee_name, cs.case_number, cs.office_case_number, cs.case_year, cs.court,
              cs.opponent_name, cs.title as case_title, COALESCE(cl.full_name, c2.full_name) as client_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id AND ${notDeleted('u')}
       LEFT JOIN cases cs ON cs.id = t.case_id AND ${notDeleted('cs')}
       LEFT JOIN clients cl ON cl.id = t.client_id AND ${notDeleted('cl')}
       LEFT JOIN clients c2 ON c2.id = cs.client_id AND ${notDeleted('c2')}
       WHERE t.id = ? AND ${notDeleted('t')}`
    )
    .get(id)
  if (!row) throw new Error('المهمة غير موجودة')
  return row
}

export function createTask(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(taskSchema, data) as Record<string, unknown>
  const description = String(data.description ?? '').trim()
  if (!description) throw new Error('البيان مطلوب لحفظ العمل الإداري')
  if (!String(data.due_date ?? '').trim()) throw new Error('تاريخ العمل الإداري مطلوب')
  const workKind = String(data.work_kind || 'admin')
  const title = description.slice(0, 80)
  const ts = nowIso()
  const id = newId()
  const caseId = asIdOrNull(data.case_id)
  const opp = workKind === 'execution' ? opponentContactFromCase(caseId) : { address: '', phone: '' }
  const opponentAddress = looksMasked(data.opponent_address) ? opp.address : String(data.opponent_address || '').trim() || opp.address || null
  const opponentPhone = looksMasked(data.opponent_phone) ? opp.phone : String(data.opponent_phone || '').trim() || opp.phone || null
  getDb()
    .prepare(
      `INSERT INTO tasks (id, title, description, venue, case_subject, assignee_id, case_id, client_id, start_date, due_date, priority, status, progress, work_kind, hearing_id, execution_kind, police_report_no, police_report_kind, police_station, execution_number, execution_officer, judgment_date, judgment_text, notes, opponent_address, opponent_phone, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      title,
      description,
      data.venue ?? null,
      data.case_subject ?? null,
      asIdOrNull(data.assignee_id),
      caseId,
      asIdOrNull(data.client_id),
      data.start_date ?? null,
      data.due_date ?? null,
      data.priority ?? 'medium',
      data.status ?? 'not_done',
      data.progress ?? 0,
      workKind,
      asIdOrNull(data.hearing_id),
      data.execution_kind ?? null,
      data.police_report_no ?? null,
      data.police_report_kind ?? null,
      data.police_station ?? null,
      data.execution_number ?? null,
      data.execution_officer ?? null,
      data.judgment_date ?? null,
      data.judgment_text ?? null,
      data.notes ?? null,
      opponentAddress,
      opponentPhone,
      ts,
      ts
    )
  recordLocalChange('tasks', id, 'INSERT')
  rememberLookup(workKind === 'execution' ? 'execution_action' : 'admin_action', description)
  rememberLookup('venue', data.venue)
  rememberLookup('case_subject', data.case_subject)
  rememberLookup('task_status', data.status)
  rememberLookup('execution_kind', data.execution_kind)
  rememberLookup('police_report_kind', data.police_report_kind)
  rememberLookup('police_station', data.police_station)
  if (data.due_date) {
    createReminder({
      reminder_type: 'task',
      title: `مهمة: ${title}`,
      remind_at: `${data.due_date}T09:00:00`,
      assignee_id: asIdOrNull(data.assignee_id) || actor.id,
      case_id: asIdOrNull(data.case_id),
      client_id: asIdOrNull(data.client_id),
      related_type: 'task',
      related_id: id
    })
  }
  audit(actor, 'create', 'tasks', id, `تم إنشاء المهمة ${title}`)
  return { id }
}

export function updateTask(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  const description = String(data.description ?? '').trim()
  if (!description) throw new Error('البيان مطلوب لحفظ العمل الإداري')
  if (!String(data.due_date ?? '').trim()) throw new Error('تاريخ العمل الإداري مطلوب')
  const workKind = String(data.work_kind || 'admin')
  const title = description.slice(0, 80)
  const caseId = asIdOrNull(data.case_id)
  const opp = workKind === 'execution' ? opponentContactFromCase(caseId) : { address: '', phone: '' }
  const opponentAddress = looksMasked(data.opponent_address)
    ? opp.address
    : String(data.opponent_address || '').trim() || opp.address || null
  const opponentPhone = looksMasked(data.opponent_phone)
    ? opp.phone
    : String(data.opponent_phone || '').trim() || opp.phone || null
  getDb()
    .prepare(
      `UPDATE tasks SET title=?, description=?, venue=?, case_subject=?, assignee_id=?, case_id=?, client_id=?, start_date=?, due_date=?,
        priority=?, status=?, progress=?, work_kind=?, hearing_id=?, execution_kind=?, police_report_no=?, police_report_kind=?, police_station=?,
        execution_number=?, execution_officer=?, judgment_date=?, judgment_text=?, notes=?, opponent_address=?, opponent_phone=?, updated_at=? WHERE id=?`
    )
    .run(
      title,
      description,
      data.venue ?? null,
      data.case_subject ?? null,
      asIdOrNull(data.assignee_id),
      caseId,
      asIdOrNull(data.client_id),
      data.start_date ?? null,
      data.due_date ?? null,
      data.priority ?? 'medium',
      data.status ?? 'not_done',
      data.progress ?? 0,
      workKind,
      asIdOrNull(data.hearing_id),
      data.execution_kind ?? null,
      data.police_report_no ?? null,
      data.police_report_kind ?? null,
      data.police_station ?? null,
      data.execution_number ?? null,
      data.execution_officer ?? null,
      data.judgment_date ?? null,
      data.judgment_text ?? null,
      data.notes ?? null,
      opponentAddress,
      opponentPhone,
      nowIso(),
      id
    )
  recordLocalChange('tasks', id, 'UPDATE')
  rememberLookup(workKind === 'execution' ? 'execution_action' : 'admin_action', description)
  rememberLookup('venue', data.venue)
  rememberLookup('case_subject', data.case_subject)
  rememberLookup('task_status', data.status)
  rememberLookup('execution_kind', data.execution_kind)
  rememberLookup('police_report_kind', data.police_report_kind)
  rememberLookup('police_station', data.police_station)
  audit(actor, 'update', 'tasks', id, `تم تعديل المهمة ${title}`)
  return { id }
}

export function removeTask(actor: AuthedUser, id: string) {
  softDelete('tasks', id)
  audit(actor, 'delete', 'tasks', id, `تم حذف مهمة رقم ${id}`)
}

export function listReminders(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE r.is_dismissed = 0 AND ${notDeleted('r')}`
  if (query.filters?.reminder_type) {
    where += ' AND r.reminder_type = ?'
    params.push(query.filters.reminder_type)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM reminders r ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT r.*, u.full_name as assignee_name, cs.case_number, cl.full_name as client_name
       FROM reminders r
       LEFT JOIN users u ON u.id = r.assignee_id AND ${notDeleted('u')}
       LEFT JOIN cases cs ON cs.id = r.case_id AND ${notDeleted('cs')}
       LEFT JOIN clients cl ON cl.id = r.client_id AND ${notDeleted('cl')}
       ${where} ORDER BY r.remind_at ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getReminder(id: string) {
  const row = getDb()
    .prepare(
      `SELECT r.*, u.full_name as assignee_name, cs.case_number, cl.full_name as client_name
       FROM reminders r
       LEFT JOIN users u ON u.id = r.assignee_id AND ${notDeleted('u')}
       LEFT JOIN cases cs ON cs.id = r.case_id AND ${notDeleted('cs')}
       LEFT JOIN clients cl ON cl.id = r.client_id AND ${notDeleted('cl')}
       WHERE r.id = ? AND ${notDeleted('r')}`
    )
    .get(id)
  if (!row) throw new Error('التذكير غير موجود')
  return row
}

export function createReminderRecord(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(reminderSchema, data) as Record<string, unknown>
  if (!data.title || !data.remind_at) throw new Error('العنوان والتاريخ مطلوبان')
  const id = createReminder({
    reminder_type: String(data.reminder_type ?? 'personal'),
    title: String(data.title),
    remind_at: String(data.remind_at),
    notify_before_minutes: Number(data.notify_before_minutes ?? 60),
    priority: String(data.priority ?? 'medium'),
    assignee_id: asIdOrNull(data.assignee_id) || actor.id,
    case_id: asIdOrNull(data.case_id),
    client_id: asIdOrNull(data.client_id),
    notes: data.notes as string | undefined
  })
  audit(actor, 'create', 'reminders', id, `تم إنشاء تذكير: ${data.title}`)
  return { id }
}

export function updateReminder(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE reminders SET reminder_type=?, title=?, remind_at=?, notify_before_minutes=?, priority=?, assignee_id=?,
        case_id=?, client_id=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      data.reminder_type,
      data.title,
      data.remind_at,
      data.notify_before_minutes ?? 60,
      data.priority ?? 'medium',
      asIdOrNull(data.assignee_id),
      asIdOrNull(data.case_id),
      asIdOrNull(data.client_id),
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('reminders', id, 'UPDATE')
  return { id }
}

export function dismissReminder(id: string) {
  getDb().prepare('UPDATE reminders SET is_dismissed = 1, updated_at = ? WHERE id = ?').run(nowIso(), id)
  recordLocalChange('reminders', id, 'UPDATE')
}

export function removeReminder(actor: AuthedUser, id: string) {
  softDelete('reminders', id)
  audit(actor, 'delete', 'reminders', id, `تم حذف تذكير رقم ${id}`)
}

export function listAppointments(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('a')}`
  if (query.search) {
    where += ' AND (a.title LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${query.search}%`
    params.push(s, s)
  }
  const af = query.filters ?? {}
  if (af.date_from) {
    where += ' AND a.date >= ?'
    params.push(af.date_from)
  }
  if (af.status) {
    where += ' AND a.status = ?'
    params.push(af.status)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM appointments a LEFT JOIN clients cl ON cl.id = a.client_id AND ${notDeleted('cl')} ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT a.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM appointments a
       LEFT JOIN clients cl ON cl.id = a.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = a.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY a.date DESC, a.time DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getAppointment(id: string) {
  const row = getDb()
    .prepare(
      `SELECT a.*, cl.full_name as client_name, l.full_name as lawyer_name, cs.case_number
       FROM appointments a
       LEFT JOIN clients cl ON cl.id = a.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = a.lawyer_id AND ${notDeleted('l')}
       LEFT JOIN cases cs ON cs.id = a.case_id AND ${notDeleted('cs')}
       WHERE a.id = ? AND ${notDeleted('a')}`
    )
    .get(id)
  if (!row) throw new Error('الموعد غير موجود')
  return row
}

export function createAppointment(actor: AuthedUser, data: Record<string, unknown>) {
  if (!data.title || !data.date) throw new Error('العنوان والتاريخ مطلوبان')
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO appointments (id, title, appointment_type, client_id, lawyer_id, case_id, date, time, location, purpose, notes, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      data.title,
      data.appointment_type ?? 'client',
      asIdOrNull(data.client_id),
      asIdOrNull(data.lawyer_id),
      asIdOrNull(data.case_id),
      data.date,
      data.time ?? null,
      data.location ?? null,
      data.purpose ?? null,
      data.notes ?? null,
      data.status ?? 'scheduled',
      ts,
      ts
    )
  recordLocalChange('appointments', id, 'INSERT')
  createReminder({
    reminder_type: 'client_appointment',
    title: String(data.title),
    remind_at: `${data.date}T${data.time || '09:00'}:00`,
    client_id: asIdOrNull(data.client_id),
    case_id: asIdOrNull(data.case_id),
    related_type: 'appointment',
    related_id: id
  })
  audit(actor, 'create', 'appointments', id, `تم إنشاء موعد: ${data.title}`)
  return { id }
}

export function updateAppointment(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE appointments SET title=?, appointment_type=?, client_id=?, lawyer_id=?, case_id=?, date=?, time=?, location=?, purpose=?, notes=?, status=?, updated_at=? WHERE id=?`
    )
    .run(
      data.title,
      data.appointment_type ?? 'client',
      asIdOrNull(data.client_id),
      asIdOrNull(data.lawyer_id),
      asIdOrNull(data.case_id),
      data.date,
      data.time ?? null,
      data.location ?? null,
      data.purpose ?? null,
      data.notes ?? null,
      data.status ?? 'scheduled',
      nowIso(),
      id
    )
  recordLocalChange('appointments', id, 'UPDATE')
  return { id }
}

export function removeAppointment(actor: AuthedUser, id: string) {
  softDelete('appointments', id)
  audit(actor, 'delete', 'appointments', id, `تم حذف موعد رقم ${id}`)
}

export function calendarEvents(from: string, to: string) {
  const db = getDb()
  const hearings = db
    .prepare(
      `SELECT h.id, h.hearing_date as date, h.hearing_time as time, cs.title, cs.case_number, cs.id as case_id, 'hearing' as kind
       FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.hearing_date BETWEEN ? AND ? AND ${notDeleted('h')} AND ${notDeleted('cs')}`
    )
    .all(from, to)
  const appointments = db
    .prepare(
      `SELECT id, date, time, title, appointment_type as subtype, 'appointment' as kind
       FROM appointments WHERE date BETWEEN ? AND ? AND ${notDeleted()}`
    )
    .all(from, to)
  const tasks = db
    .prepare(
      `SELECT id, due_date as date, title, 'task' as kind FROM tasks WHERE due_date BETWEEN ? AND ? AND ${notDeleted()}`
    )
    .all(from, to)
  const reminders = db
    .prepare(
      `SELECT id, date(remind_at) as date, time(remind_at) as time, title, reminder_type as subtype, 'reminder' as kind
       FROM reminders
       WHERE date(remind_at) BETWEEN ? AND ? AND is_dismissed = 0 AND ${notDeleted()}
         AND COALESCE(related_type, '') NOT IN ('hearing', 'task', 'appointment')
         AND COALESCE(reminder_type, '') NOT IN ('hearing', 'task', 'client_appointment')`
    )
    .all(from, to)
  return [...hearings, ...appointments, ...tasks, ...reminders]
}

export function moveCalendarEvent(kind: string, id: string, date: string, time?: string) {
  const db = getDb()
  const ts = nowIso()
  if (kind === 'hearing') {
    db.prepare('UPDATE hearings SET hearing_date=?, hearing_time=COALESCE(?, hearing_time), updated_at=? WHERE id=?').run(
      date,
      time ?? null,
      ts,
      id
    )
    recordLocalChange('hearings', id, 'UPDATE')
  } else if (kind === 'appointment') {
    db.prepare('UPDATE appointments SET date=?, time=COALESCE(?, time), updated_at=? WHERE id=?').run(date, time ?? null, ts, id)
    recordLocalChange('appointments', id, 'UPDATE')
  } else if (kind === 'task') {
    db.prepare('UPDATE tasks SET due_date=?, updated_at=? WHERE id=?').run(date, ts, id)
    recordLocalChange('tasks', id, 'UPDATE')
  } else if (kind === 'reminder') {
    db.prepare(`UPDATE reminders SET remind_at = ?, updated_at=? WHERE id=?`).run(`${date}T${time || '09:00'}:00`, ts, id)
    recordLocalChange('reminders', id, 'UPDATE')
  } else throw new Error('نوع الحدث غير معروف')
}

export function listNotifications(userId: string) {
  return getDb()
    .prepare(
      `SELECT n.id, n.title, n.body, n.type, n.related_type, n.related_id, n.is_read, n.created_at,
              COALESCE(cl_t.full_name, cl_h.full_name, cl_c.full_name, cl_r.full_name, cl_p.full_name, cl_k.full_name) AS client_name,
              COALESCE(cs_t.opponent_name, cs_h.opponent_name, cs_c.opponent_name, cs_r.opponent_name) AS opponent_name,
              COALESCE(cs_t.case_number, cs_h.case_number, cs_c.case_number, cs_r.case_number) AS case_number,
              COALESCE(cs_t.office_case_number, cs_h.office_case_number, cs_c.office_case_number, cs_r.office_case_number) AS office_case_number,
              COALESCE(cs_t.case_year, cs_h.case_year, cs_c.case_year, cs_r.case_year) AS case_year,
              COALESCE(cs_t.first_instance_number, cs_h.first_instance_number, cs_c.first_instance_number, cs_r.first_instance_number) AS first_instance_number,
              COALESCE(cs_t.first_instance_year, cs_h.first_instance_year, cs_c.first_instance_year, cs_r.first_instance_year) AS first_instance_year,
              COALESCE(cs_t.appeal_number, cs_h.appeal_number, cs_c.appeal_number, cs_r.appeal_number) AS appeal_number,
              COALESCE(cs_t.appeal_year, cs_h.appeal_year, cs_c.appeal_year, cs_r.appeal_year) AS appeal_year,
              COALESCE(cs_t.cassation_number, cs_h.cassation_number, cs_c.cassation_number, cs_r.cassation_number) AS cassation_number,
              COALESCE(cs_t.cassation_year, cs_h.cassation_year, cs_c.cassation_year, cs_r.cassation_year) AS cassation_year
       FROM notifications n
       LEFT JOIN tasks t ON n.related_type = 'task' AND t.id = n.related_id AND ${notDeleted('t')}
       LEFT JOIN cases cs_t ON cs_t.id = t.case_id AND ${notDeleted('cs_t')}
       LEFT JOIN clients cl_t ON cl_t.id = COALESCE(t.client_id, cs_t.client_id) AND ${notDeleted('cl_t')}
       LEFT JOIN hearings h ON n.related_type = 'hearing' AND h.id = n.related_id AND ${notDeleted('h')}
       LEFT JOIN cases cs_h ON cs_h.id = h.case_id AND ${notDeleted('cs_h')}
       LEFT JOIN clients cl_h ON cl_h.id = cs_h.client_id AND ${notDeleted('cl_h')}
       LEFT JOIN cases cs_c ON n.related_type = 'case' AND cs_c.id = n.related_id AND ${notDeleted('cs_c')}
       LEFT JOIN clients cl_c ON cl_c.id = cs_c.client_id AND ${notDeleted('cl_c')}
       LEFT JOIN reminders r ON n.related_type = 'reminder' AND r.id = n.related_id AND ${notDeleted('r')}
       LEFT JOIN cases cs_r ON cs_r.id = r.case_id AND ${notDeleted('cs_r')}
       LEFT JOIN clients cl_r ON cl_r.id = COALESCE(r.client_id, cs_r.client_id) AND ${notDeleted('cl_r')}
       LEFT JOIN power_of_attorney p ON n.related_type = 'poa' AND p.id = n.related_id AND ${notDeleted('p')}
       LEFT JOIN clients cl_p ON cl_p.id = p.client_id AND ${notDeleted('cl_p')}
       LEFT JOIN contracts k ON n.related_type = 'contract' AND k.id = n.related_id AND ${notDeleted('k')}
       LEFT JOIN clients cl_k ON cl_k.id = k.client_id AND ${notDeleted('cl_k')}
       WHERE ${notDeleted('n')} AND (n.user_id IS NULL OR n.user_id = ?)
       ORDER BY n.created_at DESC
       LIMIT 500`
    )
    .all(userId)
}

export function markNotificationRead(id: string, isRead = true) {
  getDb().prepare('UPDATE notifications SET is_read = ?, updated_at = ? WHERE id = ?').run(isRead ? 1 : 0, nowIso(), id)
  recordLocalChange('notifications', id, 'UPDATE')
}

export function markAllNotificationsRead(userId: string) {
  const db = getDb()
  const rows = db
    .prepare(`SELECT id FROM notifications WHERE (${notDeleted()}) AND is_read = 0 AND (user_id IS NULL OR user_id = ?)`)
    .all(userId) as { id: string }[]
  db.prepare('UPDATE notifications SET is_read = 1, updated_at = ? WHERE user_id IS NULL OR user_id = ?').run(nowIso(), userId)
  for (const r of rows) recordLocalChange('notifications', r.id, 'UPDATE')
}
