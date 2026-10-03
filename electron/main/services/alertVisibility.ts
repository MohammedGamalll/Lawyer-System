import { arabicFold } from '@shared/arabic'

const CLOSED_STATUSES = new Set([
  'closed',
  'archived',
  'judged',
  'مغلقة',
  'منتهية',
  'مسددة',
  'محفوظة',
  'تم الحكم'
])

export function isInactiveCaseForAlerts(status?: unknown, archived?: unknown): boolean {
  if (Number(archived) === 1) return true
  const s = String(status || '').trim().toLowerCase()
  if (!s) return false
  return CLOSED_STATUSES.has(s)
}

export function dayOf(value?: unknown): string {
  return String(value || '').slice(0, 10)
}

function hasText(value?: unknown): boolean {
  return Boolean(String(value || '').trim())
}

export function isHearingDoneStatus(status?: unknown): boolean {
  const s = String(status || '').trim()
  return s === 'done' || s === 'تمت'
}

export function shouldShowWorkAlert(input: {
  caseStatus?: unknown
  caseArchived?: unknown
  kind: string
  actionDate?: unknown
  nextDate?: unknown
  result?: unknown
  courtDecision?: unknown
  whatHappened?: unknown
  taskStatus?: unknown
  hearingStatus?: unknown
  latestHearingDate?: unknown
  today: string
}): boolean {
  if (input.kind === 'hearing' && isHearingDoneStatus(input.hearingStatus)) return false
  const next = dayOf(input.nextDate)
  const action = dayOf(input.actionDate)
  const latest = dayOf(input.latestHearingDate)
  if (input.kind === 'hearing' && latest && action && latest > action) {
    const st = String(input.hearingStatus || '').trim()
    if (action < input.today || st === 'postponed' || st === 'cancelled') return false
  }
  const stillOpen = (next && next >= input.today) || (action && action >= input.today)
  if (stillOpen) return true
  if (action && action < input.today && !(next && next >= input.today)) return false
  if (isInactiveCaseForAlerts(input.caseStatus, input.caseArchived)) return false
  if (!action && !next) return true
  if (input.kind === 'task') {
    const st = String(input.taskStatus || '')
    return st !== 'completed' && st !== 'cancelled'
  }
  if (input.kind === 'hearing') {
    return !hasText(input.result) && !hasText(input.courtDecision) && !hasText(input.whatHappened)
  }
  return true
}

export function notificationIsVisible(row: Record<string, unknown>, today: string): boolean {
  const kind = String(row.related_type || row.type || '')
  if (kind === 'hearing') {
    const linked = Boolean(row.hearing_status || row.hearing_date)
    if (!linked && row.related_id) return false
    return shouldShowWorkAlert({
      caseStatus: row.case_status,
      caseArchived: row.case_archived,
      kind: 'hearing',
      actionDate: row.hearing_date,
      nextDate: row.next_hearing_date,
      result: row.hearing_result,
      courtDecision: row.hearing_court_decision,
      whatHappened: row.hearing_what_happened,
      hearingStatus: row.hearing_status,
      latestHearingDate: row.latest_hearing_date,
      today
    })
  }
  if (kind === 'task') {
    return shouldShowWorkAlert({
      caseStatus: row.case_status,
      caseArchived: row.case_archived,
      kind: 'task',
      actionDate: row.task_due_date,
      taskStatus: row.task_status,
      today
    })
  }
  if (kind === 'reminder' || kind === 'case') {
    const date = dayOf(row.reminder_at)
    if (date && date < today) return false
    if (!isInactiveCaseForAlerts(row.case_status, row.case_archived)) return true
    return Boolean(date && date >= today)
  }
  return true
}

export function notificationDedupeKey(row: Record<string, unknown>): string {
  const kind = String(row.related_type || row.type || '')
  const date = dayOf(row.hearing_date || row.task_due_date || row.reminder_at)
  const digits = String(row.case_number || '').replace(/\D/g, '')
  const code = digits ? String(Number(digits)) : ''
  if (kind === 'hearing' && code && date) {
    return `hearing|${code}|${date}|${arabicFold(row.hearing_type)}`
  }
  const rid = String(row.related_id || '')
  if (kind && rid) return `${kind}:${rid}`
  if (kind === 'hearing') return `hearing|${arabicFold(row.title)}|${date}`
  return `id:${row.id}`
}

export function dedupeNotifications(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const row of rows) {
    const key = notificationDedupeKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
