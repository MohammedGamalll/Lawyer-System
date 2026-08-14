import { getDb } from '../db/database'
import { addDays } from '../utils/time'

export function dashboardStats() {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = addDays(today, 1).slice(0, 10)
  const weekEnd = addDays(today, 7).slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const scalar = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { c: number }).c

  const clients = scalar('SELECT COUNT(*) as c FROM clients WHERE is_archived = 0')
  const newClients = scalar('SELECT COUNT(*) as c FROM clients WHERE date(created_at) >= ?', monthStart)
  const cases = scalar('SELECT COUNT(*) as c FROM cases WHERE is_archived = 0')
  const openCases = scalar(
    `SELECT COUNT(*) as c FROM cases WHERE is_archived = 0 AND status NOT IN ('closed','archived')`
  )
  const closedCases = scalar(`SELECT COUNT(*) as c FROM cases WHERE status = 'closed'`)
  const postponedCases = scalar(`SELECT COUNT(*) as c FROM cases WHERE status = 'postponed'`)
  const actionCases = scalar(
    `SELECT COUNT(*) as c FROM cases WHERE status IN ('new','under_review','for_judgment','execution') AND is_archived = 0`
  )
  const hearingsToday = scalar(`SELECT COUNT(*) as c FROM hearings WHERE hearing_date = ? AND status = 'upcoming'`, today)
  const hearingsTomorrow = scalar(`SELECT COUNT(*) as c FROM hearings WHERE hearing_date = ? AND status = 'upcoming'`, tomorrow)
  const hearingsWeek = scalar(
    `SELECT COUNT(*) as c FROM hearings WHERE hearing_date BETWEEN ? AND ? AND status = 'upcoming'`,
    today,
    weekEnd
  )
  const upcomingAppointments = scalar(
    `SELECT COUNT(*) as c FROM appointments WHERE date >= ? AND status = 'scheduled'`,
    today
  )
  const overdueTasks = scalar(
    `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < ?`,
    today
  )
  const todayTasks = scalar(`SELECT COUNT(*) as c FROM tasks WHERE due_date = ? AND status NOT IN ('completed','cancelled')`, today)
  const reminders = scalar(`SELECT COUNT(*) as c FROM reminders WHERE is_dismissed = 0 AND is_sent = 0`)
  const income = (db.prepare('SELECT COALESCE(SUM(amount),0) as c FROM payments').get() as { c: number }).c
  const expenses = (db.prepare('SELECT COALESCE(SUM(amount),0) as c FROM expenses').get() as { c: number }).c
  const due = (db.prepare('SELECT COALESCE(SUM(remaining),0) as c FROM case_fees').get() as { c: number }).c

  const casesByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM cases GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const casesByType = db
    .prepare(
      `SELECT COALESCE(ct.name_ar,'غير محدد') as name, COUNT(*) as count
       FROM cases c LEFT JOIN case_types ct ON ct.id = c.case_type_id GROUP BY ct.id`
    )
    .all()
  const incomeByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as total FROM payments GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const expenseByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total FROM expenses GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all()
  const lawyerPerf = db
    .prepare(
      `SELECT l.full_name as name,
              SUM(CASE WHEN c.status NOT IN ('closed','archived') THEN 1 ELSE 0 END) as open_count,
              SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) as closed_count,
              COUNT(*) as total
       FROM lawyers l LEFT JOIN cases c ON c.primary_lawyer_id = l.id
       GROUP BY l.id`
    )
    .all()
  const activity = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 12').all()
  const todayHearingList = db
    .prepare(
      `SELECT h.*, cs.case_number, cs.title as case_title, cl.full_name as client_name
       FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id
       WHERE h.hearing_date = ? ORDER BY h.hearing_time`
    )
    .all(today)

  return {
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
}
