import { getDb } from '../db/database'
import { audit } from './audit'
import type { AuthedUser } from '../ipc/helpers'

export function getSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

export function setSettings(actor: AuthedUser, values: Record<string, string>) {
  const db = getDb()
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  for (const [k, v] of Object.entries(values)) upsert.run(k, v ?? '')
  audit(actor, 'update', 'settings', null, 'تم تحديث إعدادات النظام', undefined, values)
  return getSettings()
}

export function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}
