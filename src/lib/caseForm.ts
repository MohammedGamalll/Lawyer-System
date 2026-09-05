import type { FieldDef } from '../components/CrudPage'
import { CASE_STATUSES } from '@shared/types'

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

export function caseFormFields(t: (k: string) => string): FieldDef[] {
  const f = (name: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    label: t(`fields.${name}`),
    ...extra
  })
  return [
    f('title', { required: true, type: 'combo', comboKind: 'case_title', label: t('fields.case_subject') }),
    f('case_type_id', { lookup: 'caseTypes' }),
    f('category', { type: 'combo', comboKind: 'case_subject' }),
    f('court', { type: 'combo', comboKind: 'court' }),
    f('circuit', { size: 'sm' }),
    f('session_place', { size: 'sm' }),
    f('previous_circuit', { size: 'sm' }),
    f('first_instance_number', { size: 'sm' }),
    f('first_instance_year', { size: 'sm' }),
    f('appeal_number', { size: 'sm' }),
    f('appeal_year', { size: 'sm' }),
    f('cassation_number', { size: 'sm' }),
    f('cassation_year', { size: 'sm' }),
    f('extra_ref_type', { type: 'combo', comboKind: 'extra_ref_type' }),
    f('extra_ref_number', { size: 'sm' }),
    f('extra_ref2_type', { type: 'combo', comboKind: 'extra_ref_type', label: t('fields.extra_ref_type') }),
    f('extra_ref2_number', { size: 'sm', label: t('fields.extra_ref_number') }),
    f('extra_ref3_type', { type: 'combo', comboKind: 'extra_ref_type', label: t('fields.extra_ref_type') }),
    f('extra_ref3_number', { size: 'sm', label: t('fields.extra_ref_number') }),
    f('received_date', { type: 'date' }),
    f('filing_date', { type: 'date' }),
    f('primary_lawyer_id', { lookup: 'lawyers' }),
    f('assistant_lawyer_id', { lookup: 'lawyers' }),
    f('status', { type: 'select', options: st(t, CASE_STATUSES) }),
    f('case_value', { type: 'number' }),
    f('total_fees', { type: 'number' }),
    f('fees_due_date', { type: 'date' }),
    f('payment_method', {
      type: 'select',
      options: ['cash', 'bank', 'card', 'wallet', 'installment', 'other'].map((v) => ({
        value: v,
        label: t(`types.${v}`)
      }))
    }),
    f('installment_count', { type: 'number' }),
    f('related_case_id', { lookup: 'cases' }),
    f('link_type', {
      type: 'select',
      options: ['original', 'appeal', 'cassation', 'execution'].map((v) => ({
        value: v,
        label: t(`status.${v}`)
      }))
    }),
    f('description', { type: 'textarea' }),
    f('summary', { type: 'textarea' }),
    f('notes', { type: 'textarea' })
  ]
}

export function hydrateCaseForm(row: Record<string, unknown>, full: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...row, ...full, password: '' }
  const parties =
    (full.caseClients as {
      client_id: string
      is_primary?: number
      capacity_first?: string
      capacity_appeal?: string
      capacity_cassation?: string
    }[]) || []
  const primary = parties.find((p) => Number(p.is_primary) === 1) || parties[0]
  if (primary) {
    next.capacity_first = primary.capacity_first || ''
    next.capacity_appeal = primary.capacity_appeal || ''
    next.capacity_cassation = primary.capacity_cassation || ''
  }
  next.extra_clients = parties
    .filter((p) => Number(p.is_primary) !== 1)
    .map((p) => ({
      client_id: p.client_id,
      capacity_first: p.capacity_first || '',
      capacity_appeal: p.capacity_appeal || '',
      capacity_cassation: p.capacity_cassation || ''
    }))
  const opps =
    (full.opponents as {
      id: string
      full_name: string
      lawyer_name?: string
      lawyer_phone?: string
      capacity_first?: string
      capacity_appeal?: string
      capacity_cassation?: string
    }[]) || []
  const primaryOpp = opps[0]
  next.opponent_name = String(full.opponent_name || primaryOpp?.full_name || '')
  next.opponent_id = primaryOpp?.id || ''
  next.extra_opponents = opps
    .filter((o) => o.id !== primaryOpp?.id)
    .map((o) => ({
      opponent_id: o.id,
      full_name: o.full_name,
      lawyer_name: o.lawyer_name || '',
      lawyer_phone: o.lawyer_phone || '',
      capacity_first: o.capacity_first || '',
      capacity_appeal: o.capacity_appeal || '',
      capacity_cassation: o.capacity_cassation || ''
    }))
  if (!next.office_case_number && typeof next.case_number === 'string') {
    const m = String(next.case_number).match(/^(.*)\/(\d{2,4})$/)
    if (m && !String(next.case_number).startsWith('CS-')) {
      next.office_case_number = m[1]
      if (!next.case_year) next.case_year = m[2]
    }
  }
  return next
}
