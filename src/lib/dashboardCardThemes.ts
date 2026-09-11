export type DashCardTheme = {
  wrap: string
  label: string
  value: string
}

const CYCLE: DashCardTheme[] = [
  {
    wrap: 'border-navy-200 bg-gradient-to-br from-navy-50 to-white dark:from-navy-900 dark:to-navy-800 dark:border-navy-700',
    label: 'text-navy-600 dark:text-navy-300',
    value: 'text-navy-900 dark:text-white'
  },
  {
    wrap: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:from-navy-900 dark:to-amber-950/30 dark:border-amber-900/40',
    label: 'text-amber-800 dark:text-amber-200',
    value: 'text-navy-900 dark:text-amber-50'
  },
  {
    wrap: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:from-navy-900 dark:to-sky-950/30 dark:border-sky-900/40',
    label: 'text-sky-800 dark:text-sky-200',
    value: 'text-navy-900 dark:text-sky-50'
  },
  {
    wrap: 'border-teal-200 bg-gradient-to-br from-teal-50 to-white dark:from-navy-900 dark:to-teal-950/30 dark:border-teal-900/40',
    label: 'text-teal-800 dark:text-teal-200',
    value: 'text-navy-900 dark:text-teal-50'
  },
  {
    wrap: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:from-navy-900 dark:to-slate-800 dark:border-slate-700',
    label: 'text-slate-600 dark:text-slate-300',
    value: 'text-navy-900 dark:text-slate-50'
  },
  {
    wrap: 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-white dark:from-navy-900 dark:to-indigo-950/30 dark:border-indigo-900/40',
    label: 'text-indigo-800 dark:text-indigo-200',
    value: 'text-navy-900 dark:text-indigo-50'
  },
  {
    wrap: 'border-stone-200 bg-gradient-to-br from-stone-50 to-white dark:from-navy-900 dark:to-stone-800 dark:border-stone-700',
    label: 'text-stone-600 dark:text-stone-300',
    value: 'text-navy-900 dark:text-stone-50'
  },
  {
    wrap: 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white dark:from-navy-900 dark:to-cyan-950/25 dark:border-cyan-900/40',
    label: 'text-cyan-800 dark:text-cyan-200',
    value: 'text-navy-900 dark:text-cyan-50'
  }
]

const BY_KEY: Record<string, number> = {
  clients: 1,
  newClients: 1,
  cases: 2,
  openCases: 2,
  closedCases: 4,
  postponedCases: 5,
  actionCases: 3,
  hearingsToday: 3,
  hearingsTomorrow: 3,
  hearingsWeek: 3,
  upcomingAppointments: 6,
  overdueTasks: 0,
  todayTasks: 0,
  reminders: 7,
  income: 1,
  expenses: 4,
  profit: 6,
  due: 5
}

export function dashboardCardTheme(key: string, index: number): DashCardTheme {
  const n = BY_KEY[key] ?? index
  return CYCLE[n % CYCLE.length]
}

export const DASHBOARD_CHART_WRAP = [
  'border-navy-200 bg-gradient-to-br from-navy-50/80 to-white dark:from-navy-900 dark:border-navy-800',
  'border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white dark:from-navy-900 dark:border-navy-800',
  'border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white dark:from-navy-900 dark:border-navy-800',
  'border-teal-200/80 bg-gradient-to-br from-teal-50/70 to-white dark:from-navy-900 dark:border-navy-800'
]
