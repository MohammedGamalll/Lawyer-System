import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { pendingCount } from './queue'
import { isSyncConfigured } from './client'
import { isOnline } from './network'
import { pushQueue } from './push'
import { pullChanges } from './pull'
import { startRealtime, stopRealtime } from './realtime'
import { emitSyncStatus, getSyncSnapshot, onSyncStatus } from './status'

let timer: NodeJS.Timeout | null = null
let cycle: Promise<void> | null = null
let getWin: () => BrowserWindow | null = () => null

export function getSyncState() {
  let pending = 0
  try {
    pending = pendingCount()
  } catch {
    pending = getSyncSnapshot().pendingCount
  }
  const snap = getSyncSnapshot()
  if (!isSyncConfigured() || !isOnline()) return { ...snap, status: 'offline' as const, pendingCount: pending }
  if (pending > 0) return { ...snap, pendingCount: pending, status: 'syncing' as const }
  return { ...snap, pendingCount: pending, status: 'synced' as const }
}

export async function runSyncCycle(): Promise<void> {
  if (cycle) return cycle
  if (!isSyncConfigured() || !isOnline()) {
    emitSyncStatus('offline')
    stopRealtime()
    return
  }
  cycle = (async () => {
    try {
      const pushError = await pushQueue()
      await pullChanges()
      startRealtime(getWin)
      const pending = pendingCount()
      if (pending > 0) emitSyncStatus('syncing', pushError)
      else emitSyncStatus('synced')
      getWin()?.webContents.send('sync:changed', { table: '*' })
    } catch (err) {
      log.warn('sync cycle', err)
      emitSyncStatus('offline', String((err as Error).message || err))
    }
  })().finally(() => {
    cycle = null
  })
  return cycle
}

export function startSyncService(winGetter: () => BrowserWindow | null): void {
  getWin = winGetter
  onSyncStatus((snap) => {
    getWin()?.webContents.send('sync:status', snap)
  })
  void runSyncCycle()
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void runSyncCycle()
  }, 20_000)
}

export { onSyncStatus, getSyncSnapshot }
