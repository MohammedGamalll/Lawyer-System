/**
 * Verify remote Supabase PostgREST exposes the columns the desktop sync expects.
 *
 *   npx tsx scripts/verify-supabase-schema.ts
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { EXPECTED_SYNC_COLUMNS } from '../electron/main/db/syncColumns'

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = join(process.cwd(), name)
    if (!existsSync(file)) continue
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 1) continue
      const key = line.slice(0, i).trim()
      let value = line.slice(i + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
}

loadEnv()

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const key = String(
  process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
).trim()

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  const missing: string[] = []
  for (const [table, columns] of Object.entries(EXPECTED_SYNC_COLUMNS)) {
    const { error } = await supabase.from(table).select(columns.join(',')).limit(0)
    if (!error) continue
    missing.push(`${table}: ${error.message}`)
  }
  if (missing.length) {
    console.error('Remote schema does not match local sync columns:')
    for (const line of missing) console.error(' -', line)
    process.exit(1)
  }
  console.log(`OK ${Object.keys(EXPECTED_SYNC_COLUMNS).length} synced tables`)
}

void main()
