import { rtlIsolatedPair, stripBidiMarks } from '@shared/rtlBidi'

export const PROGRAM_CODE_PAD = 5

export function stripInternalPrefix(code: unknown) {
  return String(code ?? '').replace(/^(CS|CL)-/i, '')
}

export function padProgramDigits(raw: unknown): string {
  const t = stripInternalPrefix(raw).trim()
  if (!t) return ''
  if (/^\d+$/.test(t)) return t.padStart(PROGRAM_CODE_PAD, '0')
  return t
}

export function displayCaseCode(row: Record<string, unknown> | unknown) {
  if (row && typeof row === 'object') return formatProgramCode(row as Record<string, unknown>)
  return padProgramDigits(row) || '—'
}

export function displayClientCode(code: unknown) {
  return stripInternalPrefix(code)
}

function isYearToken(v: string) {
  return /^(19|20)\d{2}$/.test(v)
}

function stageCourt(row: Record<string, unknown>) {
  const stages: [unknown, unknown][] = [
    [row.first_instance_number ?? row.first_degree_number, row.first_instance_year],
    [row.appeal_number, row.appeal_year],
    [row.cassation_number, row.cassation_year]
  ]
  for (const [num, stageYear] of stages) {
    const office = stripBidiMarks(num)
    if (office) return { office, year: stripBidiMarks(stageYear) || stripBidiMarks(row.case_year) }
  }
  return { office: '', year: stripBidiMarks(row.case_year) }
}

export function courtParts(row: Record<string, unknown>) {
  let office = stripBidiMarks(row.office_case_number)
  let year = stripBidiMarks(row.case_year)
  if (!office) {
    const stage = stageCourt(row)
    office = stage.office
    year = stage.year
  } else if (!year) {
    year = stripBidiMarks(row.first_instance_year)
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

function pairFromNumberYear(number: string, year: string) {
  let office = number
  let y = year
  const combined = office.match(/^(\d+)\s*\/\s*(\d{2,4})$/)
  if (combined) {
    const left = combined[1]
    const right = combined[2]
    if (isYearToken(left) && !isYearToken(right)) {
      office = right
      y = y || left
    } else {
      office = left
      y = y || right
    }
  }
  if (isYearToken(office) && y && !isYearToken(y)) {
    const swapped = office
    office = y
    y = swapped
  }
  return rtlIsolatedPair(office, y)
}

export function formatCourtNumber(row: Record<string, unknown>) {
  const firstNum = stripBidiMarks(row.first_instance_number ?? row.first_degree_number)
  const firstYear = stripBidiMarks(row.first_instance_year)
  if (firstNum) return pairFromNumberYear(firstNum, firstYear) || '—'
  const office = stripBidiMarks(row.office_case_number)
  const year = stripBidiMarks(row.case_year) || firstYear
  if (office) return pairFromNumberYear(office, year) || '—'
  const appeal = pairFromNumberYear(stripBidiMarks(row.appeal_number), stripBidiMarks(row.appeal_year))
  if (appeal) return appeal
  const cass = pairFromNumberYear(stripBidiMarks(row.cassation_number), stripBidiMarks(row.cassation_year))
  if (cass) return cass
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
  if (/^CS-/i.test(cn)) return padProgramDigits(cn)
  const internal = String(row.internal_file_number ?? '').trim()
  return padProgramDigits(internal || cn)
}

export function degreeNumberLines(
  row: Record<string, unknown>
): { key: 'degree_first' | 'degree_appeal' | 'degree_cassation'; value: string }[] {
  const items: { key: 'degree_first' | 'degree_appeal' | 'degree_cassation'; value: string }[] = []
  const first = pairFromNumberYear(
    stripBidiMarks(row.first_instance_number ?? row.first_degree_number),
    stripBidiMarks(row.first_instance_year)
  )
  if (first) items.push({ key: 'degree_first', value: first })
  const appeal = pairFromNumberYear(stripBidiMarks(row.appeal_number), stripBidiMarks(row.appeal_year))
  if (appeal) items.push({ key: 'degree_appeal', value: appeal })
  const cass = pairFromNumberYear(stripBidiMarks(row.cassation_number), stripBidiMarks(row.cassation_year))
  if (cass) items.push({ key: 'degree_cassation', value: cass })
  if (!items.length) {
    const fallback = formatCourtNumber(row)
    if (fallback && fallback !== '—') items.push({ key: 'degree_first', value: fallback })
  }
  return items
}
