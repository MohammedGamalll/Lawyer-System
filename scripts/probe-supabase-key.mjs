/**
 * Fail the Windows publish if the baked Supabase anon key is missing or rejected.
 * Prints only HTTP status — never the key.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const file = resolve(process.cwd(), name)
    if (!existsSync(file)) continue
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
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

loadDotEnv()

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
const key = String(
  process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
).trim()

if (!url || !key) {
  console.error('sync probe: SUPABASE_URL or SUPABASE_ANON_KEY is empty')
  process.exit(1)
}

const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json'
  }
})

const body = await res.text()
if (!res.ok) {
  const snippet = body.replace(/\s+/g, ' ').slice(0, 180)
  console.error(`sync probe: HTTP ${res.status} ${snippet}`)
  if (/invalid api key/i.test(body)) {
    console.error('sync probe: Invalid API key — update GitHub secret SUPABASE_ANON_KEY')
  }
  process.exit(1)
}

console.log(`sync probe: ok HTTP ${res.status}`)
