import log from 'electron-log'
import { NUMBERED_TABLES } from '../db/schema'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { getSupabase } from './client'
import { adoptRemoteId, isUniqueConflict } from './adoptRemoteId'
import { mapSyncError } from './errors'
import { omitLocalOnly, stripColumn, unknownColumnFromError } from './payload'
import { getSetting } from '../services/settings'
import { FULL_PULL_FLAG, hasIncompletePull } from './pull'
import { listQueue, pendingCount, removeQueueItem, enqueueIfAbsent, enqueueParentSnapshot, pkColumn, deferQueueItem } from './queue'
import { emitSyncStatus } from './status'
import { withTimeout } from './timeout'
import { fkFieldToTable, uniqueKeyOf } from './uniqueKey'

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

type Sb = NonNullable<ReturnType<typeof getSupabase>>

async function findRemoteId(sb: Sb, table: string, key: { columns: string[]; values: string[] }): Promise<string | null> {
  let query = sb.from(table).select('id')
  for (let i = 0; i < key.columns.length; i += 1) {
    query = query.eq(key.columns[i], key.values[i])
  }
  const { data, error } = await withTimeout(query.maybeSingle())
  if (error || !data || data.id == null) return null
  return String(data.id)
}

async function remoteHasId(sb: Sb, table: string, id: string): Promise<boolean> {
  const pk = pkColumn(table)
  const { data, error } = await withTimeout(sb.from(table).select(pk).eq(pk, id).maybeSingle())
  return !error && Boolean(data)
}

async function resolveIdentityConflict(
  sb: Sb,
  table: string,
  payload: Record<string, unknown>,
  localId: string,
  errorMessage = ''
): Promise<Record<string, unknown> | null> {
  const key = uniqueKeyOf(table, payload, errorMessage)
  if (!key) return null
  const remoteId = await findRemoteId(sb, table, key)
  if (!remoteId) return null
  adoptRemoteId(table, localId, remoteId)
  const pk = pkColumn(table)
  const row = getDb().prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(remoteId) as Record<string, unknown> | undefined
  return omitLocalOnly(row || { ...payload, [pk]: remoteId })
}

async function dropIfAlreadyRemote(
  sb: Sb,
  table: string,
  payload: Record<string, unknown>,
  localId: string,
  errorMessage = ''
): Promise<boolean> {
  if (await remoteHasId(sb, table, localId)) return true
  const key = uniqueKeyOf(table, payload, errorMessage)
  if (!key) return false
  const remoteId = await findRemoteId(sb, table, key)
  if (!remoteId) return false
  adoptRemoteId(table, localId, remoteId)
  return true
}

function livePayload(table: string, recordId: string, fallback: Record<string, unknown>): Record<string, unknown> | null {
  const pk = pkColumn(table)
  const row = getDb().prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(recordId) as Record<string, unknown> | undefined
  if (row) return omitLocalOnly(row)
  if (fallback.deleted_at) return omitLocalOnly(fallback)
  return null
}

async function upsertSanitized(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  table: string,
  payload: Record<string, unknown>,
  onConflict: string
): Promise<{ data?: unknown; error: { message?: string; code?: string } | null }> {
  let current = omitLocalOnly(payload)
  for (let i = 0; i < 12; i += 1) {
    const res = await withTimeout(sb.from(table).upsert(current, { onConflict }))
    if (!res.error) return res
    const col = unknownColumnFromError(res.error.message || '')
    if (!col || !(col in current)) return res
    current = stripColumn(current, col)
  }
  return { error: { message: 'تعذر رفع الصف بعد حذف الأعمدة غير المعروفة' } }
}

function queueMissingParent(payload: Record<string, unknown>, message: string): boolean {
  const match = message.match(/constraint "([^"]+)"/)
  const name = match?.[1] || ''
  const mapped = FK_PARENT[name]
  if (mapped) {
    const id = payload[mapped.field]
    if (id == null || id === '') return false
    enqueueIfAbsent(mapped.table, String(id), 'UPDATE')
    return true
  }
  const lower = message.toLowerCase()
  if (!lower.includes('foreign key') && !lower.includes('23503') && !lower.includes('violates')) return false
  let queued = false
  for (const [field, value] of Object.entries(payload)) {
    if (!field.endsWith('_id') && field !== 'created_by') continue
    if (value == null || value === '') continue
    const table = fkFieldToTable(field)
    if (!table) continue
    enqueueIfAbsent(table, String(value), 'UPDATE')
    queued = true
  }
  return queued
}

export async function pushQueue(): Promise<string> {
  const sb = getSupabase()
  if (!sb) return ''
  if (getSetting(FULL_PULL_FLAG, '') === 'done' && !hasIncompletePull()) {
    enqueueParentSnapshot()
  }
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
        const live = livePayload(item.table_name, item.record_id, payload)
        if (!live) {
          removeQueueItem(item.id)
          progressed = true
          continue
        }
        payload = live
        if (item.table_name === 'settings') {
          if (String(payload.key || item.record_id).startsWith('sync_')) {
            removeQueueItem(item.id)
            progressed = true
            continue
          }
          const { error } = await upsertSanitized(sb, 'settings', payload, 'key')
          if (error) throw error
        } else if (item.table_name === 'number_sequences') {
          const { error } = await upsertSanitized(sb, 'number_sequences', payload, 'name')
          if (error) throw error
        } else {
          const seq = NUMBERED_TABLES[item.table_name]
          const numCol = NUMBER_COL[item.table_name]
          if (seq && numCol && item.operation === 'INSERT') {
            const { data, error } = await withTimeout(
              sb.rpc('upsert_with_number', {
                p_table: item.table_name,
                p_row: omitLocalOnly(payload),
                p_seq: seq,
                p_number_col: numCol
              })
            )
            if (error) {
              const { error: e2 } = await upsertSanitized(sb, item.table_name, payload, 'id')
              if (e2?.message?.toLowerCase().includes('unique') || e2?.code === '23505') {
                const { data: num, error: nerr } = await withTimeout(sb.rpc('allocate_next_number', { seq_name: seq }))
                if (nerr) throw nerr
                payload = { ...payload, [numCol]: num }
                getDb()
                  .prepare(`UPDATE ${item.table_name} SET ${numCol}=?, updated_at=? WHERE id=?`)
                  .run(num, nowIso(), item.record_id)
                const { error: e3 } = await upsertSanitized(sb, item.table_name, payload, 'id')
                if (e3) throw e3
              } else if (e2) throw e2
            } else if (data && typeof data === 'object' && numCol in (data as object)) {
              const n = (data as Record<string, unknown>)[numCol]
              if (n) getDb().prepare(`UPDATE ${item.table_name} SET ${numCol}=? WHERE id=?`).run(n, item.record_id)
            }
          } else {
            let { error } = await upsertSanitized(sb, item.table_name, payload, 'id')
            if (error && isUniqueConflict(error)) {
              const remapped = await resolveIdentityConflict(
                sb,
                item.table_name,
                payload,
                item.record_id,
                error.message || ''
              )
              if (remapped) {
                payload = remapped
                const retry = await upsertSanitized(sb, item.table_name, payload, 'id')
                error = retry.error
              }
              if (error && isUniqueConflict(error)) {
                if (await dropIfAlreadyRemote(sb, item.table_name, payload, item.record_id, error.message || '')) {
                  removeQueueItem(item.id)
                  progressed = true
                  pushed += 1
                  continue
                }
                if (!remapped) throw error
              }
            }
            if (error) throw error
          }
        }
        removeQueueItem(item.id)
        progressed = true
        pushed += 1
        if (pushed % 5 === 0) emitSyncStatus('syncing', `جاري رفع ${item.table_name} (${pendingCount()} متبقي)`)
      } catch (err) {
        const raw = String((err as Error).message || err)
        lastError = mapSyncError(raw)
        if (lastError.includes('مهلة')) {
          emitSyncStatus('syncing', lastError)
          return lastError
        }
        if (item.table_name === 'audit_logs') {
          removeQueueItem(item.id)
          progressed = true
          continue
        }
        let queuedParent = false
        try {
          const payload = JSON.parse(item.payload) as Record<string, unknown>
          queuedParent = queueMissingParent(payload, raw)
        } catch {
          /* ignore */
        }
        if (queuedParent) progressed = true
        else {
          try {
            const payload = JSON.parse(item.payload) as Record<string, unknown>
            if (isUniqueConflict(err) && (await dropIfAlreadyRemote(sb, item.table_name, payload, item.record_id, raw))) {
              removeQueueItem(item.id)
              progressed = true
              pushed += 1
              continue
            }
          } catch {
            /* ignore */
          }
          deferQueueItem(item.id)
          log.warn('sync push', item.table_name, item.record_id, lastError)
        }
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
