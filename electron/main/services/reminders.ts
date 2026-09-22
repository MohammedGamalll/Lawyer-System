import { getDb } from '../db/database'
import { nowIso, addDays, todayIso } from '../utils/time'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange } from '../sync/queue'
import { formattedCourtNumber } from '@shared/printLabels'

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
  const today = todayIso()
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
  const today = todayIso()
  const tomorrow = addDays(today, 1).slice(0, 10)

  const hearingSelect = `SELECT h.id, cs.title, cs.case_number, cs.office_case_number, cs.case_year,
              cs.first_instance_number, cs.first_instance_year, cs.appeal_number, cs.appeal_year,
              cs.cassation_number, cs.cassation_year, cs.opponent_name, cl.full_name as client_name
       FROM hearings h
       JOIN cases cs ON cs.id = h.case_id
       LEFT JOIN clients cl ON cl.id = cs.client_id AND ${notDeleted('cl')}
       WHERE h.hearing_date = ? AND h.status = 'upcoming' AND ${notDeleted('h')} AND ${notDeleted('cs')}`
  type HearingAlert = {
    id: string
    title: string
    case_number: string
    office_case_number?: string
    case_year?: string
    first_instance_number?: string
    first_instance_year?: string
    appeal_number?: string
    appeal_year?: string
    cassation_number?: string
    cassation_year?: string
    opponent_name?: string
    client_name?: string
  }
  const hearingBody = (h: HearingAlert) => {
    const court = formattedCourtNumber(h)
    const parties = [h.client_name, h.opponent_name].filter(Boolean).join(' / ')
    const code = h.case_number ? `\u200E${String(h.case_number).replace(/^(CS|CL)-/i, '')}\u200E` : ''
    return [code, court, parties, h.title].filter(Boolean).join(' — ')
  }

  const todayHearings = db.prepare(hearingSelect).all(today) as HearingAlert[]
  for (const h of todayHearings) {
    notifyUser(null, 'جلسة اليوم', hearingBody(h), 'hearing', 'hearing', h.id)
  }

  const tomorrowHearings = db.prepare(hearingSelect).all(tomorrow) as HearingAlert[]
  for (const h of tomorrowHearings) {
    notifyUser(null, 'جلسة الغد', hearingBody(h), 'hearing', 'hearing', h.id)
  }

  const overdue = db
    .prepare(
      `SELECT t.id, t.title, t.description, cs.case_number, cs.office_case_number, cs.case_year,
              cs.first_instance_number, cs.first_instance_year, cs.appeal_number, cs.appeal_year,
              cs.cassation_number, cs.cassation_year, cs.court, cs.opponent_name,
              cl.full_name as client_name
       FROM tasks t
       LEFT JOIN cases cs ON cs.id = t.case_id AND ${notDeleted('cs')}
       LEFT JOIN clients cl ON cl.id = COALESCE(t.client_id, cs.client_id) AND ${notDeleted('cl')}
       WHERE t.status NOT IN ('completed','cancelled') AND t.due_date < ? AND ${notDeleted('t')}`
    )
    .all(today) as {
      id: string
      title: string
      description?: string
      case_number?: string
      office_case_number?: string
      case_year?: string
      court?: string
      opponent_name?: string
      client_name?: string
    }[]
  for (const t of overdue) {
    const changed = db
      .prepare(`UPDATE tasks SET status = 'overdue', updated_at = ? WHERE id = ? AND status != 'overdue'`)
      .run(nowIso(), t.id)
    if (changed.changes > 0) recordLocalChange('tasks', t.id, 'UPDATE')
    const courtNo = formattedCourtNumber(t as Record<string, unknown>)
    const parties = [t.client_name, t.opponent_name].filter(Boolean).join(' / ')
    const code = t.case_number ? `\u200E${String(t.case_number)}\u200E` : ''
    const bits = [code, courtNo, parties, t.court, t.description || t.title].filter(Boolean)
    notifyUser(null, 'مهمة متأخرة', bits.join(' — '), 'task', 'task', t.id)
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
