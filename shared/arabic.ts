export function arabicFold(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
}

export function arabicFoldSql(expr: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${expr}, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ٱ', 'ا'), 'ى', 'ي'), 'ة', 'ه')`
}

export function arabicLike(expr: string): string {
  return `${arabicFoldSql(expr)} LIKE ?`
}

export function foldedLikeTerm(raw: unknown): string {
  return `%${arabicFold(raw)}%`
}
