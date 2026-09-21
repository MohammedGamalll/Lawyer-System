const CAIRO_TZ = 'Africa/Cairo'

export function cairoTodayIso(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export function cairoAddDays(dateIso: string, days: number): string {
  const raw = String(dateIso || '').slice(0, 10)
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return cairoTodayIso()
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0)
  return cairoTodayIso(new Date(utc + days * 86400000))
}

export function cairoDateTimeStamp(d = new Date()): string {
  const date = cairoTodayIso(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
  return `${date} ${time}`
}
