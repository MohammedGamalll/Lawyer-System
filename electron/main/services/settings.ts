import { getDb } from '../db/database'
import { audit } from './audit'
import { nowIso } from '../utils/time'
import type { AuthedUser } from '../ipc/helpers'
import { recordLocalChange } from '../sync/queue'

const LOCKED_SETTINGS = new Set(['supabase_url', 'supabase_anon_key'])

export function getSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings WHERE deleted_at IS NULL').all() as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  if (!out.supabase_url) out.supabase_url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if (!out.supabase_anon_key) {
    out.supabase_anon_key = String(
      process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        ''
    )
  }
  return out
}

export function getPublicSettings(): Record<string, string> {
  const all = getSettings()
  const out = { ...all }
  const hasKey = Boolean(all.supabase_anon_key)
  out.supabase_anon_key = hasKey ? '********' : ''
  out.supabase_locked = 'true'
  return out
}

export function setSettings(actor: AuthedUser, values: Record<string, string>) {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  const ts = nowIso()
  const saved: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) {
    if (LOCKED_SETTINGS.has(k) || k === 'supabase_locked') continue
    upsert.run(k, v ?? '', ts)
    saved[k] = v ?? ''
    if (!k.startsWith('sync_')) recordLocalChange('settings', k, 'UPDATE')
  }
  audit(actor, 'update', 'settings', null, 'تم تحديث إعدادات النظام', undefined, saved)
  return getPublicSettings()
}

export function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

export function setSettingSilent(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, nowIso())
}

export function persistSyncSettingsFromEnv(): void {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ''
  ).trim()
  if (url && !getSetting('supabase_url')) setSettingSilent('supabase_url', url)
  if (key && !getSetting('supabase_anon_key')) setSettingSilent('supabase_anon_key', key)
}
