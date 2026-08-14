import { create } from 'zustand'
import { invoke } from '../lib/api'

export type SyncUiStatus = 'offline' | 'syncing' | 'synced'

export type SyncSnapshot = {
  status: SyncUiStatus
  lastSyncedAt: string
  pendingCount: number
  error?: string
}

type SyncState = SyncSnapshot & {
  setSnapshot: (s: Partial<SyncSnapshot>) => void
  refresh: () => Promise<void>
  syncNow: () => Promise<void>
}

function applySnapshot(prev: SyncSnapshot, snap: Partial<SyncSnapshot>): SyncSnapshot {
  const status = snap.status ?? prev.status
  let pending = snap.pendingCount
  if (typeof pending !== 'number' || Number.isNaN(pending)) pending = prev.pendingCount
  if (status === 'synced' || status === 'offline') pending = snap.pendingCount ?? 0
  return { ...prev, ...snap, status, pendingCount: pending }
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'offline',
  lastSyncedAt: '',
  pendingCount: 0,
  error: '',
  setSnapshot: (s) => set((prev) => applySnapshot(prev, s)),
  refresh: async () => {
    try {
      const snap = await invoke<SyncSnapshot>('sync:status')
      set((prev) => applySnapshot(prev, snap))
    } catch {
      set({ status: 'offline' })
    }
  },
  syncNow: async () => {
    set((prev) => ({ ...prev, status: 'syncing' }))
    const snap = await invoke<SyncSnapshot>('sync:now')
    set((prev) => applySnapshot(prev, snap))
  }
}))
