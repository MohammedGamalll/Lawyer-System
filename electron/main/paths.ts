import fs from 'fs'
import path from 'path'

export function getDataRoot(): string {
  if (process.env.LAW_DATA_ROOT) {
    ensureDir(process.env.LAW_DATA_ROOT)
    return process.env.LAW_DATA_ROOT
  }
  // Lazy-load so unit tests can run without Electron.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as { app: { getPath: (k: string) => string } }
  const root = path.join(app.getPath('userData'), 'LawOfficeManagement')
  ensureDir(root)
  return root
}

export function getDbPath(): string {
  return path.join(getDataRoot(), 'lawoffice.db')
}

export function getDocumentsDir(): string {
  const dir = path.join(getDataRoot(), 'documents')
  ensureDir(dir)
  return dir
}

export function getBackupDir(): string {
  const dir = path.join(getDataRoot(), 'backups')
  ensureDir(dir)
  return dir
}

export function getTempDir(): string {
  const dir = path.join(getDataRoot(), 'temp')
  ensureDir(dir)
  return dir
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
