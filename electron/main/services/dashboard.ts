import { getDb } from '../db/database'
import { addDays } from '../utils/time'
import { notDeleted } from '../db/ids'
import type { AuthedUser } from '../ipc/helpers'
import { hasAnyPermission } from '../ipc/session'

export function dashboardStats(actor?: AuthedUser | null) {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = addDays(today, 1).slice(0, 10)
  const weekEnd = addDays(today, 7).slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const scalar = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { c: number }).c

  const clients = scalar(`SELECT COUNT(*) as c FROM clients WHERE is_archived = 0 AND ${notDeleted()}`)
  const newClients = scalar(`SELECT COUNT(*) as c FROM clients WHERE date(created_at) >= ? AND ${notDeleted()}`, monthStart)
  const cases = scalar(`SELECT COUNT(*) as c FROM cases WHERE is_archived = 0 AND ${notDeleted()}`)
  const openCases = scalar(
    `SELECT COUNT(*) as c FROM cases WHERE is_archived = 0 AND status NOT IN ('closed','archived') AND ${notDeleted()}`
  )
  const closedCases = scalar(`SELECT COUNT(*) as c FROM cases WHERE status = 'closed' AND ${notDeleted()}`)
  const postponedCases = scalar(`SELECT COUNT(*) as c FROM cases WHERE status = 'postponed' AND ${notDeleted()}`)
  const actionCases = scalar(
    `SELECT COUNT(*) as c FROM cases WHERE status IN ('new','under_review','for_judgment','execution') AND is_archived = 0 AND ${notDeleted()}`
  )
  const hearingsToday = scalar(
    `SELECT COUNT(*) as c FROM hearings WHERE hearing_date = ? AND status = 'upcoming' AND ${notDeleted()}`,
    today
  )
  const hearingsTomorrow = scalar(
    `SELECT COUNT(*) as c FROM hearings WHERE hearing_date = ? AND status = 'upcoming' AND ${notDeleted()}`,
    tomorrow
  )
  const hearingsWeek = scalar(
    `SELECT COUNT(*) as c FROM hearings WHERE hearing_date BETWEEN ? AND ? AND status = 'upcoming' AND ${notDeleted()}`,
    today,
    weekEnd
  )
  const upcomingAppointments = scalar(
    `SELECT COUNT(*) as c FROM appointments WHERE date >= ? AND status = 'scheduled' AND ${notDeleted()}`,
    today
  )
  const overdueTasks = scalar(
    `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < ? AND ${notDeleted()}`,
    today
  )
  const todayTasks = scalar(
    `SELECT COUNT(*) as c FROM tasks WHERE due_date = ? AND status NOT IN ('completed','cancelled') AND ${notDeleted()}`,
    today
  )
  const reminders = scalar(`SELECT COUNT(*) as c FROM reminders WHERE is_dismissed = 0 AND is_sent = 0 AND ${notDeleted()}`)
  const income = (db.prepare(`SELECT COALESCE(SUM(amount),0) as c FROM payments WHERE ${notDeleted()}`).get() as { c: number }).c
  const expenses = (db.prepare(`SELECT COALESCE(SUM(amount),0) as c FROM expenses WHERE ${notDeleted()}`).get() as { c: number }).c
  const due = (db.prepare(`SELECT COALESCE(SUM(remaining),0) as c FROM case_fees WHERE ${notDeleted()}`).get() as { c: number }).c

  const casesByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM cases WHERE ${notDeleted()} GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const casesByType = db
    .prepare(
      `SELECT COALESCE(ct.name_ar,'غير محدد') as name, COUNT(*) as count
       FROM cases c LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
       WHERE ${notDeleted('c')} GROUP BY ct.id`
    )
    .all()
  const incomeByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as total FROM payments WHERE ${notDeleted()} GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const expenseByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total FROM expenses WHERE ${notDeleted()} GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const lawyerPerf = db
    .prepare(
      `SELECT l.full_name as name,
              SUM(CASE WHEN c.status NOT IN ('closed','archived') THEN 1 ELSE 0 END) as open_count,
              SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) as closed_count,
              COUNT(c.id) as total
       FROM lawyers l LEFT JOIN cases c ON c.primary_lawyer_id = l.id AND ${notDeleted('c')}
       WHERE ${notDeleted('l')}
       GROUP BY l.id`
    )
    .all()
  const activity = db.prepare(`SELECT * FROM audit_logs WHERE ${notDeleted()} ORDER BY created_at DESC LIMIT 12`).all()
  const todayHearingList = db
    .prepare(
      `SELECT h.*, cs.case_number, cs.title as case_title, cs.id as case_id, cl.full_name as client_name
       FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id
       WHERE h.hearing_date = ? AND ${notDeleted('h')} AND ${notDeleted('cs')} AND ${notDeleted('cl')}
       ORDER BY h.hearing_time`
    )
    .all(today)

  const base = {
    clients,
    newClients,
    cases,
    openCases,
    closedCases,
    postponedCases,
    actionCases,
    hearingsToday,
    hearingsTomorrow,
    hearingsWeek,
    upcomingAppointments,
    overdueTasks,
    todayTasks,
    reminders,
    income,
    expenses,
    profit: income - expenses,
    due,
    casesByMonth: (casesByMonth as object[]).reverse(),
    casesByType,
    incomeByMonth: (incomeByMonth as object[]).reverse(),
    expenseByMonth: (expenseByMonth as object[]).reverse(),
    lawyerPerf,
    activity,
    todayHearingList
  }
  if (!actor || !hasAnyPermission(actor, 'accounts.view')) {
    return {
      ...base,
      income: 0,
      expenses: 0,
      profit: 0,
      due: 0,
      incomeByMonth: [],
      expenseByMonth: []
    }
  }
  return base
}
