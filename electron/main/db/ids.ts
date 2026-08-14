import { randomUUID } from 'crypto'

export function newId(): string {
  return randomUUID()
}

export function asId(value: unknown): string {
  if (value == null || value === '') return ''
  return String(value)
}

export function asIdOrNull(value: unknown): string | null {
  const id = asId(value)
  return id || null
}

export const NOT_DELETED = '(deleted_at IS NULL)'

export function notDeleted(alias?: string): string {
  return alias ? `(${alias}.deleted_at IS NULL)` : NOT_DELETED
}
