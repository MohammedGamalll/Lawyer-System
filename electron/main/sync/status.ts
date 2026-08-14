import { pendingCount as queuePendingCount } from './queue'

export type SyncUiStatus = 'offline' | 'syncing' | 'synced'

export type SyncSnapshot = {
  status: SyncUiStatus
  lastSyncedAt: string
  pendingCount: number
  error?: string
}

let lastStatus: SyncUiStatus = 'offline'
let lastError = ''
let lastSyncedAt = ''
let lastPending = 0
let listeners: Array<(s: SyncSnapshot) => void> = []

function readPending(): number {
  try {
    return queuePendingCount()
  } catch {
    return lastPending
  }
}

export function emitSyncStatus(status: SyncUiStatus, error = ''): void {
  lastStatus = status
  lastError = error
  if (status === 'synced') lastSyncedAt = new Date().toISOString()
  lastPending = readPending()
  const snap = getSyncSnapshot()
  for (const fn of listeners) fn(snap)
}

export function onSyncStatus(fn: (s: SyncSnapshot) => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((x) => x !== fn)
  }
}

export function getSyncSnapshot(): SyncSnapshot {
  return {
    status: lastStatus,
    lastSyncedAt,
    pendingCount: lastPending,
    error: lastError
  }
}

export function setPendingOnSnapshot(count: number) {
  return { ...getSyncSnapshot(), pendingCount: count }
}
