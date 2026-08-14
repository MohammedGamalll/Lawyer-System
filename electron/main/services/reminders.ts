import { getDb } from '../db/database'
import { nowIso, addDays } from '../utils/time'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange } from '../sync/queue'

export function createReminder(data: {
  reminder_type: string
  title: string
  remind_at: string
  notify_before_minutes?: number
  priority?: string
  assignee_id?: string | null
  case_id?: string | null
  client_id?: string | null
  related_type?: string
  related_id?: string
  notes?: string
}): string {
  const db = getDb()
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO reminders (
        id, reminder_type, title, remind_at, notify_before_minutes, priority, assignee_id, case_id, client_id,
        related_type, related_id, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    data.reminder_type,
    data.title,
    data.remind_at,
    data.notify_before_minutes ?? 1440,
    data.priority ?? 'medium',
    asIdOrNull(data.assignee_id),
    asIdOrNull(data.case_id),
    asIdOrNull(data.client_id),
    data.related_type ?? null,
    asIdOrNull(data.related_id),
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('reminders', id, 'INSERT')
  return id
}

export function reminderBeforeExpiry(expiryDate: string, days: number): string {
  return addDays(expiryDate, -days)
}

function alreadyNotifiedToday(type: string, relatedId?: string): boolean {
  if (!relatedId) return false
  const today = new Date().toISOString().slice(0, 10)
  const row = getDb()
    .prepare(
      `SELECT 1 as x FROM notifications
       WHERE type = ? AND related_id = ? AND deleted_at IS NULL AND substr(created_at, 1, 10) = ?`
    )
    .get(type, relatedId, today) as { x: number } | undefined
  return Boolean(row)
}

export function notifyUser(
  userId: string | null,
  title: string,
  body: string,
  type: string,
  relatedType?: string,
  relatedId?: string
): void {
  if (alreadyNotifiedToday(type, relatedId)) return
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO notifications (id, user_id, title, body, type, related_type, related_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, asIdOrNull(userId), title, body, type, relatedType ?? null, asIdOrNull(relatedId), ts, ts)
  recordLocalChange('notifications', id, 'INSERT')
}

export function processDueReminders(): number {
  const db = getDb()
  const now = nowIso()
  const due = db
    .prepare(
      `SELECT * FROM reminders WHERE is_sent = 0 AND is_dismissed = 0 AND ${notDeleted()}
       AND datetime(remind_at, '-' || notify_before_minutes || ' minutes') <= datetime(?)`
    )
    .all(now) as {
    id: string
    title: string
    reminder_type: string
    assignee_id: string | null
    related_type: string | null
    related_id: string | null
  }[]
  const mark = db.prepare('UPDATE reminders SET is_sent = 1, updated_at = ? WHERE id = ?')
  for (const r of due) {
    notifyUser(r.assignee_id, r.title, `تذكير: ${r.title}`, r.reminder_type, r.related_type ?? undefined, r.related_id ?? undefined)
    mark.run(nowIso(), r.id)
    recordLocalChange('reminders', r.id, 'UPDATE')
  }
  return due.length
}

export function generateDailyNotifications(): void {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = addDays(today, 1).slice(0, 10)

  const todayHearings = db
    .prepare(
      `SELECT h.id, cs.title, cs.case_number FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.hearing_date = ? AND h.status = 'upcoming' AND ${notDeleted('h')} AND ${notDeleted('cs')}`
    )
    .all(today) as { id: string; title: string; case_number: string }[]
  for (const h of todayHearings) {
    notifyUser(null, 'جلسة اليوم', `جلسة القضية ${h.case_number} — ${h.title}`, 'hearing', 'hearing', h.id)
  }

  const tomorrowHearings = db
    .prepare(
      `SELECT h.id, cs.title, cs.case_number FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.hearing_date = ? AND h.status = 'upcoming' AND ${notDeleted('h')} AND ${notDeleted('cs')}`
    )
    .all(tomorrow) as { id: string; title: string; case_number: string }[]
  for (const h of tomorrowHearings) {
    notifyUser(null, 'جلسة الغد', `جلسة القضية ${h.case_number} — ${h.title}`, 'hearing', 'hearing', h.id)
  }

  const overdue = db
    .prepare(`SELECT id, title FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < ? AND ${notDeleted()}`)
    .all(today) as { id: string; title: string }[]
  for (const t of overdue) {
    const changed = db
      .prepare(`UPDATE tasks SET status = 'overdue', updated_at = ? WHERE id = ? AND status != 'overdue'`)
      .run(nowIso(), t.id)
    if (changed.changes > 0) recordLocalChange('tasks', t.id, 'UPDATE')
    notifyUser(null, 'مهمة متأخرة', t.title, 'task', 'task', t.id)
  }

  const expiringPoa = db
    .prepare(
      `SELECT id, poa_number FROM power_of_attorney WHERE status = 'active' AND expiry_date BETWEEN ? AND ? AND ${notDeleted()}`
    )
    .all(today, addDays(today, 14).slice(0, 10)) as { id: string; poa_number: string }[]
  for (const p of expiringPoa) {
    notifyUser(null, 'توكيل قارَب على الانتهاء', `التوكيل ${p.poa_number}`, 'poa_expiry', 'poa', p.id)
  }

  const expiringContracts = db
    .prepare(`SELECT id, title FROM contracts WHERE status = 'active' AND end_date BETWEEN ? AND ? AND ${notDeleted()}`)
    .all(today, addDays(today, 14).slice(0, 10)) as { id: string; title: string }[]
  for (const c of expiringContracts) {
    notifyUser(null, 'عقد قارَب على الانتهاء', c.title, 'contract_renewal', 'contract', c.id)
  }
}
