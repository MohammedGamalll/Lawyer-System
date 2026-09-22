import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSettings } from '../services/settings'
import { getSupabaseCredentials } from './credentials'

let client: SupabaseClient | null = null
let lastKey = ''

export function resetSupabaseClient(): void {
  client = null
  lastKey = ''
}

export function getSupabase(): SupabaseClient | null {
  const s = getSettings()
  const creds = getSupabaseCredentials()
  const url = String(s.supabase_url || creds.url || '').trim()
  const key = String(s.supabase_anon_key || creds.key || '').trim()
  if (!url || !key || key === '********') {
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
