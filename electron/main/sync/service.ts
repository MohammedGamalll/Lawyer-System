import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { pendingCount, setAfterLocalChange } from './queue'
import { isCorruptError } from '../db/repair'
import { repairCorruptDatabase } from '../db/database'
import { isSyncConfigured } from './client'
import { guardAbortError, isSyncPaused, runPrePushGuard, setAuthGuardWindow } from './authGuard'
import { mapSyncError } from './errors'
import { pushQueue } from './push'
import { pullChanges } from './pull'
import { startRealtime, stopRealtime } from './realtime'
import { emitSyncStatus, getSyncSnapshot, onSyncStatus } from './status'

const POLL_MS = 120_000
const SAVE_DEBOUNCE_MS = 2_000

let timer: NodeJS.Timeout | null = null
let saveTimer: NodeJS.Timeout | null = null
let cycle: Promise<void> | null = null
let getWin: () => BrowserWindow | null = () => null

export function scheduleSyncSoon(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void runSyncCycle()
  }, SAVE_DEBOUNCE_MS)
}

export function getSyncState() {
  let pending = 0
  try {
    pending = pendingCount()
  } catch {
    pending = getSyncSnapshot().pendingCount
  }
  const snap = getSyncSnapshot()
  if (!isSyncConfigured()) return { ...snap, status: 'offline' as const, pendingCount: pending }
  const pauseErr = guardAbortError()
  if (isSyncPaused() && pauseErr) {
    return { ...snap, pendingCount: pending, status: 'syncing' as const, error: pauseErr }
  }
  if (cycle || pending > 0) return { ...snap, pendingCount: pending, status: 'syncing' as const }
  return { ...snap, pendingCount: pending, status: 'synced' as const }
}

export async function runSyncCycle(): Promise<void> {
  if (cycle) return cycle
  if (!isSyncConfigured()) {
    emitSyncStatus('offline')
    stopRealtime()
    return
  }
  emitSyncStatus('syncing')
  cycle = (async () => {
    try {
      const guard = await runPrePushGuard()
      if (!guard.proceed) {
        emitSyncStatus('syncing', guard.error || guardAbortError())
        return
      }
      const pushError = mapSyncError(await pushQueue())
      await pullChanges()
      startRealtime(getWin)
      const pending = pendingCount()
      if (pending > 0) emitSyncStatus('syncing', pushError)
      else emitSyncStatus('synced')
      getWin()?.webContents.send('sync:changed', { table: '*' })
    } catch (err) {
      log.warn('sync cycle', err)
      if (isCorruptError(err)) {
        try {
          repairCorruptDatabase()
        } catch (repairErr) {
          log.warn('sync sqlite repair failed', repairErr)
        }
      }
      const message = mapSyncError(String((err as Error).message || err))
      try {
        if (pendingCount() > 0) emitSyncStatus('syncing', message)
        else emitSyncStatus('offline', message)
      } catch {
        emitSyncStatus('offline', message)
      }
    }
  })().finally(() => {
    cycle = null
  })
  return cycle
}

export function startSyncService(winGetter: () => BrowserWindow | null): void {
  getWin = winGetter
  setAuthGuardWindow(winGetter)
  setAfterLocalChange(scheduleSyncSoon)
  onSyncStatus((snap) => {
    getWin()?.webContents.send('sync:status', snap)
  })
  void runSyncCycle()
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void runSyncCycle()
  }, POLL_MS)
}

export { onSyncStatus, getSyncSnapshot }
