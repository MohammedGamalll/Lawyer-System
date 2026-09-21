import { rtlIsolatedPair, stripBidiMarks } from './rtlBidi'

const STATUS_AR: Record<string, string> = {
  new: 'جديدة',
  under_review: 'قيد الدراسة',
  filed: 'مرفوعة',
  in_trial: 'قيد المحاكمة',
  postponed: 'مؤجلة',
  for_judgment: 'للحكم',
  judged: 'تم الحكم',
  appeal: 'استئناف',
  cassation: 'نقض',
  execution: 'تنفيذ',
  closed: 'مغلقة',
  archived: 'محفوظة',
  upcoming: 'قادمة',
  done: 'تمت',
  cancelled: 'ألغيت',
  client_absent: 'لم يحضر العميل',
  lawyer_absent: 'لم يحضر المحامي',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  overdue: 'متأخرة',
  not_done: 'لم ينجز',
  active: 'نشط',
  inactive: 'معطّل',
  unpaid: 'غير مدفوعة',
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئيًا',
  scheduled: 'مجدول',
  high: 'عاجلة',
  medium: 'متوسطة',
  low: 'منخفضة',
  expired: 'منتهٍ',
  revoked: 'ملغى'
}

export function printLookupLabel(value: unknown): string {
  const v = String(value ?? '').trim()
  if (!v) return ''
  return STATUS_AR[v] || v
}

export function stripProgramPrefix(code: unknown): string {
  return String(code ?? '').replace(/^(CS|CL)-/i, '')
}

function isYearToken(v: string) {
  return /^(19|20)\d{2}$/.test(v)
}

export function formattedCourtNumber(row: Record<string, unknown>): string {
  let office = stripBidiMarks(row.office_case_number)
  let year = stripBidiMarks(row.case_year)
  if (isYearToken(office) && year && !isYearToken(year)) {
    const swapped = office
    office = year
    year = swapped
  }
  return rtlIsolatedPair(office, year)
}
