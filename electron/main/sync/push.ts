import log from 'electron-log'
import { NUMBERED_TABLES } from '../db/schema'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { getSupabase } from './client'
import { listQueue, pendingCount, removeQueueItem, enqueueIfAbsent, enqueueParentSnapshot } from './queue'
import { emitSyncStatus } from './status'

const NUMBER_COL: Record<string, string> = {
  clients: 'client_number',
  cases: 'case_number',
  invoices: 'invoice_number',
  receipts: 'receipt_number',
  vouchers: 'voucher_number',
  payments: 'payment_number',
  expenses: 'expense_number',
  power_of_attorney: 'poa_number',
  contracts: 'contract_number',
  correspondence: 'correspondence_number'
}

const FK_PARENT: Record<string, { table: string; field: string }> = {
  users_role_id_fkey: { table: 'roles', field: 'role_id' },
  user_permissions_user_id_fkey: { table: 'users', field: 'user_id' },
  user_permissions_permission_id_fkey: { table: 'permissions', field: 'permission_id' },
  role_permissions_role_id_fkey: { table: 'roles', field: 'role_id' },
  role_permissions_permission_id_fkey: { table: 'permissions', field: 'permission_id' },
  lawyers_user_id_fkey: { table: 'users', field: 'user_id' },
  employees_user_id_fkey: { table: 'users', field: 'user_id' },
  clients_created_by_fkey: { table: 'users', field: 'created_by' },
  cases_client_id_fkey: { table: 'clients', field: 'client_id' },
  cases_primary_lawyer_id_fkey: { table: 'lawyers', field: 'primary_lawyer_id' },
  cases_assistant_lawyer_id_fkey: { table: 'lawyers', field: 'assistant_lawyer_id' },
  cases_case_type_id_fkey: { table: 'case_types', field: 'case_type_id' },
  hearings_case_id_fkey: { table: 'cases', field: 'case_id' },
  hearings_lawyer_id_fkey: { table: 'lawyers', field: 'lawyer_id' },
  tasks_assignee_id_fkey: { table: 'users', field: 'assignee_id' },
  tasks_case_id_fkey: { table: 'cases', field: 'case_id' },
  tasks_client_id_fkey: { table: 'clients', field: 'client_id' },
  reminders_assignee_id_fkey: { table: 'users', field: 'assignee_id' },
  reminders_case_id_fkey: { table: 'cases', field: 'case_id' },
  appointments_client_id_fkey: { table: 'clients', field: 'client_id' },
  appointments_lawyer_id_fkey: { table: 'lawyers', field: 'lawyer_id' },
  appointments_case_id_fkey: { table: 'cases', field: 'case_id' },
  documents_client_id_fkey: { table: 'clients', field: 'client_id' },
  documents_case_id_fkey: { table: 'cases', field: 'case_id' },
  payments_client_id_fkey: { table: 'clients', field: 'client_id' },
  payments_case_id_fkey: { table: 'cases', field: 'case_id' },
  payments_cashbox_id_fkey: { table: 'cashboxes', field: 'cashbox_id' },
  expenses_category_id_fkey: { table: 'expense_categories', field: 'category_id' },
  expenses_cashbox_id_fkey: { table: 'cashboxes', field: 'cashbox_id' },
  invoices_client_id_fkey: { table: 'clients', field: 'client_id' }
}

function queueMissingParent(payload: Record<string, unknown>, message: string): boolean {
  const match = message.match(/constraint "([^"]+)"/)
  const name = match?.[1] || ''
  const parent = FK_PARENT[name]
  if (!parent) return false
  const id = payload[parent.field]
  if (id == null || id === '') return false
  enqueueIfAbsent(parent.table, String(id), 'UPDATE')
  return true
}

export async function pushQueue(): Promise<string> {
  const sb = getSupabase()
  if (!sb) return ''
  enqueueParentSnapshot()
  if (pendingCount() === 0) return ''
  emitSyncStatus('syncing')
  let lastError = ''
  let pushed = 0
  while (pushed < 800) {
    const items = listQueue(40)
    if (!items.length) break
    let progressed = false
    for (const item of items) {
      try {
        let payload = JSON.parse(item.payload) as Record<string, unknown>
        if (item.table_name === 'settings') {
          if (String(payload.key || item.record_id).startsWith('sync_')) {
            removeQueueItem(item.id)
            progressed = true
            continue
          }
          const { error } = await sb.from('settings').upsert(payload, { onConflict: 'key' })
          if (error) throw error
        } else if (item.table_name === 'number_sequences') {
          const { error } = await sb.from('number_sequences').upsert(payload, { onConflict: 'name' })
          if (error) throw error
        } else {
          const seq = NUMBERED_TABLES[item.table_name]
          const numCol = NUMBER_COL[item.table_name]
          if (seq && numCol && item.operation === 'INSERT') {
            const { data, error } = await sb.rpc('upsert_with_number', {
              p_table: item.table_name,
              p_row: payload,
              p_seq: seq,
              p_number_col: numCol
            })
            if (error) {
              const { error: e2 } = await sb.from(item.table_name).upsert(payload, { onConflict: 'id' })
              if (e2?.message?.toLowerCase().includes('unique') || e2?.code === '23505') {
                const { data: num, error: nerr } = await sb.rpc('allocate_next_number', { seq_name: seq })
                if (nerr) throw nerr
                payload = { ...payload, [numCol]: num }
                getDb()
                  .prepare(`UPDATE ${item.table_name} SET ${numCol}=?, updated_at=? WHERE id=?`)
                  .run(num, nowIso(), item.record_id)
                const { error: e3 } = await sb.from(item.table_name).upsert(payload, { onConflict: 'id' })
                if (e3) throw e3
              } else if (e2) throw e2
            } else if (data && typeof data === 'object' && numCol in (data as object)) {
              const n = (data as Record<string, unknown>)[numCol]
              if (n) getDb().prepare(`UPDATE ${item.table_name} SET ${numCol}=? WHERE id=?`).run(n, item.record_id)
            }
          } else {
            const { error } = await sb.from(item.table_name).upsert(payload, { onConflict: 'id' })
            if (error) throw error
          }
        }
        removeQueueItem(item.id)
        progressed = true
        pushed += 1
        if (pushed % 5 === 0) emitSyncStatus('syncing')
      } catch (err) {
        lastError = String((err as Error).message || err)
        let queuedParent = false
        try {
          const payload = JSON.parse(item.payload) as Record<string, unknown>
          queuedParent = queueMissingParent(payload, lastError)
        } catch {
          /* ignore */
        }
        if (queuedParent) progressed = true
        else log.warn('sync push', item.table_name, item.record_id, lastError)
      }
    }
    if (!progressed) {
      emitSyncStatus('syncing', lastError)
      break
    }
  }
  if (pendingCount() > 0 && lastError) emitSyncStatus('syncing', lastError)
  return lastError
}
