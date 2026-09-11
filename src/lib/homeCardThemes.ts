export type HomeCardTheme = {
  wrap: string
  icon: string
  text: string
}

const CYCLE: HomeCardTheme[] = [
  {
    wrap: 'border-navy-200 bg-gradient-to-br from-navy-50 via-white to-navy-100/70 hover:border-navy-400 dark:from-navy-900 dark:via-navy-900 dark:to-navy-800 dark:border-navy-700',
    icon: 'bg-navy-800 text-gold-300',
    text: 'text-navy-900 dark:text-white'
  },
  {
    wrap: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-gold-100/80 hover:border-gold-400 dark:from-navy-900 dark:via-navy-900 dark:to-amber-950/40 dark:border-amber-900/50',
    icon: 'bg-amber-700 text-amber-50',
    text: 'text-navy-900 dark:text-amber-50'
  },
  {
    wrap: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-navy-50 hover:border-sky-400 dark:from-navy-900 dark:to-sky-950/40 dark:border-sky-900/40',
    icon: 'bg-sky-800 text-sky-50',
    text: 'text-navy-900 dark:text-sky-50'
  },
  {
    wrap: 'border-teal-200 bg-gradient-to-br from-teal-50 via-white to-navy-50 hover:border-teal-400 dark:from-navy-900 dark:to-teal-950/40 dark:border-teal-900/40',
    icon: 'bg-teal-800 text-teal-50',
    text: 'text-navy-900 dark:text-teal-50'
  },
  {
    wrap: 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-navy-50 hover:border-slate-400 dark:from-navy-900 dark:to-slate-800 dark:border-slate-700',
    icon: 'bg-slate-700 text-slate-50',
    text: 'text-navy-900 dark:text-slate-50'
  },
  {
    wrap: 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-navy-50 hover:border-indigo-300 dark:from-navy-900 dark:to-indigo-950/40 dark:border-indigo-900/40',
    icon: 'bg-indigo-800 text-indigo-50',
    text: 'text-navy-900 dark:text-indigo-50'
  },
  {
    wrap: 'border-stone-200 bg-gradient-to-br from-stone-50 via-white to-amber-50 hover:border-stone-400 dark:from-navy-900 dark:to-stone-800 dark:border-stone-700',
    icon: 'bg-stone-700 text-stone-50',
    text: 'text-navy-900 dark:text-stone-50'
  },
  {
    wrap: 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 hover:border-cyan-400 dark:from-navy-900 dark:to-cyan-950/30 dark:border-cyan-900/40',
    icon: 'bg-cyan-800 text-cyan-50',
    text: 'text-navy-900 dark:text-cyan-50'
  }
]

const BY_ID: Record<string, number> = {
  dashboard: 0,
  clients: 1,
  cases: 2,
  hearings: 3,
  opponents: 4,
  documents: 5,
  accounts: 6,
  settings: 7
}

export function homeCardTheme(id: string, index: number): HomeCardTheme {
  const n = BY_ID[id] ?? index
  return CYCLE[n % CYCLE.length]
}
