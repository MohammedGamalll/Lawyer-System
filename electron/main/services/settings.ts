import { getDb } from '../db/database'
import { audit } from './audit'
import { nowIso } from '../utils/time'
import type { AuthedUser } from '../ipc/helpers'
import { recordLocalChange } from '../sync/queue'

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
  const syncOff = out.sync_disabled === '1' || out.sync_disabled === 'true'
  if (!syncOff) {
    if (!out.supabase_url) out.supabase_url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (!out.supabase_anon_key) {
      out.supabase_anon_key = String(
        process.env.SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          ''
      )
    }
  }
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
  const off = getSetting('sync_disabled')
  if (off === '1' || off === 'true') return
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
