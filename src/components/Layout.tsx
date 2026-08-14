import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Search, Bell, Cloud, CloudOff, CloudCog } from 'lucide-react'
import { NAV_ITEMS } from '@shared/permissions'
import { useApp } from '../store'
import { useSyncStore } from '../store/sync'
import { Input } from './ui'
import { useEffect, useState } from 'react'
import { invoke } from '../lib/api'
import brandLogo from '../assets/brand-logo.png'
import { NAV_ICONS } from '../lib/navIcons'

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { page, setPage, user, can, theme, setTheme } = useApp()
  const sync = useSyncStore()
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [results, setResults] = useState<Record<string, { id: string; [k: string]: unknown }[]>>({})
  const [notes, setNotes] = useState<{ id: string; title: string; is_read: number }[]>([])
  const [expanded, setExpanded] = useState(true)
  const [holdClosed, setHoldClosed] = useState(false)

  useEffect(() => {
    if (page === 'home') return
    setHoldClosed(true)
    setExpanded(false)
  }, [page])

  useEffect(() => {
    invoke<{ id: string; title: string; is_read: number }[]>('notifications:list')
      .then(setNotes)
      .catch(() => undefined)
  }, [page])

  useEffect(() => {
    void useSyncStore.getState().refresh()
    const tmr = setInterval(() => {
      const s = useSyncStore.getState()
      if (s.status === 'syncing' || s.pendingCount > 0) void s.refresh()
    }, 1500)
    return () => clearInterval(tmr)
  }, [])

  const unread = notes.filter((n) => !n.is_read).length
  const rtl = i18n.language === 'ar'
  const syncKind =
    sync.status === 'synced' ? 'synced' : sync.status === 'syncing' ? 'syncing' : sync.error ? 'error' : 'offline'
  const syncLabel =
    syncKind === 'synced'
      ? t('sync.labelSynced')
      : syncKind === 'syncing'
        ? `${t('sync.labelSyncing')} · ${t('sync.remaining', { count: sync.pendingCount })}`
        : syncKind === 'error'
          ? t('sync.labelError')
          : t('sync.labelOffline')
  const syncTitle =
    syncKind === 'synced'
      ? t('sync.synced', { time: sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : '—' })
      : syncKind === 'syncing'
        ? t('sync.syncing', { count: sync.pendingCount })
        : syncKind === 'error'
          ? String(sync.error)
          : t('sync.offline')
  const syncColor =
    syncKind === 'synced'
      ? 'text-emerald-600'
      : syncKind === 'syncing'
        ? 'animate-pulse text-amber-500'
        : syncKind === 'error'
          ? 'text-red-500'
          : 'text-navy-400'
  const SyncIcon = syncKind === 'synced' ? Cloud : syncKind === 'syncing' ? CloudCog : CloudOff

  const go = (id: string, meta?: Record<string, unknown>) => {
    setHoldClosed(true)
    setExpanded(false)
    setPage(id, meta)
  }

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
    <div className="flex h-full" dir={rtl ? 'rtl' : 'ltr'}>
      <aside
        className={`flex shrink-0 flex-col bg-navy-950 text-navy-100 transition-[width] duration-200 ${expanded ? 'w-64' : 'w-[4.5rem]'}`}
        onMouseEnter={() => {
          if (!holdClosed) setExpanded(true)
        }}
        onMouseLeave={() => {
          setHoldClosed(false)
          setExpanded(false)
        }}
      >
        <div className="border-b border-navy-800 px-3 py-4">
          <img src={brandLogo} alt="" className={`mb-2 object-contain ${expanded ? 'h-16 w-16' : 'h-10 w-10'}`} />
          {expanded && (
            <>
              <div className="text-xs text-gold-400">Law Office</div>
              <div className="text-lg leading-tight text-white">{t('appName')}</div>
            </>
          )}
        </div>
        <nav className="flex-1 overflow-auto py-1">
          {NAV_ITEMS.filter((n) => !n.permission || can(n.permission)).map((n, i) => {
            const Icon = NAV_ICONS[n.id] ?? LayoutDashboard
            const active = page === n.id
            const stripe = i % 2 === 0 ? 'bg-navy-800' : 'bg-[#6b7280]'
            return (
              <button
                key={n.id}
                title={t(`nav.${n.id}`)}
                onClick={() => go(n.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-base ${stripe} ${
                  active ? 'text-gold-300 ring-1 ring-inset ring-gold-400/50' : 'text-white hover:brightness-110'
                }`}
              >
                <Icon size={22} className="shrink-0" />
                {expanded && <span className="truncate">{t(`nav.${n.id}`)}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-navy-800 p-3 text-xs">
          {expanded ? (
            <>
              <div className="text-white">{user?.fullName}</div>
              <div className="text-navy-300">{user?.roleNameAr}</div>
            </>
          ) : (
            <div className="truncate text-center text-white" title={user?.fullName}>
              {(user?.fullName || '?').slice(0, 1)}
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-navy-100 bg-white px-5 py-3 text-navy-800 dark:bg-navy-900 dark:border-navy-800 dark:text-navy-50">
          <Search size={18} className="text-navy-400" />
          <Input placeholder={t('search')} value={q} onChange={(e) => runSearch(e.target.value)} className="max-w-md" />
          <div className="flex-1" />
          <button
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm hover:bg-navy-50 dark:hover:bg-navy-800 ${syncColor}`}
            onClick={() => go('settings')}
            title={syncTitle}
          >
            <SyncIcon size={18} />
            <span>{syncLabel}</span>
            {syncKind === 'syncing' && sync.pendingCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                {sync.pendingCount}
              </span>
            ) : null}
          </button>
          <button
            className="relative rounded-lg p-2 hover:bg-navy-50 dark:hover:bg-navy-800"
            onClick={() => go('reminders')}
            title={t('notifications')}
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
                {unread}
              </span>
            )}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50 dark:hover:bg-navy-800" onClick={() => go('search')}>
            {t('advancedSearch')}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50 dark:hover:bg-navy-800" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? t('dark') : t('light')}
          </button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-navy-50 dark:hover:bg-navy-800" onClick={() => go('settings')}>
            {user?.username}
          </button>
        </header>
        <main className="relative flex-1 overflow-auto p-5">
          {searchOpen && (
            <div className="absolute right-5 top-0 z-20 w-[480px] rounded-xl border bg-white p-3 shadow-xl dark:bg-navy-900 dark:border-navy-700 dark:text-navy-50">
              {Object.entries(results).map(([k, rows]) =>
                rows?.length ? (
                  <div key={k} className="mb-2">
                    <div className="text-xs text-navy-400">{k}</div>
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-2 py-1 text-right text-sm hover:bg-navy-50"
                        onClick={() => {
                          setSearchOpen(false)
                          if (k === 'clients') go('clients', { id: r.id })
                          else if (k === 'cases') go('cases', { id: r.id })
                          else go(k === 'poa' ? 'poa' : k)
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
