const DATE_KEYS = new Set([
  'date',
  'birth_date',
  'hire_date',
  'filing_date',
  'received_date',
  'hearing_date',
  'next_hearing_date',
  'start_date',
  'due_date',
  'end_date',
  'issue_date',
  'expiry_date',
  'consultation_date',
  'payment_date',
  'expense_date',
  'invoice_date'
])

const DATETIME_KEYS = new Set(['remind_at', 'created_at', 'updated_at', 'last_login_at', 'locked_until'])

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
]

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseDateParts(value?: string | null): { y: number; m: number; d: number } | null {
  if (!value) return null
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

export function parseTimeParts(value?: string | null): { h: number; min: number } | null {
  if (!value) return null
  const s = String(value).trim()
  const iso = s.match(/T(\d{2}):(\d{2})/)
  const plain = s.match(/^(\d{1,2}):(\d{2})/)
  const m = iso || plain
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, min }
}

export function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function toIsoTime(h: number, min: number): string {
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

export function formatDate(value?: string | null, lang: string = 'ar'): string {
  const p = parseDateParts(value)
  if (!p) return value ? String(value) : '—'
  const months = lang === 'en' ? EN_MONTHS : AR_MONTHS
  if (lang === 'en') return `${p.d} ${months[p.m - 1]} ${p.y}`
  return `${p.d} ${months[p.m - 1]} ${p.y}`
}

export function formatTime(value?: string | null, lang: string = 'ar'): string {
  const t = parseTimeParts(value)
  if (!t) {
    if (value && /^\d{2}:\d{2}/.test(String(value))) {
      const [h, min] = String(value).split(':').map(Number)
      return formatHour(h, min, lang)
    }
    return value ? String(value) : '—'
  }
  return formatHour(t.h, t.min, lang)
}

function formatHour(h: number, min: number, lang: string) {
  const period = h >= 12
  const h12 = h % 12 || 12
  const mm = String(min).padStart(2, '0')
  if (lang === 'en') return `${h12}:${mm} ${period ? 'PM' : 'AM'}`
  return `${h12}:${mm} ${period ? 'مساءً' : 'صباحاً'}`
}

export function formatDateTime(value?: string | null, lang: string = 'ar'): string {
  if (!value) return '—'
  const date = formatDate(value, lang)
  const hasTime = /T\d{2}:\d{2}/.test(String(value)) || /\d{2}:\d{2}:\d{2}/.test(String(value))
  if (!hasTime) return date
  return `${date} — ${formatTime(value, lang)}`
}

export function isDateKey(key: string) {
  return DATE_KEYS.has(key) || key.endsWith('_date')
}

export function isDateTimeKey(key: string) {
  return DATETIME_KEYS.has(key) || key.endsWith('_at')
}

export function isTimeKey(key: string) {
  return key.endsWith('_time') || key === 'time' || key === 'check_in' || key === 'check_out'
}

export function formatCell(key: string, value: unknown, lang: string, translate: (k: string) => string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'is_active') return Number(value) === 1 ? translate('status.yes') : translate('status.no')
  if (isDateTimeKey(key)) return formatDateTime(String(value), lang)
  if (isTimeKey(key) && !isDateKey(key)) return formatTime(String(value), lang)
  if (isDateKey(key)) return formatDate(String(value), lang)
  const raw = String(value)
  const statusKey = `status.${raw}`
  const status = translate(statusKey)
  if (status && status !== statusKey) return status
  const typeKey = `types.${raw}`
  const typed = translate(typeKey)
  if (typed && typed !== typeKey) return typed
  return raw
}

export const monthNames = (lang: string) => (lang === 'en' ? EN_MONTHS : AR_MONTHS)
