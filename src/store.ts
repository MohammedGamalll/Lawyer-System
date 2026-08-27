import { create } from 'zustand'
import { toast as sonner } from 'sonner'
import type { UserSession } from '@shared/types'
import { invoke } from './lib/api'

type NavEntry = { page: string; pageMeta: Record<string, unknown> }

type AppState = {
  user: UserSession | null
  page: string
  pageMeta: Record<string, unknown>
  navStack: NavEntry[]
  theme: 'light' | 'dark'
  lang: 'ar' | 'en'
  updateReady: string | null
  setPage: (page: string, meta?: Record<string, unknown>, opts?: { replace?: boolean }) => void
  goBack: () => void
  toast: (text: string, type?: 'ok' | 'err') => void
  setUser: (u: UserSession | null) => void
  applyTheme: (t: 'light' | 'dark') => void
  setTheme: (t: 'light' | 'dark') => void
  setLang: (l: 'ar' | 'en') => void
  setUpdateReady: (v: string | null) => void
  can: (code: string) => boolean
  refreshMe: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  page: 'home',
  pageMeta: {},
  navStack: [],
  theme: 'light',
  lang: 'ar',
  updateReady: null,
  setPage: (page, meta = {}, opts) => {
    if (opts?.replace) {
      set({ page, pageMeta: meta })
      return
    }
    const cur = get()
    if (cur.page === page && JSON.stringify(cur.pageMeta) === JSON.stringify(meta)) return
    set({
      page,
      pageMeta: meta,
      navStack: [...cur.navStack, { page: cur.page, pageMeta: cur.pageMeta }]
    })
  },
  goBack: () => {
    const stack = [...get().navStack]
    const prev = stack.pop()
    if (!prev) {
      set({ page: 'home', pageMeta: {}, navStack: [] })
      return
    }
    set({ page: prev.page, pageMeta: prev.pageMeta, navStack: stack })
  },
  toast: (text, type = 'ok') => {
    if (type === 'err') sonner.error(text)
    else sonner.success(text)
  },
  setUser: (u) => set({ user: u }),
  applyTheme: (t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    set({ theme: t })
  },
  setTheme: (t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    set({ theme: t })
    void invoke('settings:set', { theme: t }).catch(() => undefined)
  },
  setLang: (l) => set({ lang: l }),
  setUpdateReady: (v) => set({ updateReady: v }),
  can: (code) => {
    const u = get().user
    if (!u) return false
    if (u.roleCode === 'admin') return true
    return u.permissions.includes(code)
  },
  refreshMe: async () => {
    const u = await invoke<UserSession>('auth:me')
    set({ user: u })
  }
}))
