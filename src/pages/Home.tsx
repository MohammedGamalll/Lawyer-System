import { useTranslation } from 'react-i18next'
import { NAV_ITEMS } from '@shared/permissions'
import { useApp } from '../store'
import { NAV_ICONS } from '../lib/navIcons'
import { LayoutDashboard } from 'lucide-react'

export function HomePage() {
  const { t } = useTranslation()
  const { setPage, can } = useApp()
  const items = NAV_ITEMS.filter((n) => n.id !== 'home' && (!n.permission || can(n.permission)))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl text-navy-900 dark:text-white">{t('nav.home')}</h1>
        <p className="mt-1 text-lg text-navy-600 dark:text-navy-200">{t('home.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map((n) => {
          const Icon = NAV_ICONS[n.id] ?? LayoutDashboard
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setPage(n.id)}
              className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border border-navy-100 bg-white px-4 py-6 text-center shadow-card transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-lg dark:border-navy-700 dark:bg-navy-900"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-800 text-gold-300 dark:bg-navy-800">
                <Icon size={36} />
              </span>
              <span className="text-xl leading-snug text-navy-900 dark:text-white">{t(`nav.${n.id}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
