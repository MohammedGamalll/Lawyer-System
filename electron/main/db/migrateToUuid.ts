import fs from 'fs'
import type Database from 'better-sqlite3'
import log from 'electron-log'
import { SCHEMA_SQL } from './schema'
import { newId } from './ids'
import { nowIso } from '../utils/time'
import { getBackupDir } from '../paths'

type Db = Database.Database
type IdMap = Map<string, string>

function colType(db: Db, table: string, col: string): string | null {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]
    return cols.find((c) => c.name === col)?.type ?? null
  } catch {
    return null
  }
}

function needsUuidMigration(db: Db): boolean {
  const t = colType(db, 'users', 'id')
  if (!t) return false
  return !/text|char|clob/i.test(t)
}

function buildMap(db: Db, table: string): IdMap {
  const m: IdMap = new Map()
  if (!colType(db, table, 'id') && !colType(db, `_legacy_${table}`, 'id')) return m
  const src = colType(db, `_legacy_${table}`, 'id') ? `_legacy_${table}` : table
  const rows = db.prepare(`SELECT id FROM ${src}`).all() as { id: unknown }[]
  for (const r of rows) m.set(String(r.id), newId())
  return m
}

function fk(map: IdMap, value: unknown): string | null {
  if (value == null || value === '') return null
  return map.get(String(value)) ?? null
}

function reqFk(map: IdMap, value: unknown): string {
  const v = fk(map, value)
  if (!v) throw new Error(`تعذر ربط معرف قديم: ${String(value)}`)
  return v
}

function ts(): string {
  return nowIso()
}

function copySimple(
  db: Db,
  table: string,
  map: IdMap,
  extra: (row: Record<string, unknown>, id: string) => { cols: string[]; vals: unknown[] }
) {
  const src = `_legacy_${table}`
  const rows = db.prepare(`SELECT * FROM ${src}`).all() as Record<string, unknown>[]
  for (const row of rows) {
    const id = map.get(String(row.id)) || newId()
    const { cols, vals } = extra(row, id)
    const ph = cols.map(() => '?').join(',')
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`).run(...vals)
  }
}

export function migrateToUuidIfNeeded(db: Db, dbPath: string): void {
  if (!needsUuidMigration(db)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)
    return
  }

  const backupDir = getBackupDir()
  const backupPath = `${backupDir}/pre-uuid-${Date.now()}.db`
  fs.copyFileSync(dbPath, backupPath)
  log.info('UUID migration backup', backupPath)

  const names = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as {
      name: string
    }[]
  ).map((t) => t.name)

  db.exec('PRAGMA foreign_keys = OFF')
  const run = db.transaction(() => {
    for (const name of names) {
      if (name.startsWith('_legacy_')) continue
      db.exec(`ALTER TABLE "${name}" RENAME TO "_legacy_${name}"`)
    }
    db.exec(SCHEMA_SQL.replace(/PRAGMA foreign_keys = ON;/, 'PRAGMA foreign_keys = OFF;'))

    const roles = buildMap(db, 'roles')
    const permissions = buildMap(db, 'permissions')
    const users = buildMap(db, 'users')
    const clients = buildMap(db, 'clients')
    const lawyers = buildMap(db, 'lawyers')
    const employees = buildMap(db, 'employees')
    const opponents = buildMap(db, 'opponents')
    const caseTypes = buildMap(db, 'case_types')
    const cases = buildMap(db, 'cases')
    const hearings = buildMap(db, 'hearings')
    const documents = buildMap(db, 'documents')
    const contracts = buildMap(db, 'contracts')
    const payments = buildMap(db, 'payments')
    const invoices = buildMap(db, 'invoices')
    const cashboxes = buildMap(db, 'cashboxes')
    const expCats = buildMap(db, 'expense_categories')

    const t0 = ts()

    copySimple(db, 'roles', roles, (row, id) => ({
      cols: ['id', 'code', 'name_ar', 'name_en', 'is_system', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.code, row.name_ar, row.name_en, row.is_system ?? 1, t0, t0, null]
    }))
    copySimple(db, 'permissions', permissions, (row, id) => ({
      cols: ['id', 'code', 'name_ar', 'name_en', 'module', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.code, row.name_ar, row.name_en, row.module, t0, t0, null]
    }))

    const rpRows = db.prepare('SELECT * FROM _legacy_role_permissions').all() as Record<string, unknown>[]
    for (const row of rpRows) {
      db.prepare(
        `INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL)`
      ).run(newId(), reqFk(roles, row.role_id), reqFk(permissions, row.permission_id), t0, t0)
    }

    copySimple(db, 'users', users, (row, id) => ({
      cols: [
        'id', 'username', 'password_hash', 'full_name', 'email', 'phone', 'role_id', 'is_active',
        'failed_login_attempts', 'locked_until', 'last_login_at', 'last_login_device', 'avatar_path',
        'created_at', 'updated_at', 'deleted_at'
      ],
      vals: [
        id, row.username, row.password_hash, row.full_name, row.email, row.phone, reqFk(roles, row.role_id),
        row.is_active ?? 1, row.failed_login_attempts ?? 0, row.locked_until, row.last_login_at,
        row.last_login_device, row.avatar_path, row.created_at || t0, row.updated_at || t0, null
      ]
    }))

    const upRows = db.prepare('SELECT * FROM _legacy_user_permissions').all() as Record<string, unknown>[]
    for (const row of upRows) {
      db.prepare(
        `INSERT INTO user_permissions (id, user_id, permission_id, granted, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,NULL)`
      ).run(newId(), reqFk(users, row.user_id), reqFk(permissions, row.permission_id), row.granted ?? 1, t0, t0)
    }

    if (colType(db, '_legacy_sessions', 'id')) {
      const srows = db.prepare('SELECT * FROM _legacy_sessions').all() as Record<string, unknown>[]
      for (const row of srows) {
        const uid = fk(users, row.user_id)
        if (!uid) continue
        db.prepare(
          `INSERT INTO sessions (id, user_id, created_at, expires_at, device_info) VALUES (?,?,?,?,?)`
        ).run(row.id, uid, row.created_at, row.expires_at, row.device_info)
      }
    }

    if (colType(db, '_legacy_login_attempts', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_login_attempts').all() as Record<string, unknown>[]
      for (const row of rows) {
        db.prepare(
          `INSERT INTO login_attempts (id, username, success, device_info, created_at) VALUES (?,?,?,?,?)`
        ).run(newId(), row.username, row.success, row.device_info, row.created_at || t0)
      }
    }

    if (colType(db, '_legacy_settings', 'key')) {
      const rows = db.prepare('SELECT * FROM _legacy_settings').all() as { key: string; value: string }[]
      for (const row of rows) {
        db.prepare(`INSERT INTO settings (key, value, updated_at, deleted_at) VALUES (?,?,?,NULL)`).run(row.key, row.value, t0)
      }
    }

    if (colType(db, '_legacy_number_sequences', 'name')) {
      const rows = db.prepare('SELECT * FROM _legacy_number_sequences').all() as Record<string, unknown>[]
      for (const row of rows) {
        db.prepare(
          `INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL)`
        ).run(row.name, row.prefix, row.current_value, row.padding, t0)
      }
    }

    copySimple(db, 'clients', clients, (row, id) => ({
      cols: [
        'id', 'client_number', 'full_name', 'trade_name', 'national_id', 'phone', 'phone2', 'whatsapp', 'email',
        'address', 'governorate', 'district', 'client_type', 'profession', 'birth_date', 'extra_data', 'notes',
        'commercial_register', 'tax_id', 'manager_name', 'is_archived', 'created_at', 'updated_at', 'created_by', 'deleted_at'
      ],
      vals: [
        id, row.client_number, row.full_name, row.trade_name, row.national_id, row.phone, row.phone2, row.whatsapp,
        row.email, row.address, row.governorate, row.district, row.client_type, row.profession, row.birth_date,
        row.extra_data, row.notes, row.commercial_register, row.tax_id, row.manager_name, row.is_archived ?? 0,
        row.created_at || t0, row.updated_at || t0, fk(users, row.created_by), null
      ]
    }))

    if (colType(db, '_legacy_client_contacts', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_client_contacts').all() as Record<string, unknown>[]
      for (const row of rows) {
        const cid = fk(clients, row.client_id)
        if (!cid) continue
        db.prepare(
          `INSERT INTO client_contacts (id, client_id, name, position, phone, email, created_at, updated_at, deleted_at)
           VALUES (?,?,?,?,?,?,?,?,NULL)`
        ).run(newId(), cid, row.name, row.position, row.phone, row.email, t0, t0)
      }
    }

    copySimple(db, 'lawyers', lawyers, (row, id) => ({
      cols: [
        'id', 'user_id', 'full_name', 'photo_path', 'bar_number', 'specialization', 'phone', 'email', 'hire_date',
        'status', 'notes', 'created_at', 'updated_at', 'deleted_at'
      ],
      vals: [
        id, fk(users, row.user_id), row.full_name, row.photo_path, row.bar_number, row.specialization, row.phone,
        row.email, row.hire_date, row.status || 'active', row.notes, row.created_at || t0, t0, null
      ]
    }))

    copySimple(db, 'employees', employees, (row, id) => ({
      cols: [
        'id', 'user_id', 'full_name', 'job_title', 'department', 'salary', 'hire_date', 'phone', 'email', 'status',
        'notes', 'photo_path', 'license_no', 'qualification', 'created_at', 'updated_at', 'deleted_at'
      ],
      vals: [
        id, fk(users, row.user_id), row.full_name, row.job_title, row.department, row.salary, row.hire_date, row.phone,
        row.email, row.status || 'active', row.notes, row.photo_path, row.license_no, row.qualification,
        row.created_at || t0, t0, null
      ]
    }))

    for (const table of ['attendance', 'leaves'] as const) {
      if (!colType(db, `_legacy_${table}`, 'id')) continue
      const rows = db.prepare(`SELECT * FROM _legacy_${table}`).all() as Record<string, unknown>[]
      for (const row of rows) {
        const eid = fk(employees, row.employee_id)
        if (!eid) continue
        if (table === 'attendance') {
          db.prepare(
            `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, notes, created_at, updated_at, deleted_at)
             VALUES (?,?,?,?,?,?,?,?,?,NULL)`
          ).run(newId(), eid, row.date, row.check_in, row.check_out, row.status, row.notes, t0, t0)
        } else {
          db.prepare(
            `INSERT INTO leaves (id, employee_id, leave_type, start_date, end_date, status, notes, created_at, updated_at, deleted_at)
             VALUES (?,?,?,?,?,?,?,?,?,NULL)`
          ).run(newId(), eid, row.leave_type, row.start_date, row.end_date, row.status, row.notes, t0, t0)
        }
      }
    }

    copySimple(db, 'opponents', opponents, (row, id) => ({
      cols: ['id', 'full_name', 'national_id', 'phone', 'address', 'lawyer_name', 'extra_data', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.full_name, row.national_id, row.phone, row.address, row.lawyer_name, row.extra_data, row.notes, row.created_at || t0, t0, null]
    }))

    copySimple(db, 'case_types', caseTypes, (row, id) => ({
      cols: ['id', 'name_ar', 'name_en', 'is_active', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.name_ar, row.name_en, row.is_active ?? 1, row.sort_order ?? 0, t0, t0, null]
    }))

    copySimple(db, 'cases', cases, (row, id) => ({
      cols: [
        'id', 'case_number', 'internal_file_number', 'title', 'client_id', 'primary_lawyer_id', 'assistant_lawyer_id',
        'case_type_id', 'category', 'court', 'circuit', 'governorate', 'court_address', 'circuit_number',
        'litigation_degree', 'filing_date', 'received_date', 'status', 'case_value', 'opponent_name', 'opponent_lawyer',
        'opponent_case_number', 'description', 'summary', 'notes', 'is_archived', 'closed_at', 'created_at', 'updated_at',
        'created_by', 'deleted_at'
      ],
      vals: [
        id, row.case_number, row.internal_file_number, row.title, reqFk(clients, row.client_id),
        fk(lawyers, row.primary_lawyer_id), fk(lawyers, row.assistant_lawyer_id), fk(caseTypes, row.case_type_id),
        row.category, row.court, row.circuit, row.governorate, row.court_address, row.circuit_number,
        row.litigation_degree, row.filing_date, row.received_date, row.status, row.case_value, row.opponent_name,
        row.opponent_lawyer, row.opponent_case_number, row.description, row.summary, row.notes, row.is_archived ?? 0,
        row.closed_at, row.created_at || t0, row.updated_at || t0, fk(users, row.created_by), null
      ]
    }))

    if (colType(db, '_legacy_case_links', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_case_links').all() as Record<string, unknown>[]
      for (const row of rows) {
        const a = fk(cases, row.case_id)
        const b = fk(cases, row.related_case_id)
        if (!a || !b) continue
        db.prepare(
          `INSERT INTO case_links (id, case_id, related_case_id, link_type, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,NULL)`
        ).run(newId(), a, b, row.link_type, t0, t0)
      }
    }

    if (colType(db, '_legacy_case_opponents', 'case_id')) {
      const rows = db.prepare('SELECT * FROM _legacy_case_opponents').all() as Record<string, unknown>[]
      for (const row of rows) {
        const a = fk(cases, row.case_id)
        const b = fk(opponents, row.opponent_id)
        if (!a || !b) continue
        db.prepare(
          `INSERT INTO case_opponents (id, case_id, opponent_id, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,NULL)`
        ).run(newId(), a, b, t0, t0)
      }
    }

    copySimple(db, 'hearings', hearings, (row, id) => ({
      cols: [
        'id', 'case_id', 'hearing_date', 'hearing_time', 'hearing_type', 'lawyer_id', 'status', 'result',
        'court_decision', 'postponement_reason', 'next_hearing_date', 'what_happened', 'required_documents',
        'next_actions', 'notes', 'created_at', 'updated_at', 'deleted_at'
      ],
      vals: [
        id, reqFk(cases, row.case_id), row.hearing_date, row.hearing_time, row.hearing_type, fk(lawyers, row.lawyer_id),
        row.status, row.result, row.court_decision, row.postponement_reason, row.next_hearing_date, row.what_happened,
        row.required_documents, row.next_actions, row.notes, row.created_at || t0, row.updated_at || t0, null
      ]
    }))

    const copyFkEntity = (table: string, map: IdMap | null, builder: (row: Record<string, unknown>, id: string) => { cols: string[]; vals: unknown[] }) => {
      if (!colType(db, `_legacy_${table}`, 'id')) return
      const local = map || buildMap(db, table)
      copySimple(db, table, local, builder)
    }

    copyFkEntity('appointments', null, (row, id) => ({
      cols: ['id', 'title', 'appointment_type', 'client_id', 'lawyer_id', 'case_id', 'date', 'time', 'location', 'purpose', 'notes', 'status', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.title, row.appointment_type, fk(clients, row.client_id), fk(lawyers, row.lawyer_id), fk(cases, row.case_id), row.date, row.time, row.location, row.purpose, row.notes, row.status, row.created_at || t0, t0, null]
    }))
    copyFkEntity('tasks', null, (row, id) => ({
      cols: ['id', 'title', 'description', 'assignee_id', 'case_id', 'client_id', 'start_date', 'due_date', 'priority', 'status', 'progress', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.title, row.description, fk(users, row.assignee_id), fk(cases, row.case_id), fk(clients, row.client_id), row.start_date, row.due_date, row.priority, row.status, row.progress ?? 0, row.created_at || t0, row.updated_at || t0, null]
    }))
    copyFkEntity('reminders', null, (row, id) => ({
      cols: ['id', 'reminder_type', 'title', 'remind_at', 'notify_before_minutes', 'priority', 'assignee_id', 'case_id', 'client_id', 'related_type', 'related_id', 'is_sent', 'is_dismissed', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.reminder_type, row.title, row.remind_at, row.notify_before_minutes, row.priority, fk(users, row.assignee_id), fk(cases, row.case_id), fk(clients, row.client_id), row.related_type, row.related_id != null ? String(row.related_id) : null, row.is_sent, row.is_dismissed, row.notes, row.created_at || t0, t0, null]
    }))
    copyFkEntity('notifications', null, (row, id) => ({
      cols: ['id', 'user_id', 'title', 'body', 'type', 'related_type', 'related_id', 'is_read', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, fk(users, row.user_id), row.title, row.body, row.type, row.related_type, row.related_id != null ? String(row.related_id) : null, row.is_read, row.created_at || t0, t0, null]
    }))

    copySimple(db, 'documents', documents, (row, id) => ({
      cols: ['id', 'title', 'category', 'client_id', 'case_id', 'hearing_id', 'contract_id', 'file_path', 'file_name', 'mime_type', 'file_size', 'current_version', 'notes', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.title, row.category, fk(clients, row.client_id), fk(cases, row.case_id), fk(hearings, row.hearing_id), row.contract_id != null ? fk(contracts, row.contract_id) : null, row.file_path, row.file_name, row.mime_type, row.file_size, row.current_version ?? 1, row.notes, fk(users, row.created_by), row.created_at || t0, row.updated_at || t0, null]
    }))

    if (colType(db, '_legacy_document_versions', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_document_versions').all() as Record<string, unknown>[]
      for (const row of rows) {
        const did = fk(documents, row.document_id)
        if (!did) continue
        db.prepare(
          `INSERT INTO document_versions (id, document_id, version, file_path, file_name, created_by, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,NULL)`
        ).run(newId(), did, row.version, row.file_path, row.file_name, fk(users, row.created_by), row.created_at || t0, t0)
      }
    }

    copyFkEntity('power_of_attorney', null, (row, id) => ({
      cols: ['id', 'poa_number', 'poa_type', 'client_id', 'lawyer_id', 'issuing_authority', 'issue_date', 'expiry_date', 'status', 'document_id', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.poa_number, row.poa_type, fk(clients, row.client_id), fk(lawyers, row.lawyer_id), row.issuing_authority, row.issue_date, row.expiry_date, row.status, fk(documents, row.document_id), row.notes, row.created_at || t0, t0, null]
    }))
    copySimple(db, 'contracts', contracts, (row, id) => ({
      cols: ['id', 'contract_number', 'title', 'client_id', 'contract_type', 'start_date', 'end_date', 'value', 'status', 'lawyer_id', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.contract_number, row.title, fk(clients, row.client_id), row.contract_type, row.start_date, row.end_date, row.value, row.status, fk(lawyers, row.lawyer_id), row.notes, row.created_at || t0, t0, null]
    }))
    copyFkEntity('consultations', null, (row, id) => ({
      cols: ['id', 'client_id', 'lawyer_id', 'consultation_date', 'consultation_type', 'subject', 'details', 'recommendations', 'fees', 'payment_status', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, fk(clients, row.client_id), fk(lawyers, row.lawyer_id), row.consultation_date, row.consultation_type, row.subject, row.details, row.recommendations, row.fees, row.payment_status, row.notes, row.created_at || t0, t0, null]
    }))
    copyFkEntity('correspondence', null, (row, id) => ({
      cols: ['id', 'correspondence_number', 'direction', 'correspondence_type', 'date', 'party', 'subject', 'responsible_user_id', 'case_id', 'client_id', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.correspondence_number, row.direction, row.correspondence_type, row.date, row.party, row.subject, fk(users, row.responsible_user_id), fk(cases, row.case_id), fk(clients, row.client_id), row.notes, row.created_at || t0, t0, null]
    }))

    copySimple(db, 'cashboxes', cashboxes, (row, id) => ({
      cols: ['id', 'name', 'type', 'current_balance', 'is_active', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.name, row.type, row.current_balance ?? 0, row.is_active ?? 1, t0, t0, null]
    }))

    if (colType(db, '_legacy_case_fees', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_case_fees').all() as Record<string, unknown>[]
      for (const row of rows) {
        const cid = fk(cases, row.case_id)
        if (!cid) continue
        db.prepare(
          `INSERT INTO case_fees (id, case_id, total_fees, paid, remaining, due_date, payment_method, installment_count, notes, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`
        ).run(newId(), cid, row.total_fees ?? 0, row.paid ?? 0, row.remaining ?? 0, row.due_date, row.payment_method, row.installment_count ?? 1, row.notes, t0, t0)
      }
    }

    copySimple(db, 'payments', payments, (row, id) => ({
      cols: ['id', 'payment_number', 'client_id', 'case_id', 'amount', 'payment_type', 'payment_method', 'cashbox_id', 'payment_date', 'due_date', 'notes', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.payment_number, fk(clients, row.client_id), fk(cases, row.case_id), row.amount, row.payment_type, row.payment_method, fk(cashboxes, row.cashbox_id), row.payment_date, row.due_date, row.notes, fk(users, row.created_by), row.created_at || t0, t0, null]
    }))
    copySimple(db, 'invoices', invoices, (row, id) => ({
      cols: ['id', 'invoice_number', 'client_id', 'case_id', 'invoice_date', 'due_date', 'subtotal', 'tax', 'total', 'paid', 'status', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.invoice_number, fk(clients, row.client_id), fk(cases, row.case_id), row.invoice_date, row.due_date, row.subtotal, row.tax, row.total, row.paid, row.status, row.notes, row.created_at || t0, t0, null]
    }))

    if (colType(db, '_legacy_invoice_items', 'id')) {
      const rows = db.prepare('SELECT * FROM _legacy_invoice_items').all() as Record<string, unknown>[]
      for (const row of rows) {
        const iid = fk(invoices, row.invoice_id)
        if (!iid) continue
        db.prepare(
          `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,NULL)`
        ).run(newId(), iid, row.description, row.quantity, row.unit_price, row.total, t0, t0)
      }
    }

    copyFkEntity('receipts', null, (row, id) => ({
      cols: ['id', 'receipt_number', 'payment_id', 'client_id', 'amount', 'receipt_date', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.receipt_number, fk(payments, row.payment_id), fk(clients, row.client_id), row.amount, row.receipt_date, row.notes, row.created_at || t0, t0, null]
    }))
    copyFkEntity('vouchers', null, (row, id) => ({
      cols: ['id', 'voucher_number', 'voucher_type', 'amount', 'cashbox_id', 'related_id', 'voucher_date', 'notes', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.voucher_number, row.voucher_type, row.amount, fk(cashboxes, row.cashbox_id), row.related_id != null ? String(row.related_id) : null, row.voucher_date, row.notes, row.created_at || t0, t0, null]
    }))
    copySimple(db, 'expense_categories', expCats, (row, id) => ({
      cols: ['id', 'name_ar', 'name_en', 'is_active', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.name_ar, row.name_en, row.is_active ?? 1, t0, t0, null]
    }))
    copyFkEntity('expenses', null, (row, id) => ({
      cols: ['id', 'expense_number', 'category_id', 'amount', 'cashbox_id', 'expense_date', 'client_id', 'case_id', 'description', 'notes', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, row.expense_number, fk(expCats, row.category_id), row.amount, fk(cashboxes, row.cashbox_id), row.expense_date, fk(clients, row.client_id), fk(cases, row.case_id), row.description, row.notes, fk(users, row.created_by), row.created_at || t0, t0, null]
    }))
    copyFkEntity('cashbox_transactions', null, (row, id) => ({
      cols: ['id', 'cashbox_id', 'transaction_type', 'amount', 'related_type', 'related_id', 'description', 'transaction_date', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, reqFk(cashboxes, row.cashbox_id), row.transaction_type, row.amount, row.related_type, row.related_id != null ? String(row.related_id) : null, row.description, row.transaction_date, fk(users, row.created_by), row.created_at || t0, t0, null]
    }))
    copyFkEntity('audit_logs', null, (row, id) => ({
      cols: ['id', 'user_id', 'username', 'action', 'entity_type', 'entity_id', 'description', 'old_values', 'new_values', 'device_info', 'created_at', 'updated_at', 'deleted_at'],
      vals: [id, fk(users, row.user_id), row.username, row.action, row.entity_type, row.entity_id != null ? String(row.entity_id) : null, row.description, row.old_values, row.new_values, row.device_info, row.created_at || t0, t0, null]
    }))

    const leftover = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_legacy_%'`).all() as { name: string }[]
    for (const t of leftover) db.exec(`DROP TABLE "${t.name}"`)
  })

  try {
    run()
    db.exec('PRAGMA foreign_keys = ON')
    log.info('UUID migration completed')
  } catch (err) {
    log.error('UUID migration failed; database rolled back. Backup kept at', backupPath, err)
    try {
      db.exec('ROLLBACK')
    } catch {
      /* transaction already rolled back */
    }
    throw err
  }
}
