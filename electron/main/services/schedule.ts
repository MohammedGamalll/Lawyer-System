import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { parseSchema, reminderSchema, taskSchema } from '@shared/schemas'

export function listTasks(query: ListQuery = {}, userId?: number) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  const f = query.filters ?? {}
  if (f.view === 'mine' && userId) {
    where += ' AND t.assignee_id = ?'
    params.push(userId)
  }
  if (f.view === 'overdue') where += ` AND t.status NOT IN ('completed','cancelled') AND t.due_date < date('now')`
  if (f.view === 'today') where += ` AND t.due_date = date('now')`
  if (f.view === 'upcoming') where += ` AND t.due_date > date('now') AND t.status NOT IN ('completed','cancelled')`
  if (f.assignee_id) {
    where += ' AND t.assignee_id = ?'
    params.push(f.assignee_id)
  }
  if (query.search) {
    where += ' AND t.title LIKE ?'
    params.push(`%${query.search}%`)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM tasks t ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT t.*, u.full_name as assignee_name, cs.case_number, cl.full_name as client_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN cases cs ON cs.id = t.case_id
       LEFT JOIN clients cl ON cl.id = t.client_id
       ${where} ORDER BY t.due_date IS NULL, t.due_date ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createTask(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(taskSchema, data) as Record<string, unknown>
  if (!String(data.title ?? '').trim()) throw new Error('اسم المهمة مطلوب')
  const ts = nowIso()
  const info = getDb()
    .prepare(
      `INSERT INTO tasks (title, description, assignee_id, case_id, client_id, start_date, due_date, priority, status, progress, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.title,
      data.description ?? null,
      data.assignee_id || null,
      data.case_id || null,
      data.client_id || null,
      data.start_date ?? null,
      data.due_date ?? null,
      data.priority ?? 'medium',
      data.status ?? 'new',
      data.progress ?? 0,
      ts,
      ts
    )
  const id = Number(info.lastInsertRowid)
  if (data.due_date) {
    createReminder({
      reminder_type: 'task',
      title: `مهمة: ${data.title}`,
      remind_at: `${data.due_date}T09:00:00`,
      assignee_id: (data.assignee_id as number) || actor.id,
      case_id: (data.case_id as number) || null,
      client_id: (data.client_id as number) || null,
      related_type: 'task',
      related_id: id
    })
  }
  audit(actor, 'create', 'tasks', id, `تم إنشاء المهمة ${data.title}`)
  return { id }
}

export function updateTask(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE tasks SET title=?, description=?, assignee_id=?, case_id=?, client_id=?, start_date=?, due_date=?,
        priority=?, status=?, progress=?, updated_at=? WHERE id=?`
    )
    .run(
      data.title,
      data.description ?? null,
      data.assignee_id || null,
      data.case_id || null,
      data.client_id || null,
      data.start_date ?? null,
      data.due_date ?? null,
      data.priority ?? 'medium',
      data.status ?? 'new',
      data.progress ?? 0,
      nowIso(),
      id
    )
  audit(actor, 'update', 'tasks', id, `تم تعديل المهمة ${data.title}`)
  return { id }
}

export function removeTask(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
  audit(actor, 'delete', 'tasks', id, `تم حذف مهمة رقم ${id}`)
}

export function listReminders(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const params: unknown[] = []
  let where = 'WHERE is_dismissed = 0'
  if (query.filters?.reminder_type) {
    where += ' AND reminder_type = ?'
    params.push(query.filters.reminder_type)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM reminders ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT r.*, u.full_name as assignee_name, cs.case_number, cl.full_name as client_name
       FROM reminders r
       LEFT JOIN users u ON u.id = r.assignee_id
       LEFT JOIN cases cs ON cs.id = r.case_id
       LEFT JOIN clients cl ON cl.id = r.client_id
       ${where} ORDER BY r.remind_at ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
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
    assignee_id: (data.assignee_id as number) || actor.id,
    case_id: (data.case_id as number) || null,
    client_id: (data.client_id as number) || null,
    notes: data.notes as string | undefined
  })
  audit(actor, 'create', 'reminders', id, `تم إنشاء تذكير: ${data.title}`)
  return { id }
}

export function updateReminder(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE reminders SET reminder_type=?, title=?, remind_at=?, notify_before_minutes=?, priority=?, assignee_id=?,
        case_id=?, client_id=?, notes=? WHERE id=?`
    )
    .run(
      data.reminder_type,
      data.title,
      data.remind_at,
      data.notify_before_minutes ?? 60,
      data.priority ?? 'medium',
      data.assignee_id || null,
      data.case_id || null,
      data.client_id || null,
      data.notes ?? null,
      id
    )
  return { id }
}

export function dismissReminder(id: number) {
  getDb().prepare('UPDATE reminders SET is_dismissed = 1 WHERE id = ?').run(id)
}

export function removeReminder(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM reminders WHERE id = ?').run(id)
  audit(actor, 'delete', 'reminders', id, `تم حذف تذكير رقم ${id}`)
}

export function listAppointments(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (query.search) {
    where += ' AND (a.title LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${query.search}%`
    params.push(s, s)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM appointments a LEFT JOIN clients cl ON cl.id = a.client_id ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT a.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM appointments a
       LEFT JOIN clients cl ON cl.id = a.client_id
       LEFT JOIN lawyers l ON l.id = a.lawyer_id
       ${where} ORDER BY a.date DESC, a.time DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createAppointment(actor: AuthedUser, data: Record<string, unknown>) {
  if (!data.title || !data.date) throw new Error('العنوان والتاريخ مطلوبان')
  const info = getDb()
    .prepare(
      `INSERT INTO appointments (title, appointment_type, client_id, lawyer_id, case_id, date, time, location, purpose, notes, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.title,
      data.appointment_type ?? 'client',
      data.client_id || null,
      data.lawyer_id || null,
      data.case_id || null,
      data.date,
      data.time ?? null,
      data.location ?? null,
      data.purpose ?? null,
      data.notes ?? null,
      data.status ?? 'scheduled',
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  createReminder({
    reminder_type: 'client_appointment',
    title: String(data.title),
    remind_at: `${data.date}T${data.time || '09:00'}:00`,
    client_id: (data.client_id as number) || null,
    case_id: (data.case_id as number) || null,
    related_type: 'appointment',
    related_id: id
  })
  audit(actor, 'create', 'appointments', id, `تم إنشاء موعد: ${data.title}`)
  return { id }
}

export function updateAppointment(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE appointments SET title=?, appointment_type=?, client_id=?, lawyer_id=?, case_id=?, date=?, time=?, location=?, purpose=?, notes=?, status=? WHERE id=?`
    )
    .run(
      data.title,
      data.appointment_type ?? 'client',
      data.client_id || null,
      data.lawyer_id || null,
      data.case_id || null,
      data.date,
      data.time ?? null,
      data.location ?? null,
      data.purpose ?? null,
      data.notes ?? null,
      data.status ?? 'scheduled',
      id
    )
  return { id }
}

export function removeAppointment(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM appointments WHERE id = ?').run(id)
  audit(actor, 'delete', 'appointments', id, `تم حذف موعد رقم ${id}`)
}

export function calendarEvents(from: string, to: string) {
  const db = getDb()
  const hearings = db
    .prepare(
      `SELECT h.id, h.hearing_date as date, h.hearing_time as time, cs.title, cs.case_number, 'hearing' as kind
       FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.hearing_date BETWEEN ? AND ?`
    )
    .all(from, to)
  const appointments = db
    .prepare(
      `SELECT id, date, time, title, appointment_type as subtype, 'appointment' as kind
       FROM appointments WHERE date BETWEEN ? AND ?`
    )
    .all(from, to)
  const tasks = db
    .prepare(
      `SELECT id, due_date as date, title, 'task' as kind FROM tasks WHERE due_date BETWEEN ? AND ?`
    )
    .all(from, to)
  const reminders = db
    .prepare(
      `SELECT id, date(remind_at) as date, time(remind_at) as time, title, reminder_type as subtype, 'reminder' as kind
       FROM reminders WHERE date(remind_at) BETWEEN ? AND ? AND is_dismissed = 0`
    )
    .all(from, to)
  return [...hearings, ...appointments, ...tasks, ...reminders]
}

export function moveCalendarEvent(kind: string, id: number, date: string, time?: string) {
  const db = getDb()
  if (kind === 'hearing') db.prepare('UPDATE hearings SET hearing_date=?, hearing_time=COALESCE(?, hearing_time) WHERE id=?').run(date, time ?? null, id)
  else if (kind === 'appointment') db.prepare('UPDATE appointments SET date=?, time=COALESCE(?, time) WHERE id=?').run(date, time ?? null, id)
  else if (kind === 'task') db.prepare('UPDATE tasks SET due_date=? WHERE id=?').run(date, id)
  else if (kind === 'reminder') db.prepare(`UPDATE reminders SET remind_at = ? WHERE id=?`).run(`${date}T${time || '09:00'}:00`, id)
  else throw new Error('نوع الحدث غير معروف')
}

export function listNotifications(userId: number) {
  return getDb()
    .prepare(
      `SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 100`
    )
    .all(userId)
}

export function markNotificationRead(id: number) {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
}

export function markAllNotificationsRead(userId: number) {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE user_id IS NULL OR user_id = ?').run(userId)
}
