export function nowIso(): string {
  return new Date().toISOString()
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
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
