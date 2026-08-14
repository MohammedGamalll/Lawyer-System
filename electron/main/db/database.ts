import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL, CASE_TYPE_SEEDS, EXPENSE_CATEGORY_SEEDS } from './schema'
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@shared/permissions'
import { getDbPath } from '../paths'
import { nowIso } from '../utils/time'
import { assertNetworkDriverConfigured, getDriverName } from './adapter'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDatabase(dbPath = getDbPath()): Database.Database {
  const driver = getDriverName()
  assertNetworkDriverConfigured(driver)
  if (driver !== 'sqlite') {
    throw new Error(`تشغيل ${driver} يتطلب مهايئ الشبكة. استخدم LAW_DB_DRIVER=sqlite محلياً.`)
  }
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA_SQL)
  seedIfEmpty(db)
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

function seedIfEmpty(database: Database.Database): void {
  const roleCount = database.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }
  if (roleCount.c > 0) return

  const insertRole = database.prepare(
    'INSERT INTO roles (code, name_ar, name_en, is_system) VALUES (?, ?, ?, 1)'
  )
  for (const role of ROLES) insertRole.run(role.code, role.nameAr, role.nameEn)

  const insertPerm = database.prepare(
    'INSERT INTO permissions (code, name_ar, name_en, module) VALUES (?, ?, ?, ?)'
  )
  for (const p of PERMISSIONS) insertPerm.run(p.code, p.nameAr, p.nameEn, p.module)

  const roleByCode = database.prepare('SELECT id FROM roles WHERE code = ?')
  const permByCode = database.prepare('SELECT id FROM permissions WHERE code = ?')
  const insertRp = database.prepare(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
  )

  for (const [code, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByCode.get(code) as { id: number }
    for (const permCode of perms) {
      const perm = permByCode.get(permCode) as { id: number } | undefined
      if (perm) insertRp.run(role.id, perm.id)
    }
  }

  const adminRole = roleByCode.get('admin') as { id: number }
  const hash = bcrypt.hashSync('Admin@123', 10)
  const ts = nowIso()
  database
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, email, role_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run('admin', hash, 'مدير النظام', 'admin@lawoffice.local', adminRole.id, ts, ts)

  const insertType = database.prepare(
    'INSERT INTO case_types (name_ar, name_en, is_active, sort_order) VALUES (?, ?, 1, ?)'
  )
  CASE_TYPE_SEEDS.forEach((name, i) => insertType.run(name, name, i))

  const insertExp = database.prepare(
    'INSERT INTO expense_categories (name_ar, name_en, is_active) VALUES (?, ?, 1)'
  )
  EXPENSE_CATEGORY_SEEDS.forEach((name) => insertExp.run(name, name))

  database
    .prepare('INSERT INTO cashboxes (name, type, current_balance, is_active) VALUES (?, ?, 0, 1)')
    .run('خزينة المكتب', 'office')
  database
    .prepare('INSERT INTO cashboxes (name, type, current_balance, is_active) VALUES (?, ?, 0, 1)')
    .run('البنك', 'bank')
  database
    .prepare('INSERT INTO cashboxes (name, type, current_balance, is_active) VALUES (?, ?, 0, 1)')
    .run('محفظة إلكترونية', 'wallet')

  const seq = database.prepare(
    'INSERT INTO number_sequences (name, prefix, current_value, padding) VALUES (?, ?, 0, ?)'
  )
  seq.run('client', 'CL-', 4)
  seq.run('case', 'CS-', 5)
  seq.run('invoice', 'INV-', 5)
  seq.run('receipt', 'RCP-', 5)
  seq.run('voucher', 'VCH-', 5)
  seq.run('payment', 'PAY-', 5)
  seq.run('expense', 'EXP-', 5)
  seq.run('poa', 'POA-', 4)
  seq.run('contract', 'CNT-', 4)
  seq.run('correspondence', 'COR-', 4)

  const defaults: Record<string, string> = {
    office_name: 'مكتب المحاماة',
    office_address: '',
    office_phone: '',
    office_email: '',
    currency: 'EGP',
    language: 'ar',
    theme: 'light',
    max_login_attempts: '5',
    lock_minutes: '15',
    invoice_tax_percent: '0',
    silent_print: 'false',
    print_a4_printer: '',
    print_thermal_printer: '',
    auto_update: 'true',
    update_feed_url: '',
    backup_schedule: 'daily',
    backup_path: '',
    notify_hearings: 'true'
  }
  const insertSetting = database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v)
}

export function nextNumber(database: Database.Database, name: string): string {
  const row = database.prepare('SELECT * FROM number_sequences WHERE name = ?').get(name) as {
    prefix: string
    current_value: number
    padding: number
  }
  if (!row) throw new Error(`Unknown sequence: ${name}`)
  const next = row.current_value + 1
  database.prepare('UPDATE number_sequences SET current_value = ? WHERE name = ?').run(next, name)
  return `${row.prefix}${String(next).padStart(row.padding, '0')}`
}

export function listQuery(
  database: Database.Database,
  baseSql: string,
  where: string,
  params: unknown[],
  page = 1,
  pageSize = 20,
  order = 'id DESC'
): { rows: unknown[]; total: number; page: number; pageSize: number } {
  const total = (
    database.prepare(`SELECT COUNT(*) as c FROM (${baseSql} ${where})`).get(...params) as { c: number }
  ).c
  const offset = (page - 1) * pageSize
  const rows = database
    .prepare(`${baseSql} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  return { rows, total, page, pageSize }
}
