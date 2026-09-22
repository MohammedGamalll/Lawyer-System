import { getDb } from '../db/database'
import { audit } from './audit'
import { nowIso } from '../utils/time'
import type { AuthedUser } from '../ipc/helpers'
import { recordLocalChange } from '../sync/queue'
import { getSupabaseCredentials } from '../sync/credentials'

const SKIP_SETTINGS = new Set([
  'supabase_url',
  'supabase_anon_key',
  'supabase_locked',
  'case_sequence_current',
  'case_sequence_prefix',
  'case_sequence_next'
])

export function getSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings WHERE deleted_at IS NULL').all() as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  const creds = getSupabaseCredentials()
  if (!out.supabase_url) out.supabase_url = creds.url
  if (!out.supabase_anon_key || out.supabase_anon_key === '********') out.supabase_anon_key = creds.key
  return out
}

export function getPublicSettings(): Record<string, string> {
  const all = getSettings()
  const out = { ...all }
  const hasKey = Boolean(all.supabase_anon_key)
  out.supabase_anon_key = hasKey ? '********' : ''
  out.supabase_locked = 'true'
  const seq = getDb().prepare(`SELECT prefix, current_value, padding FROM number_sequences WHERE name = 'case'`).get() as
    | { prefix: string; current_value: number; padding: number }
    | undefined
  if (seq) {
    out.case_sequence_prefix = seq.prefix
    out.case_sequence_current = String(seq.current_value)
    out.case_sequence_next = `${seq.prefix}${String(seq.current_value + 1).padStart(seq.padding, '0')}`
  }
  if (!out.print_orientation) {
    out.print_orientation = out.print_landscape === 'true' ? 'landscape' : 'portrait'
  }
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
    if (SKIP_SETTINGS.has(k)) continue
    upsert.run(k, v ?? '', ts)
    saved[k] = v ?? ''
    if (!k.startsWith('sync_')) recordLocalChange('settings', k, 'UPDATE')
  }
  if (saved.print_orientation) {
    const landscape = saved.print_orientation === 'landscape' ? 'true' : 'false'
    upsert.run('print_landscape', landscape, ts)
    saved.print_landscape = landscape
    recordLocalChange('settings', 'print_landscape', 'UPDATE')
  }
  if (values.case_sequence_current != null && values.case_sequence_current !== '') {
    const nextVal = Number(values.case_sequence_current)
    if (!Number.isFinite(nextVal) || nextVal < 0) throw new Error('بداية الترقيم غير صالحة')
    const row = db.prepare(`SELECT current_value FROM number_sequences WHERE name = 'case'`).get() as
      | { current_value: number }
      | undefined
    if (row && nextVal < row.current_value) {
      throw new Error('لا يمكن تخفيض تسلسل القضايا تحت آخر رقم مستخدم')
    }
    db.prepare('UPDATE number_sequences SET current_value = ?, updated_at = ? WHERE name = ?').run(nextVal, ts, 'case')
    recordLocalChange('number_sequences', 'case', 'UPDATE')
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
  const creds = getSupabaseCredentials()
  const url = creds.url || getSetting('supabase_url').trim()
  const key = (() => {
    const existing = getSetting('supabase_anon_key').trim()
    if (existing && existing !== '********') return creds.key || existing
    return creds.key
  })()
  if (url) setSettingSilent('supabase_url', url)
  if (key) setSettingSilent('supabase_anon_key', key)
  if (url && key) {
    getDb().prepare(`DELETE FROM settings WHERE key = 'sync_disabled'`).run()
  }
}
