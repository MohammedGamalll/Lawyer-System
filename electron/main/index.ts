import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase } from './db/database'
import { registerIpc } from './ipc/register'
import { processDueReminders, generateDailyNotifications } from './services/reminders'
import { garbageCollectOrphans } from './services/documents'
import { maybeAutoBackup } from './services/backup'
import { initUpdater } from './services/updater'
import { seedDemoData } from './services/demo'
import log from 'electron-log'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'Law Office Management System',
    backgroundColor: '#0c1b2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.lawoffice.management')
  initDatabase()
  try {
    seedDemoData()
  } catch (err) {
    log.warn(err)
  }
  registerIpc(ipcMain, () => mainWindow)

  createWindow()
  if (mainWindow) {
    try {
      initUpdater(mainWindow)
    } catch (err) {
      log.warn(err)
    }
  }
  try {
    maybeAutoBackup(null)
    garbageCollectOrphans(null)
    generateDailyNotifications()
  } catch (err) {
    log.warn(err)
  }

  setInterval(() => {
    try {
      processDueReminders()
    } catch (err) {
      log.warn(err)
    }
  }, 60_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
