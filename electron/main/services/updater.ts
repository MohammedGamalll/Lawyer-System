import { autoUpdater } from 'electron-updater'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import log from 'electron-log'
import { BrowserWindow, app } from 'electron'
import { getSetting } from './settings'

autoUpdater.logger = log
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

let inited = false
let target: BrowserWindow | null = null

function send(channel: string, payload?: unknown): void {
  const win = target
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, payload)
}

function isQuietUpdateError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '')
  return /404|401|403|releases\.atom|authentication token|no published versions|cannot find channel|latest\.yml|ENOTFOUND|net::ERR/i.test(
    msg
  )
}

function bindFeed(): void {
  const feed = getSetting('update_feed_url', '').trim()
  if (!feed) return
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    log.info('updater feed override', feed)
  } catch (err) {
    log.warn('updater feed', err)
  }
}

function checkQuietly(): void {
  void autoUpdater.checkForUpdates().catch((err) => {
    if (isQuietUpdateError(err)) log.info('updater: no feed yet', String((err as Error).message || err).slice(0, 180))
    else log.warn('check update', err)
  })
}

export function initUpdater(win: BrowserWindow): void {
  target = win
  if (!app.isPackaged) {
    log.info('updater skipped (unpackaged)')
    return
  }
  if (getSetting('auto_update', 'true') !== 'true') {
    log.info('updater disabled in settings')
    return
  }
  bindFeed()
  if (inited) {
    checkQuietly()
    return
  }
  inited = true

  autoUpdater.on('checking-for-update', () => send('updater:checking'))
  autoUpdater.on('update-available', (info: UpdateInfo) => send('updater:available', info))
  autoUpdater.on('update-not-available', (info: UpdateInfo) => send('updater:not-available', info))
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('updater:progress', {
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => send('updater:downloaded', info))
  autoUpdater.on('error', (err) => {
    if (isQuietUpdateError(err)) {
      log.info('updater skipped', String(err?.message || err).slice(0, 180))
      send('updater:not-available')
      return
    }
    log.warn('updater', err)
    send('updater:error', String(err?.message || err))
  })

  checkQuietly()
}

export async function checkUpdates() {
  try {
    if (!app.isPackaged) {
      return { version: app.getVersion(), skipped: true, none: true }
    }
    bindFeed()
    const result = await autoUpdater.checkForUpdates()
    return { version: app.getVersion(), updateInfo: result?.updateInfo ?? null }
  } catch (err) {
    if (isQuietUpdateError(err)) {
      return { version: app.getVersion(), none: true }
    }
    return { version: app.getVersion(), error: err instanceof Error ? err.message : 'تعذر فحص التحديثات' }
  }
}

export function installUpdate(): { ok: boolean } {
  if (!app.isPackaged) return { ok: false }
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return { ok: true }
}

export function appVersion() {
  return { version: app.getVersion() }
}
