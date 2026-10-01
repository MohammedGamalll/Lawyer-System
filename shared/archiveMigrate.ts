import { arabicFold } from './arabic'
import { normalizeDigits } from './schemas'

export function programCodeKey(value: string): string {
  let key = String(value || '')
    .trim()
    .replace(/^(CS|CL)-/i, '')
    .toLowerCase()
  if (/^\d+$/.test(key)) key = String(Number(key))
  return key
}

export function formatPrefixedCode(prefix: string, n: number, padding: number): string {
  return `${prefix}${String(n).padStart(Math.max(padding, 1), '0')}`
}

export function nextFreeProgramNumber(
  occupiedKeys: Set<string>,
  startFrom: number,
  prefix: string,
  padding: number
): { n: number; code: string } {
  let n = Math.max(1, Math.floor(startFrom) || 1)
  for (let i = 0; i < 200000; i++) {
    const code = formatPrefixedCode(prefix, n, padding)
    if (!occupiedKeys.has(programCodeKey(code))) return { n, code }
    n += 1
  }
  throw new Error('لا يوجد كود متاح')
}

export function isEgyptianNationalId(raw: unknown): boolean {
  const digits = normalizeDigits(raw).replace(/\D/g, '')
  if (!/^[23]\d{13}$/.test(digits)) return false
  const month = Number(digits.slice(3, 5))
  const day = Number(digits.slice(5, 7))
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

export function extractNationalId(raw: unknown): string {
  const s = normalizeDigits(raw)
  const re = /(?<!\d)([23]\d{13})(?!\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (isEgyptianNationalId(m[1])) return m[1]
  }
  return ''
}

export function isEmptyArchiveCase(row: Record<string, unknown>): boolean {
  const type = String(row['نوع القضية'] ?? '').trim()
  const client = String(row['الجهة_الموكل'] ?? '').trim()
  return !type && !client
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseLegacyDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  let y = Number(m[3])
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null
  if (y < 100) y += y > 30 ? 1900 : 2000
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1800) return null
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

export function yearFromLegacyDate(raw: unknown): string {
  const iso = parseLegacyDate(raw)
  return iso ? iso.slice(0, 4) : ''
}

export function normalizeYearToken(raw: unknown): string {
  const s = normalizeDigits(raw).replace(/\D/g, '')
  if (!s) return ''
  let y = Number(s)
  if (!Number.isFinite(y)) return ''
  if (y < 100) y += y > 30 ? 1900 : 2000
  if (y < 1800 || y > 2100) return ''
  return String(y)
}

export function normalizeCourtNumber(raw: unknown): string {
  const s = normalizeDigits(raw).replace(/[^\d]/g, '')
  if (!s) return ''
  return String(Number(s))
}

export type CourtPair = { number: string; year: string }

export function parseCourtPair(raw: unknown, fallbackYear = ''): CourtPair | null {
  const t = normalizeDigits(raw).replace(/\s+/g, ' ').trim()
  if (!t) return null
  const m = t.match(/^(\d+)\s*[\/]\s*(\d{2,4})$/)
  let number = ''
  let year = ''
  if (m) {
    const left = m[1]
    const right = m[2]
    const leftYear = normalizeYearToken(left)
    const rightYear = normalizeYearToken(right)
    if (leftYear && !rightYear) {
      number = normalizeCourtNumber(right)
      year = leftYear
    } else {
      number = normalizeCourtNumber(left)
      year = rightYear
    }
  } else {
    number = normalizeCourtNumber(t)
    year = normalizeYearToken(fallbackYear)
  }
  if (!number || !year) return null
  return { number, year }
}

export function courtKey(pair: CourtPair): string {
  return `${pair.number}|${pair.year}`
}

export type CourtNumberFields = {
  first_instance_number?: unknown
  first_instance_year?: unknown
  appeal_number?: unknown
  appeal_year?: unknown
  cassation_number?: unknown
  cassation_year?: unknown
  office_case_number?: unknown
  case_year?: unknown
}

function addPair(keys: Set<string>, number: unknown, year: unknown): void {
  const combined = parseCourtPair(number, String(year ?? ''))
  if (combined) keys.add(courtKey(combined))
  const n = normalizeCourtNumber(number)
  const y = normalizeYearToken(year)
  if (n && y) keys.add(`${n}|${y}`)
}

export function liveCourtKeys(row: CourtNumberFields): Set<string> {
  const keys = new Set<string>()
  addPair(keys, row.first_instance_number, row.first_instance_year)
  addPair(keys, row.appeal_number, row.appeal_year)
  addPair(keys, row.cassation_number, row.cassation_year)
  addPair(keys, row.office_case_number, row.case_year || row.first_instance_year)
  return keys
}

export function archiveCourtKeys(row: Record<string, unknown>): Set<string> {
  const fallback =
    yearFromLegacyDate(row['وردت للمكتب']) || yearFromLegacyDate(row['تاريخ الرفع']) || ''
  const keys = new Set<string>()
  for (const field of ['رقم أول درجة', 'رقم الإستئناف', 'رقم النقض', 'ترقيم أول']) {
    const pair = parseCourtPair(row[field], fallback)
    if (pair) keys.add(courtKey(pair))
  }
  return keys
}

export function courtKeysMatch(a: Set<string>, b: Set<string>): boolean {
  for (const k of a) if (b.has(k)) return true
  return false
}

export function partiesMatch(
  archiveClient: unknown,
  archiveOpponent: unknown,
  liveClients: string[],
  liveOpponents: string[]
): boolean {
  const ac = arabicFold(archiveClient)
  const ao = arabicFold(archiveOpponent)
  const clients = liveClients.map((n) => arabicFold(n)).filter(Boolean)
  const opponents = liveOpponents.map((n) => arabicFold(n)).filter(Boolean)
  if (!ac && !ao) return false
  if (!clients.length && !opponents.length) return false
  if (ac && clients.includes(ac)) return true
  if (ao && opponents.includes(ao)) return true
  return false
}

/** VB: CaseID = int(Hex,16) - Fix(1000*Sqr(RecNo)) - 13. RecNo is the Cases2 1-based index. */
export function archiveCaseRecnoFromHex(hex: unknown, hearingRecno: unknown): number | null {
  const parts = String(hex ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return null
  const token = parts[parts.length - 1]
  if (!/^[0-9A-Fa-f]+$/.test(token)) return null
  const hv = parseInt(token, 16)
  const recno = Number(hearingRecno)
  if (!Number.isFinite(hv) || !Number.isFinite(recno) || recno < 1) return null
  const cid = hv - (Math.trunc(1000 * Math.sqrt(recno)) + 13)
  if (!Number.isFinite(cid) || cid < 1) return null
  return Math.trunc(cid)
}

export function hearingStatusForDate(isoDate: string, todayIso: string): 'done' | 'upcoming' {
  return isoDate < todayIso.slice(0, 10) ? 'done' : 'upcoming'
}

export function hearingDedupeKey(dateIso: string, text: unknown): string {
  return `${dateIso}|${arabicFold(text)}`
}
