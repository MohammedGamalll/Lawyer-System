import { create } from 'zustand'

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

type UpdateState = {
  phase: UpdatePhase
  version: string
  percent: number
  error: string
  setChecking: () => void
  setAvailable: (version: string) => void
  setProgress: (percent: number) => void
  setReady: (version: string) => void
  setError: (error: string) => void
  clear: () => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: 'idle',
  version: '',
  percent: 0,
  error: '',
  setChecking: () => set({ phase: 'checking', error: '' }),
  setAvailable: (version) => set({ phase: 'available', version, percent: 0, error: '' }),
  setProgress: (percent) =>
    set({
      phase: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(percent)))
    }),
  setReady: (version) => set({ phase: 'ready', version, percent: 100, error: '' }),
  setError: (error) => set({ phase: 'error', error }),
  clear: () => set({ phase: 'idle', version: '', percent: 0, error: '' })
}))
