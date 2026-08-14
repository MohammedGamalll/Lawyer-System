import { getDb } from '../db/database'
import { nowIso, addDays } from '../utils/time'
import { audit } from './audit'
import type { AuthedUser } from '../ipc/helpers'

export function createReminder(data: {
  reminder_type: string
  title: string
  remind_at: string
  notify_before_minutes?: number
  priority?: string
  assignee_id?: number | null
  case_id?: number | null
  client_id?: number | null
  related_type?: string
  related_id?: number
  notes?: string
}): number {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO reminders (
        reminder_type, title, remind_at, notify_before_minutes, priority, assignee_id, case_id, client_id,
        related_type, related_id, notes, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.reminder_type,
      data.title,
      data.remind_at,
      data.notify_before_minutes ?? 1440,
      data.priority ?? 'medium',
      data.assignee_id ?? null,
      data.case_id ?? null,
      data.client_id ?? null,
      data.related_type ?? null,
      data.related_id ?? null,
      data.notes ?? null,
      nowIso()
    )
  return Number(info.lastInsertRowid)
}

export function reminderBeforeExpiry(expiryDate: string, days: number): string {
  return addDays(expiryDate, -days)
}

export function notifyUser(
  userId: number | null,
  title: string,
  body: string,
  type: string,
  relatedType?: string,
  relatedId?: number
): void {
  getDb()
    .prepare(
      `INSERT INTO notifications (user_id, title, body, type, related_type, related_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, title, body, type, relatedType ?? null, relatedId ?? null, nowIso())
}

export function processDueReminders(): number {
  const db = getDb()
  const now = nowIso()
  const due = db
    .prepare(
      `SELECT * FROM reminders WHERE is_sent = 0 AND is_dismissed = 0
       AND datetime(remind_at, '-' || notify_before_minutes || ' minutes') <= datetime(?)`
    )
    .all(now) as {
    id: number
    title: string
    reminder_type: string
    assignee_id: number | null
    related_type: string | null
    related_id: number | null
  }[]
  const mark = db.prepare('UPDATE reminders SET is_sent = 1 WHERE id = ?')
  for (const r of due) {
    notifyUser(r.assignee_id, r.title, `تذكير: ${r.title}`, r.reminder_type, r.related_type ?? undefined, r.related_id ?? undefined)
    mark.run(r.id)
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
       WHERE h.hearing_date = ? AND h.status = 'upcoming'`
    )
    .all(today) as { id: number; title: string; case_number: string }[]
  for (const h of todayHearings) {
    notifyUser(null, 'جلسة اليوم', `جلسة القضية ${h.case_number} — ${h.title}`, 'hearing', 'hearing', h.id)
  }

  const tomorrowHearings = db
    .prepare(
      `SELECT h.id, cs.title, cs.case_number FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.hearing_date = ? AND h.status = 'upcoming'`
    )
    .all(tomorrow) as { id: number; title: string; case_number: string }[]
  for (const h of tomorrowHearings) {
    notifyUser(null, 'جلسة الغد', `جلسة القضية ${h.case_number} — ${h.title}`, 'hearing', 'hearing', h.id)
  }

  const overdue = db
    .prepare(`SELECT id, title FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < ?`)
    .all(today) as { id: number; title: string }[]
  for (const t of overdue) {
    db.prepare(`UPDATE tasks SET status = 'overdue' WHERE id = ? AND status != 'overdue'`).run(t.id)
    notifyUser(null, 'مهمة متأخرة', t.title, 'task', 'task', t.id)
  }

  const expiringPoa = db
    .prepare(`SELECT id, poa_number FROM power_of_attorney WHERE status = 'active' AND expiry_date BETWEEN ? AND ?`)
    .all(today, addDays(today, 14).slice(0, 10)) as { id: number; poa_number: string }[]
  for (const p of expiringPoa) {
    notifyUser(null, 'توكيل قارَب على الانتهاء', `التوكيل ${p.poa_number}`, 'poa_expiry', 'poa', p.id)
  }

  const expiringContracts = db
    .prepare(`SELECT id, title FROM contracts WHERE status = 'active' AND end_date BETWEEN ? AND ?`)
    .all(today, addDays(today, 14).slice(0, 10)) as { id: number; title: string }[]
  for (const c of expiringContracts) {
    notifyUser(null, 'عقد قارَب على الانتهاء', c.title, 'contract_renewal', 'contract', c.id)
  }
}
