import { naturalKeyOf } from './adoptRemoteId'

export function parseUniqueKey(message: string): { columns: string[]; values: string[] } | null {
  const raw = String(message || '')
  const match = raw.match(/Key \(([^)]+)\)=\(([\s\S]*?)\)(?:\s|$)/i)
  if (!match) return null
  const columns = match[1]
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const values = splitPgValues(match[2])
  if (!columns.length || columns.length !== values.length) return null
  if (values.some((v) => !v)) return null
  return { columns, values }
}

function splitPgValues(inner: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (ch === '"') {
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.length || inner.endsWith(',')) out.push(cur.trim())
  return out.map((v) => v.replace(/^'|'$/g, ''))
}

export function uniqueKeyOf(
  table: string,
  row: Record<string, unknown>,
  errorMessage = ''
): { columns: string[]; values: string[] } | null {
  const parsed = parseUniqueKey(errorMessage)
  if (parsed) return parsed
  return naturalKeyOf(table, row)
}

export function fkFieldToTable(field: string): string | null {
  const map: Record<string, string> = {
    role_id: 'roles',
    permission_id: 'permissions',
    user_id: 'users',
    client_id: 'clients',
    case_id: 'cases',
    lawyer_id: 'lawyers',
    opponent_id: 'opponents',
    case_type_id: 'case_types',
    category_id: 'expense_categories',
    cashbox_id: 'cashboxes',
    invoice_id: 'invoices',
    document_id: 'documents',
    employee_id: 'employees',
    hearing_id: 'hearings',
    primary_lawyer_id: 'lawyers',
    assistant_lawyer_id: 'lawyers',
    created_by: 'users',
    assignee_id: 'users',
    responsible_user_id: 'users'
  }
  return map[field] || null
}
