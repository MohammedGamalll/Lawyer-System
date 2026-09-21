import type { FieldDef } from '../components/CrudPage'

export function caseFormFields(t: (k: string) => string): FieldDef[] {
  const f = (name: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    label: t(`fields.${name}`),
    ...extra
  })
  return [
    f('case_type_id', { lookup: 'caseTypes', label: t('settings.caseTypes') }),
    f('title', { required: true, type: 'combo', comboKind: 'case_subject', label: t('settings.caseSubjects') }),
    f('court', { type: 'combo', comboKind: 'court' }),
    f('circuit', { size: 'sm' }),
    f('police_station', { type: 'combo', comboKind: 'police_station' }),
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
    f('judgment_date', { type: 'date' }),
    f('judgment_text', { type: 'textarea' }),
    f('primary_lawyer_id', { lookup: 'lawyers' }),
    f('assistant_lawyer_id', { lookup: 'lawyers' }),
    f('status', { type: 'combo', comboKind: 'case_status' }),
    f('related_case_id', { lookup: 'cases' }),
    f('link_type', { type: 'combo', comboKind: 'link_type' }),
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
  const code = String(next.case_number || '').trim()
  next.__numbering_mode = code && !/^CS-/i.test(code) ? 'manual' : 'auto'
  next.numbering_mode = next.__numbering_mode
  return next
}
