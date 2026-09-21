import { cairoAddDays, cairoDateTimeStamp, cairoTodayIso } from '@shared/cairoDate'

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayIso(): string {
  return cairoTodayIso()
}

export function printedAtStamp(): string {
  return cairoDateTimeStamp()
}

export function addDays(dateIso: string, days: number): string {
  return cairoAddDays(String(dateIso).slice(0, 10), days)
}

export function startOfDay(d = new Date()): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

export function endOfDay(d = new Date()): string {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}
