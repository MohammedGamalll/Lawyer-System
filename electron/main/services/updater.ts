import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { BrowserWindow } from 'electron'
import { getSetting } from './settings'
import { app } from 'electron'

autoUpdater.logger = log
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

export function initUpdater(win: BrowserWindow): void {
  if (getSetting('auto_update', 'true') !== 'true') return
  const feed = getSetting('update_feed_url', '')
  if (feed) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    } catch (err) {
      log.warn('updater feed', err)
    }
  }
  autoUpdater.on('update-available', (info) => win.webContents.send('updater:available', info))
  autoUpdater.on('update-downloaded', (info) => win.webContents.send('updater:downloaded', info))
  autoUpdater.on('error', (err) => log.warn('updater', err))
  autoUpdater.checkForUpdates().catch((err) => log.warn('check update', err))
}

export async function checkUpdates() {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { version: app.getVersion(), updateInfo: result?.updateInfo ?? null }
  } catch (err) {
    return { version: app.getVersion(), error: err instanceof Error ? err.message : 'تعذر فحص التحديثات' }
  }
}

export function appVersion() {
  return { version: app.getVersion() }
}
