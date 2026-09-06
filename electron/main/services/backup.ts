import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDb, closeDatabase, initDatabase } from '../db/database'
import { getBackupDir, getDbPath, getDataRoot } from '../paths'
import { checkpointWal, stripSqliteSidecars } from '../db/repair'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { getSetting, setSettings } from './settings'
import type { AuthedUser } from '../ipc/helpers'

const KEY = crypto.createHash('sha256').update('law-office-backup-key-v1').digest()

function encrypt(buf: Buffer): Buffer {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv)
  return Buffer.concat([iv, cipher.update(buf), cipher.final()])
}

function decrypt(buf: Buffer): Buffer {
  const iv = buf.subarray(0, 16)
  const data = buf.subarray(16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export function createBackup(actor: AuthedUser, customDir?: string) {
  const db = getDb()
  checkpointWal(db)
  const src = getDbPath()
  const dir = customDir || getSetting('backup_path') || getBackupDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const name = `backup-${nowIso().replace(/[:.]/g, '-')}.lobak`
  const dest = path.join(dir, name)
  const raw = fs.readFileSync(src)
  fs.writeFileSync(dest, encrypt(raw))
  audit(actor, 'backup', 'backup', null, `تم إنشاء نسخة احتياطية: ${name}`)
  return { file: dest, name }
}

export function listBackups(dir?: string) {
  const folder = dir || getSetting('backup_path') || getBackupDir()
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.lobak') || f.endsWith('.db'))
    .map((f) => {
      const full = path.join(folder, f)
      const st = fs.statSync(full)
      return { name: f, path: full, size: st.size, mtime: st.mtime.toISOString() }
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
}

export function restoreBackup(actor: AuthedUser, filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('ملف النسخة غير موجود')
  const encrypted = fs.readFileSync(filePath)
  let raw: Buffer
  try {
    raw = filePath.endsWith('.lobak') ? decrypt(encrypted) : encrypted
  } catch {
    throw new Error('تعذر قراءة النسخة الاحتياطية. الملف تالف أو محمي بمفتاح مختلف')
  }
  closeDatabase()
  const dest = getDbPath()
  if (fs.existsSync(dest)) fs.copyFileSync(dest, dest + '.before-restore')
  stripSqliteSidecars(dest)
  fs.writeFileSync(dest, raw)
  stripSqliteSidecars(dest)
  initDatabase(dest)
  audit(actor, 'restore', 'backup', null, `تم استعادة النسخة من ${path.basename(filePath)}`)
  return { ok: true }
}

export function setBackupSchedule(actor: AuthedUser, schedule: string, backupPath: string) {
  return setSettings(actor, { backup_schedule: schedule, backup_path: backupPath })
}

export function maybeAutoBackup(actor: AuthedUser | null) {
  const schedule = getSetting('backup_schedule', 'daily')
  if (schedule === 'off') return
  const last = getSetting('last_auto_backup', '')
  const today = nowIso().slice(0, 10)
  if (schedule === 'daily' && last === today) return
  if (schedule === 'weekly' && last && Date.now() - new Date(last).getTime() < 6 * 24 * 3600 * 1000) return
  try {
    createBackup(actor ?? { id: 'system', username: 'system', fullName: 'system', roleCode: 'admin', permissions: [] })
    const db = getDb()
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('last_auto_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(today)
  } catch {
    /* ignore auto backup errors */
  }
}

void getDataRoot
