export const RLM = '\u200F'

export function stripBidiMarks(s: unknown): string {
  return String(s ?? '').replace(/[\u200E\u200F\u061C\u2066-\u2069]/g, '').trim()
}

export function rtlIsolatedPair(number: unknown, year: unknown): string {
  const n = stripBidiMarks(number)
  const y = stripBidiMarks(year)
  if (n && y) return `\u200F${n} / ${y}\u200F`
  if (n) return `\u200F${n}\u200F`
  if (y) return `\u200F${y}\u200F`
  return ''
}
