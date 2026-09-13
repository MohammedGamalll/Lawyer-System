import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'
import { ValidationError, normalizeDigits } from '@shared/schemas'

export function normalizePersonName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
}

export function identityKey(data: Record<string, unknown>) {
  const kind = String(data.id_kind || 'national_id')
  const raw = String(data.national_id ?? '').trim()
  if (!raw || raw === '***') return { kind, nid: '' }
  if (kind === 'passport') return { kind, nid: raw.toUpperCase() }
  const digits = normalizeDigits(raw).replace(/\D/g, '')
  return { kind, nid: digits.length === 14 ? digits : digits || raw }
}

function nameUnchanged(old: Record<string, unknown>, data: Record<string, unknown>) {
  return normalizePersonName(old.full_name) === normalizePersonName(data.full_name)
}

export type SimilarPerson = {
  id: string
  client_number: string
  full_name: string
  national_id: string | null
}

function loadPeople(table: 'clients' | 'opponents') {
  const numberExpr = table === 'clients' ? 'client_number' : `'' as client_number`
  return getDb()
    .prepare(`SELECT id, full_name, national_id, id_kind, ${numberExpr} FROM ${table} WHERE ${notDeleted()}`)
    .all() as (SimilarPerson & { id_kind?: string })[]
}

function othersOf(table: 'clients' | 'opponents', excludeId?: string) {
  const exclude = String(excludeId || '').trim()
  const rows = loadPeople(table)
  return exclude ? rows.filter((r) => String(r.id) !== exclude) : rows
}

export function findDuplicateNationalId(
  table: 'clients' | 'opponents',
  data: Record<string, unknown>,
  excludeId?: string
): SimilarPerson | null {
  const key = identityKey(data)
  if (!key.nid) return null
  const hit = othersOf(table, excludeId).find((r) => identityKey(r as Record<string, unknown>).nid === key.nid)
  if (!hit) return null
  return {
    id: hit.id,
    client_number: hit.client_number || (table === 'opponents' ? 'خصم' : ''),
    full_name: hit.full_name,
    national_id: hit.national_id
  }
}

export function assertDuplicateNationalId(
  table: 'clients' | 'opponents',
  data: Record<string, unknown>,
  excludeId?: string
) {
  const hit = findDuplicateNationalId(table, data, excludeId)
  if (!hit) return
  const label = table === 'opponents' ? 'خصم' : 'موكل'
  throw new ValidationError(`هذا الرقم القومي مسجل لل${label} «${hit.full_name}» (كود ${hit.client_number})`, {
    national_id: `هذا الرقم القومي مسجل مسبقاً لـ «${hit.full_name}»`
  })
}

function similarError(hit: SimilarPerson): never {
  throw new ValidationError(`هذا الاسم مسجل بالفعل لشخص «${hit.full_name}» (كود ${hit.client_number})`, {
    _similar: JSON.stringify(hit)
  })
}

export function assertPersonIdentity(
  table: 'clients' | 'opponents',
  data: Record<string, unknown>,
  opts: { excludeId?: string; forceSimilar?: boolean; old?: Record<string, unknown> | null } = {}
) {
  assertDuplicateNationalId(table, data, opts.excludeId)
  if (opts.forceSimilar) return
  if (opts.old && nameUnchanged(opts.old, data)) return

  const name = normalizePersonName(data.full_name)
  if (!name) return
  const hit = othersOf(table, opts.excludeId).find((r) => normalizePersonName(r.full_name) === name)
  if (!hit) return
  similarError({
    id: hit.id,
    client_number: hit.client_number || (table === 'opponents' ? 'خصم' : ''),
    full_name: hit.full_name,
    national_id: hit.national_id
  })
}

export function isValidationError(err: unknown): err is ValidationError {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; fieldErrors?: Record<string, string> }
  return e.name === 'ValidationError' || Boolean(e.fieldErrors && (e.fieldErrors._similar || Object.keys(e.fieldErrors).length))
}
