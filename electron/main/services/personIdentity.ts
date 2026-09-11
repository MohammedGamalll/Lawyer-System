import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'
import { ValidationError } from '@shared/schemas'

export function normalizePersonName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
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

function similarError(hit: SimilarPerson): never {
  throw new ValidationError(
    `هذا الاسم مسجل بالفعل لشخص «${hit.full_name}» (كود ${hit.client_number})`,
    { _similar: JSON.stringify(hit) }
  )
}

export function assertPersonIdentity(
  table: 'clients' | 'opponents',
  data: Record<string, unknown>,
  opts: { excludeId?: string; forceSimilar?: boolean; old?: Record<string, unknown> | null } = {}
) {
  if (opts.forceSimilar) return
  const exclude = String(opts.excludeId || '').trim()
  if (opts.old && nameUnchanged(opts.old, data)) return

  const name = normalizePersonName(data.full_name)
  if (!name) return
  const numberExpr = table === 'clients' ? 'client_number' : `'' as client_number`
  const rows = getDb()
    .prepare(
      `SELECT id, full_name, national_id, ${numberExpr} FROM ${table} WHERE ${notDeleted()}`
    )
    .all() as SimilarPerson[]

  const others = exclude ? rows.filter((r) => String(r.id) !== exclude) : rows
  const hit = others.find((r) => normalizePersonName(r.full_name) === name)
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
