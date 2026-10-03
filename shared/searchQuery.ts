export function isProgramCodeQuery(raw: unknown): boolean {
  const t = String(raw ?? '').trim()
  if (!t) return false
  if (/^(CS|CL)-?\d+$/i.test(t)) return true
  return /^\d{1,8}$/.test(t)
}

export function shouldSkipFts(raw: unknown): boolean {
  const t = String(raw ?? '').trim()
  if (!t) return true
  if (isProgramCodeQuery(t)) return true
  return /[\u0600-\u06FF]/.test(t)
}
