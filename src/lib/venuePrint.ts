export function uniqueVenues(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const v = String(raw || '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= 3) break
  }
  return out
}

export function mergePrintRows(groups: Record<string, unknown>[][]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const rows of groups) {
    for (const row of rows) {
      const id = String(row.id || '')
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      out.push(row)
    }
  }
  return out
}

export function venueSheetLabel(venues: string[], range = '') {
  const names = uniqueVenues(venues)
  const head = names.join(' — ')
  return range ? `${head} (${range})` : head
}
