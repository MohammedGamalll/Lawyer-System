import { create } from 'zustand'
import { toast as sonner } from 'sonner'
import type { UserSession } from '@shared/types'
import { invoke } from './lib/api'

type AppState = {
  user: UserSession | null
  page: string
  pageMeta: Record<string, unknown>
  theme: 'light' | 'dark'
  lang: 'ar' | 'en'
  updateReady: string | null
  setPage: (page: string, meta?: Record<string, unknown>) => void
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
  theme: 'light',
  lang: 'ar',
  updateReady: null,
  setPage: (page, meta = {}) => set({ page, pageMeta: meta }),
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
