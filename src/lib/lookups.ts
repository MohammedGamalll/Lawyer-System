import { invoke } from './api'

export type LookupKind =
  | 'clients'
  | 'cases'
  | 'lawyers'
  | 'users'
  | 'cashboxes'
  | 'caseTypes'
  | 'expenseCategories'
  | 'roles'
  | 'opponents'
  | 'employees'
  | 'hearings'
  | 'contracts'

export type LookupOption = { value: string | number; label: string; extra?: Record<string, unknown> }

export async function fetchLookup(kind: LookupKind, filters?: Record<string, unknown>): Promise<LookupOption[]> {
  if (kind === 'clients') {
    const r = await invoke<{ rows: { id: number; full_name: string; client_number: string }[] }>('clients:list', {
      pageSize: 1000,
      search: filters?.search
    })
    return r.rows.map((x) => ({ value: x.id, label: `${x.client_number} — ${x.full_name}` }))
  }
  if (kind === 'cases') {
    const r = await invoke<{ rows: { id: number; title: string; case_number: string; client_id?: number }[] }>('cases:list', {
      pageSize: 1000,
      filters: filters?.client_id ? { client_id: Number(filters.client_id) } : {}
    })
    return r.rows.map((x) => ({
      value: x.id,
      label: `${x.case_number} — ${x.title}`,
      extra: { client_id: x.client_id }
    }))
  }
  if (kind === 'lawyers') {
    const r = await invoke<{ rows: { id: number; full_name: string }[] }>('lawyers:list', { pageSize: 500 })
    return r.rows.map((x) => ({ value: x.id, label: x.full_name }))
  }
  if (kind === 'users') {
    const r = await invoke<{ rows: { id: number; full_name: string; username: string }[] }>('users:list', { pageSize: 500 }).catch(
      () => ({ rows: [] })
    )
    return r.rows.map((x) => ({ value: x.id, label: `${x.full_name} (${x.username})` }))
  }
  if (kind === 'cashboxes') {
    const r = await invoke<{ id: number; name: string }[]>('cashbox:list')
    return r.map((x) => ({ value: x.id, label: x.name }))
  }
  if (kind === 'caseTypes') {
    const r = await invoke<{ id: number; name_ar: string }[]>('caseTypes:list')
    return r.map((x) => ({ value: x.id, label: x.name_ar }))
  }
  if (kind === 'expenseCategories') {
    const r = await invoke<{ id: number; name_ar: string }[]>('expenses:categories')
    return r.map((x) => ({ value: x.id, label: x.name_ar }))
  }
  if (kind === 'roles') {
    const r = await invoke<{ roles: { id: number; name_ar: string }[] }>('users:permissions')
    return r.roles.map((x) => ({ value: x.id, label: x.name_ar }))
  }
  if (kind === 'opponents') {
    const r = await invoke<{ rows: { id: number; full_name: string }[] }>('opponents:list', { pageSize: 500 }).catch(() => ({
      rows: []
    }))
    return r.rows.map((x) => ({ value: x.id, label: x.full_name }))
  }
  if (kind === 'employees') {
    const r = await invoke<{ rows: { id: number; full_name: string }[] }>('employees:list', { pageSize: 500 }).catch(() => ({
      rows: []
    }))
    return r.rows.map((x) => ({ value: x.id, label: x.full_name }))
  }
  if (kind === 'hearings') {
    const r = await invoke<{ rows: { id: number; hearing_date: string; case_number?: string }[] }>('hearings:list', {
      pageSize: 500
    }).catch(() => ({ rows: [] }))
    return r.rows.map((x) => ({
      value: x.id,
      label: `${x.case_number || ''} — ${x.hearing_date}`
    }))
  }
  if (kind === 'contracts') {
    const r = await invoke<{ rows: { id: number; contract_number: string; title: string }[] }>('contracts:list', {
      pageSize: 500
    }).catch(() => ({ rows: [] }))
    return r.rows.map((x) => ({ value: x.id, label: `${x.contract_number} — ${x.title}` }))
  }
  return []
}
