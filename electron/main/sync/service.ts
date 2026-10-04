import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { pendingCount, setAfterLocalChange } from './queue'
import { isCorruptError } from '../db/repair'
import { repairCorruptDatabase } from '../db/database'
import { beginAdoptCache, endAdoptCache } from './adoptRemoteId'
import { isSyncConfigured } from './client'
import { guardAbortError, isSyncPaused, runPrePushGuard, setAuthGuardWindow } from './authGuard'
import { mapSyncError } from './errors'
import { pushQueue } from './push'
import { pullChanges, hasIncompletePull, needsFullPull } from './pull'
import { startRealtime, stopRealtime } from './realtime'
import { emitSyncStatus, getSyncSnapshot, onSyncStatus } from './status'
import { CYCLE_TIMEOUT_MS, TIMEOUT_MESSAGE, withTimeout } from './timeout'

const POLL_MS = 120_000
const SAVE_DEBOUNCE_MS = 2_000

let timer: NodeJS.Timeout | null = null
let saveTimer: NodeJS.Timeout | null = null
let cycle: Promise<void> | null = null
let getWin: () => BrowserWindow | null = () => null

export function isCycleRunning(): boolean {
  return Boolean(cycle)
}

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
  if (needsFullPull() || hasIncompletePull()) {
    return { ...snap, pendingCount: pending, status: 'syncing' as const, error: snap.error || 'جاري استكمال سحب البيانات…' }
  }
  const pauseErr = guardAbortError()
  if (isSyncPaused() && pauseErr) {
    return { ...snap, pendingCount: pending, status: 'syncing' as const, error: pauseErr }
  }
  if (cycle || pending > 0) return { ...snap, pendingCount: pending, status: 'syncing' as const, error: snap.error }
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
  beginAdoptCache()
  const work = (async () => {
    try {
      const guard = await runPrePushGuard()
      if (!guard.proceed) {
        emitSyncStatus('syncing', guard.error || guardAbortError())
        return
      }
      const full = needsFullPull()
      let pushError = ''
      if (full) {
        emitSyncStatus('syncing', 'جاري سحب البيانات…')
        const pulled = await pullChanges()
        startRealtime(getWin)
        if (!pulled.done || hasIncompletePull()) {
          emitSyncStatus('syncing', 'جاري استكمال سحب البيانات…')
          scheduleSyncSoon()
          getWin()?.webContents.send('sync:changed', { table: '*' })
          return
        }
      }
      emitSyncStatus('syncing', 'جاري رفع البيانات…')
      pushError = mapSyncError(await pushQueue())
      if (!full) {
        emitSyncStatus('syncing', 'جاري سحب البيانات…')
        const pulled = await pullChanges()
        startRealtime(getWin)
        const pending = pendingCount()
        if (!pulled.done || pending > 0 || hasIncompletePull()) {
          emitSyncStatus('syncing', pushError || 'جاري استكمال سحب البيانات…')
          scheduleSyncSoon()
        } else emitSyncStatus('synced')
      } else {
        startRealtime(getWin)
        const pending = pendingCount()
        if (pending > 0 || hasIncompletePull()) {
          emitSyncStatus('syncing', pushError || 'جاري استكمال المزامنة…')
          scheduleSyncSoon()
        } else emitSyncStatus('synced')
      }
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
        if (hasIncompletePull() || pendingCount() > 0) {
          emitSyncStatus('syncing', message)
          scheduleSyncSoon()
        } else emitSyncStatus('offline', message)
      } catch {
        emitSyncStatus('offline', message)
      }
    }
  })()
  cycle = withTimeout(work, CYCLE_TIMEOUT_MS, TIMEOUT_MESSAGE)
    .catch((err) => {
      const message = mapSyncError(String((err as Error).message || err))
      try {
        if (hasIncompletePull() || pendingCount() > 0) {
          emitSyncStatus('syncing', message)
          scheduleSyncSoon()
        } else emitSyncStatus('offline', message)
      } catch {
        emitSyncStatus('offline', message)
      }
    })
    .finally(() => {
      cycle = null
      endAdoptCache()
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
