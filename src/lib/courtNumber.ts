export function formatCourtNumber(row: Record<string, unknown>) {
  const office = String(row.office_case_number ?? '').trim()
  const year = String(row.case_year ?? '').trim()
  if (office && year) return `${office} لسنة ${year} ق`
  if (office) return office
  const cn = String(row.case_number ?? '')
  if (cn.startsWith('CS-')) return '—'
  const m = cn.match(/^(.+)\/(\d{2,4})$/)
  if (m) return `${m[1].trim()} لسنة ${m[2]} ق`
  return '—'
}

export function parseCourtQuery(raw: string): { number: string; year: string } {
  const t = String(raw ?? '').trim()
  const m =
    t.match(/^(\d+)\s*(?:\/|لسنة)\s*(\d{2,4})\s*ق?\.?$/i) ||
    t.match(/^(\d+)\s+\/\s+(\d{2,4})$/)
  if (m) return { number: m[1], year: m[2] }
  return { number: t, year: '' }
}

export function formatProgramCode(row: Record<string, unknown>) {
  const cn = String(row.case_number ?? '')
  if (cn.startsWith('CS-')) return cn
  const internal = String(row.internal_file_number ?? '').trim()
  return internal || cn
}
