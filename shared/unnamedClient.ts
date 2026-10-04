export const UNNAMED_CLIENT_NAME = 'بدون موكل'
export const UNNAMED_CLIENT_NUMBER = 'CL-0000'

export function isUnnamedClient(row: { client_number?: unknown; full_name?: unknown }): boolean {
  return String(row.client_number || '') === UNNAMED_CLIENT_NUMBER || String(row.full_name || '').trim() === UNNAMED_CLIENT_NAME
}
