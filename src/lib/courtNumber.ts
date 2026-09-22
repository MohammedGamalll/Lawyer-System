import { rtlIsolatedPair, stripBidiMarks } from '@shared/rtlBidi'

export function stripInternalPrefix(code: unknown) {
  return String(code ?? '').replace(/^(CS|CL)-/i, '')
}

export function displayCaseCode(row: Record<string, unknown> | unknown) {
  if (row && typeof row === 'object') return formatProgramCode(row as Record<string, unknown>)
  return stripInternalPrefix(row) || '—'
}

export function displayClientCode(code: unknown) {
  return stripInternalPrefix(code)
}

function isYearToken(v: string) {
  return /^(19|20)\d{2}$/.test(v)
}

function stageCourt(row: Record<string, unknown>) {
  const year = stripBidiMarks(row.case_year)
  const stages: [unknown, unknown][] = [
    [row.first_instance_number ?? row.first_degree_number, row.first_instance_year],
    [row.appeal_number, row.appeal_year],
    [row.cassation_number, row.cassation_year]
  ]
  for (const [num, stageYear] of stages) {
    const office = stripBidiMarks(num)
    if (office) return { office, year: year || stripBidiMarks(stageYear) }
  }
  return { office: '', year }
}

export function courtParts(row: Record<string, unknown>) {
  let office = stripBidiMarks(row.office_case_number)
  let year = stripBidiMarks(row.case_year)
  if (!office) {
    const stage = stageCourt(row)
    office = stage.office
    year = year || stage.year
  }
  const combined = office.match(/^(\d+)\s*\/\s*(\d{2,4})$/)
  if (combined) {
    const left = combined[1]
    const right = combined[2]
    if (isYearToken(left) && !isYearToken(right)) {
      office = right
      year = year || left
    } else {
      office = left
      year = year || right
    }
  }
  if (isYearToken(office) && year && !isYearToken(year)) {
    const swapped = office
    office = year
    year = swapped
  }
  return { office, year }
}

export function formatCourtNumber(row: Record<string, unknown>) {
  const { office, year } = courtParts(row)
  const pair = rtlIsolatedPair(office, year)
  if (pair) return pair
  const cn = stripBidiMarks(row.case_number)
  if (/^CS-/i.test(cn)) return '—'
  const m = cn.match(/^(.+)\/(\d{2,4})$/)
  if (m) {
    const left = m[1].trim()
    const right = m[2]
    if (isYearToken(left) && !isYearToken(right)) return rtlIsolatedPair(right, left)
    return rtlIsolatedPair(left, right)
  }
  return '—'
}

export function parseCourtQuery(raw: string): { number: string; year: string } {
  const t = stripBidiMarks(raw)
  const m =
    t.match(/^(\d+)\s*(?:\/|لسنة)\s*(\d{2,4})\s*ق?\.?$/i) ||
    t.match(/^(\d+)\s+\/\s+(\d{2,4})$/)
  if (m) return { number: m[1], year: m[2] }
  return { number: t, year: '' }
}

export function isManualProgramCode(row: Record<string, unknown> | string | unknown) {
  const cn = typeof row === 'object' && row ? String((row as Record<string, unknown>).case_number ?? '') : String(row ?? '')
  return Boolean(cn.trim()) && !/^CS-/i.test(cn)
}

export function formatPoliceStation(s: unknown): string {
  let t = String(s ?? '').trim()
  if (!t) return ''
  t = t.replace(/\s*شرطة\s+/gu, ' ').replace(/^شرطة\s+/u, '').replace(/\s+شرطة$/u, '').replace(/\s+/g, ' ').trim()
  if (/^قسم\s/u.test(t)) return t
  return `قسم ${t}`
}

export function formatProgramCode(row: Record<string, unknown>) {
  const cn = String(row.case_number ?? '')
  if (/^CS-/i.test(cn)) return stripInternalPrefix(cn)
  const internal = String(row.internal_file_number ?? '').trim()
  return stripInternalPrefix(internal || cn)
}
