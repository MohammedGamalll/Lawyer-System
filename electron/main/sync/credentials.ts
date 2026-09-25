function envGet(name: string): string {
  try {
    return String(process.env[name] || '').trim()
  } catch {
    return ''
  }
}

function metaGet(name: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return String(env?.[name] || '').trim()
  } catch {
    return ''
  }
}

function usableSecret(value: string): string {
  const v = value.trim().replace(/^\uFEFF/, '').replace(/[\r\n]+/g, '').trim()
  if (!v || v === '********' || /^\*+$/.test(v)) return ''
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return usableSecret(v.slice(1, -1))
  }
  return v
}

export function getSupabaseCredentials(): { url: string; key: string } {
  const url = usableSecret(
    metaGet('SUPABASE_URL') ||
      metaGet('NEXT_PUBLIC_SUPABASE_URL') ||
      envGet('SUPABASE_URL') ||
      envGet('NEXT_PUBLIC_SUPABASE_URL')
  )
  const key = usableSecret(
    metaGet('SUPABASE_ANON_KEY') ||
      metaGet('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
      metaGet('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
      envGet('SUPABASE_ANON_KEY') ||
      envGet('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
      envGet('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  )
  return { url, key }
}
