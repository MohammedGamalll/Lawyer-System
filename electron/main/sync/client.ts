import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSettings } from '../services/settings'

let client: SupabaseClient | null = null
let lastKey = ''

export function getSupabase(): SupabaseClient | null {
  const s = getSettings()
  const url = String(s.supabase_url || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = String(
    s.supabase_anon_key ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      ''
  ).trim()
  if (!url || !key) {
    client = null
    lastKey = ''
    return null
  }
  const stamp = `${url}|${key}`
  if (!client || lastKey !== stamp) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    lastKey = stamp
  }
  return client
}

export function isSyncConfigured(): boolean {
  return Boolean(getSupabase())
}
