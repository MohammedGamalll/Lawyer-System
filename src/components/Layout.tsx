import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Users, Briefcase, Gavel, CalendarDays, ListTodo, Bell, FileText, ScrollText,
  FileSignature, UserX, Scale, IdCard, MessageSquare, Mail, Wallet, Landmark, Receipt, BarChart3,
  Archive, Shield, Settings, Search, ClipboardList
} from 'lucide-react'
import { NAV_ITEMS } from '@shared/permissions'
import { useApp } from '../store'
import { Input } from './ui'
import { useEffect, useState } from 'react'
import { invoke } from '../lib/api'

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard,
  clients: Users,
  cases: Briefcase,
  hearings: Gavel,
  calendar: CalendarDays,
  tasks: ListTodo,
  reminders: Bell,
  documents: FileText,
  poa: ScrollText,
  contracts: FileSignature,
  opponents: UserX,
  lawyers: Scale,
  employees: IdCard,
  consultations: MessageSquare,
  correspondence: Mail,
  accounts: Wallet,
  cashbox: Landmark,
  invoices: Receipt,
  reports: BarChart3,
  archive: Archive,
  users: Shield,
  audit: ClipboardList,
  settings: Settings
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { page, setPage, user, can, theme, setTheme, updateReady } = useApp()
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [results, setResults] = useState<Record<string, { id: number; [k: string]: unknown }[]>>({})
  const [notes, setNotes] = useState<{ id: number; title: string; is_read: number }[]>([])

  useEffect(() => {
    invoke<{ id: number; title: string; is_read: number }[]>('notifications:list')
      .then(setNotes)
      .catch(() => undefined)
  }, [page])

  const unread = notes.filter((n) => !n.is_read).length

  const runSearch = async (term: string) => {
    setQ(term)
    if (term.length < 2) {
      setSearchOpen(false)
      return
    }
    const r = await invoke<typeof results>('search:global', term)
    setResults(r)
    setSearchOpen(true)
  }

  return (
    <div className="flex h-full" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <aside className="flex w-64 shrink-0 flex-col bg-navy-950 text-navy-100">
        <div className="border-b border-navy-800 px-4 py-5">
          <div className="text-xs text-gold-400">Law Office</div>
          <div className="text-lg font-extrabold leading-tight text-white">{t('appName')}</div>
        </div>
        <nav className="flex-1 overflow-auto py-2">
          {NAV_ITEMS.filter((n) => !n.permission || can(n.permission)).map((n) => {
            const Icon = ICONS[n.id] ?? LayoutDashboard
            const active = page === n.id
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm ${active ? 'bg-gold-400/15 text-gold-300' : 'hover:bg-white/5'}`}
              >
                <Icon size={18} />
                {t(`nav.${n.id}`)}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-navy-800 p-4 text-xs">
          <div className="font-bold text-white">{user?.fullName}</div>
          <div className="text-navy-300">{user?.roleNameAr}</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-navy-100 bg-white px-5 py-3 dark:bg-navy-900 dark:border-navy-800">
          <Search size={18} className="text-navy-400" />
          <Input placeholder={t('search')} value={q} onChange={(e) => runSearch(e.target.value)} className="max-w-md" />
          <div className="flex-1" />
          <button
            className="relative rounded-lg p-2 hover:bg-navy-50"
            onClick={() => setPage('reminders')}
            title={t('notifications')}
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50" onClick={() => setPage('search')}>
            {t('advancedSearch')}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? t('dark') : t('light')}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50" onClick={() => setPage('settings')}>
            {user?.username}
          </button>
        </header>
        <main className="relative flex-1 overflow-auto p-5">
          {updateReady && (
            <div className="mb-3 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm">
              {t('updateReady', { version: updateReady })}
            </div>
          )}
          {searchOpen && (
            <div className="absolute right-5 top-0 z-20 w-[480px] rounded-xl border bg-white p-3 shadow-xl dark:bg-navy-900">
              {Object.entries(results).map(([k, rows]) =>
                rows?.length ? (
                  <div key={k} className="mb-2">
                    <div className="text-xs font-bold text-navy-400">{k}</div>
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-2 py-1 text-right text-sm hover:bg-navy-50"
                        onClick={() => {
                          setSearchOpen(false)
                          if (k === 'clients') setPage('clients', { id: r.id })
                          else if (k === 'cases') setPage('cases', { id: r.id })
                          else setPage(k === 'poa' ? 'poa' : k)
                        }}
                      >
                        {String(r.full_name || r.title || r.case_number || r.payment_number || r.id)}
                      </button>
                    ))}
                  </div>
                ) : null
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
