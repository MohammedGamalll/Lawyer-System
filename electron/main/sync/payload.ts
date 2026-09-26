const LOCAL_ONLY = new Set([
  'failed_login_attempts',
  'locked_until',
  'last_login_at',
  'last_login_device',
  'avatar_path'
])

export function omitLocalOnly(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (LOCAL_ONLY.has(key)) continue
    out[key] = value
  }
  return out
}

/** PostgREST / Postgres unknown-column messages. */
export function unknownColumnFromError(message: string): string | null {
  const raw = String(message || '')
  const match =
    raw.match(/Could not find the '([^']+)' column/i) ||
    raw.match(/column "([^"]+)" (?:of relation|does not exist)/i) ||
    raw.match(/PGRST204/)
  if (!match) return null
  if (match[1]) return match[1]
  return null
}

export function stripColumn(row: Record<string, unknown>, column: string): Record<string, unknown> {
  const out = { ...row }
  delete out[column]
  return out
}
