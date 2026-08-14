export type UserSession = {
  id: string
  username: string
  fullName: string
  email?: string | null
  roleCode: string
  roleNameAr: string
  permissions: string[]
  lastLoginAt?: string | null
}

export type PagedResult<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type ListQuery = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filters?: Record<string, string | number | boolean | null | undefined>
}

export const CASE_STATUSES = [
  'new',
  'under_review',
  'filed',
  'in_trial',
  'postponed',
  'for_judgment',
  'judged',
  'appeal',
  'cassation',
  'execution',
  'closed',
  'archived'
] as const

export const HEARING_STATUSES = [
  'upcoming',
  'done',
  'postponed',
  'cancelled',
  'judged',
  'client_absent',
  'lawyer_absent'
] as const

export const TASK_STATUSES = ['new', 'in_progress', 'completed', 'overdue', 'cancelled'] as const

export const CLIENT_TYPES = ['individual', 'company', 'institution', 'government', 'other'] as const

export const REMINDER_TYPES = [
  'hearing',
  'client_appointment',
  'court_date',
  'contract_renewal',
  'poa_expiry',
  'payment_due',
  'legal_action',
  'document_deadline',
  'task',
  'meeting',
  'personal'
] as const
