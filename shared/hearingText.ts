const DATE_CORE = String.raw`(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)`
const DATE_PREFIX = String.raw`(?:بتاريخ|لجلسة|للجلسة|جلسة|في يوم|يوم|في)`
const STEM_DATE_RE = new RegExp(`(?:${DATE_PREFIX}\\s*)?${DATE_CORE}`, 'gu')

export function stemLookupValue(raw: unknown): string {
  let s = String(raw ?? '')
    .replace(STEM_DATE_RE, ' ')
    .replace(/[،,;؛._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^(?:بتاريخ|لجلسة|للجلسة|جلسة)\s+/u, '').replace(/\s+(?:بتاريخ|لجلسة|للجلسة)$/u, '')
  return s.trim()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function refIso(refDate?: string): string {
  if (refDate && /^\d{4}-\d{2}-\d{2}/.test(refDate)) return refDate.slice(0, 10)
  const n = new Date()
  return toIso(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

function upcomingFromParts(day: number, month: number, year: number | undefined, ref: string): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const refYear = Number(ref.slice(0, 4))
  let y = year
  if (y && y < 100) y += 2000
  if (!y || Number.isNaN(y)) y = refYear
  let iso = toIso(y, month, day)
  if (iso === ref) return null
  let guard = 0
  while (iso < ref && guard < 4) {
    y += 1
    iso = toIso(y, month, day)
    guard += 1
  }
  if (iso <= ref) return null
  return iso
}

export function parsePostponedDate(text: string, refDate?: string): string | null {
  const t = String(text || '')
  if (!t.trim()) return null
  const ref = refIso(refDate)
  const found: string[] = []
  const seen = new Set<string>()
  const push = (iso: string | null) => {
    if (!iso || seen.has(iso) || iso === ref) return
    seen.add(iso)
    found.push(iso)
  }

  const isoRe = /(\d{4})-(\d{2})-(\d{2})/g
  let m: RegExpExecArray | null
  while ((m = isoRe.exec(t))) {
    push(upcomingFromParts(Number(m[3]), Number(m[2]), Number(m[1]), ref))
  }

  const rest = t.replace(/\d{4}-\d{2}-\d{2}/g, ' ')
  const slashRe = /(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/g
  while ((m = slashRe.exec(rest))) {
    push(upcomingFromParts(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, ref))
  }

  if (!found.length) return null
  found.sort()
  return found[0]
}
