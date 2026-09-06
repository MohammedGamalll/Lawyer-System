import type BetterSqlite3 from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL, CASE_TYPE_SEEDS, EXPENSE_CATEGORY_SEEDS } from './schema'
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@shared/permissions'
import { getDbPath } from '../paths'
import { nowIso } from '../utils/time'
import { assertNetworkDriverConfigured, getDriverName } from './adapter'
import { newId } from './ids'
import { migrateToUuidIfNeeded } from './migrateToUuid'
import { patchSchema, ensurePermissions } from './patch'
import { dropFtsTriggers, ensureFts } from './fts'
import { checkpointWal, integrityOk, stripSqliteSidecars } from './repair'
import log from 'electron-log'

let db: BetterSqlite3.Database | null = null
let booting = false

function openSqlite(dbPath: string): BetterSqlite3.Database {
  // Keep this require out of static analysis so the packaged CJS bundle does not
  // load the native addon before Win10 crash/GPU handlers run.
  const req = eval('require') as NodeRequire
  const Database = req('better-sqlite3') as typeof BetterSqlite3
  return new Database(dbPath)
}

export function getDb(): BetterSqlite3.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function configureSqlite(database: BetterSqlite3.Database): void {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = FULL')
  database.pragma('busy_timeout = 15000')
  database.pragma('foreign_keys = ON')
  try {
    database.pragma('cell_size_check = ON')
  } catch {
    /* older sqlite */
  }
}

function openOrThrow(dbPath: string): BetterSqlite3.Database {
  try {
    return openSqlite(dbPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `تعذر فتح قاعدة البيانات (${msg}). ثبّت Microsoft Visual C++ Redistributable 2015-2022 (x64) ثم أعد تشغيل الجهاز.`
    )
  }
}

function applySchema(database: BetterSqlite3.Database, dbPath: string): void {
  try {
    migrateToUuidIfNeeded(database, dbPath)
  } catch (err) {
    log.error(err)
    database.close()
    db = null
    throw err
  }
  database.pragma('foreign_keys = ON')
  database.exec(SCHEMA_SQL)
  dropFtsTriggers(database)
  try {
    patchSchema(database)
  } catch (err) {
    log.warn('schema patch skipped', err)
  }
  try {
    seedIfEmpty(database)
  } catch (err) {
    log.warn('seed skipped', err)
  }
  try {
    ensurePermissions(database)
  } catch (err) {
    log.warn('permissions seed skipped', err)
  }
  try {
    ensureFts(database)
  } catch (err) {
    log.warn('fts init failed, rebuilding', err)
    try {
      ensureFts(database, { forceRebuild: true })
    } catch (err2) {
      log.warn('fts rebuild skipped', err2)
    }
  }
  try {
    dedupeSyncQueue(database)
  } catch (err) {
    log.warn('sync queue index skipped', err)
  }
  try {
    ensureSetting(database, 'ui_font_size', '16')
    ensureSetting(database, 'supabase_url', '')
    ensureSetting(database, 'supabase_anon_key', '')
  } catch (err) {
    log.warn('default settings skipped', err)
  }
}

export function initDatabase(dbPath = getDbPath(), attempt = 0): BetterSqlite3.Database {
  const driver = getDriverName()
  assertNetworkDriverConfigured(driver)
  if (driver !== 'sqlite') {
    throw new Error(`تشغيل ${driver} يتطلب مهايئ الشبكة. استخدم LAW_DB_DRIVER=sqlite محلياً.`)
  }
  const prevBooting = booting
  booting = true
  try {
    db = openOrThrow(dbPath)
    configureSqlite(db)
    applySchema(db, dbPath)
    if (!integrityOk(db) && attempt === 0) {
      log.warn('sqlite integrity check failed; rebuilding search indexes')
      try {
        ensureFts(db, { forceRebuild: true })
      } catch (err) {
        log.warn('fts force rebuild failed', err)
      }
    }
    if (!integrityOk(db) && attempt === 0) {
      log.warn('sqlite still corrupt; retrying after clearing WAL files')
      checkpointWal(db)
      closeDatabase()
      stripSqliteSidecars(dbPath)
      return initDatabase(dbPath, 1)
    }
    return db
  } finally {
    booting = prevBooting
  }
}

export function repairCorruptDatabase(): void {
  if (booting) return
  const dbPath = getDbPath()
  log.warn('repairing sqlite database', dbPath)
  if (db) {
    try {
      dropFtsTriggers(db)
      ensureFts(db, { forceRebuild: true })
      if (integrityOk(db)) return
    } catch (err) {
      log.warn('in-place sqlite repair failed', err)
    }
    checkpointWal(db)
    closeDatabase()
  }
  stripSqliteSidecars(dbPath)
  initDatabase(dbPath)
}

function dedupeSyncQueue(database: BetterSqlite3.Database): void {
  database.exec(`
    DELETE FROM local_sync_queue
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM local_sync_queue GROUP BY table_name, record_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_record ON local_sync_queue(table_name, record_id);
  `)
}

function ensureSetting(database: BetterSqlite3.Database, key: string, value: string) {
  const row = database.prepare('SELECT key FROM settings WHERE key = ?').get(key) as { key: string } | undefined
  if (!row) database.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, nowIso())
}

export function closeDatabase(): void {
  if (!db) return
  checkpointWal(db)
  try {
    db.close()
  } catch (err) {
    log.warn('close database', err)
  }
  db = null
}

function seedIfEmpty(database: BetterSqlite3.Database): void {
  const ts = nowIso()
  const count = (sql: string) => (database.prepare(sql).get() as { c: number }).c

  const insertRole = database.prepare(
    'INSERT OR IGNORE INTO roles (id, code, name_ar, name_en, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  )
  const roleIds: Record<string, string> = {}
  for (const role of ROLES) {
    const existing = database.prepare('SELECT id FROM roles WHERE code = ?').get(role.code) as { id: string } | undefined
    if (existing) {
      roleIds[role.code] = existing.id
      continue
    }
    const id = newId()
    roleIds[role.code] = id
    insertRole.run(id, role.code, role.nameAr, role.nameEn, ts, ts)
  }

  const insertPerm = database.prepare(
    'INSERT OR IGNORE INTO permissions (id, code, name_ar, name_en, module, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const permIds: Record<string, string> = {}
  for (const p of PERMISSIONS) {
    const existing = database.prepare('SELECT id FROM permissions WHERE code = ?').get(p.code) as { id: string } | undefined
    if (existing) {
      permIds[p.code] = existing.id
      continue
    }
    const id = newId()
    permIds[p.code] = id
    insertPerm.run(id, p.code, p.nameAr, p.nameEn, p.module, ts, ts)
  }

  const insertRp = database.prepare(
    'INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [code, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds[code]
    for (const permCode of perms) {
      const permId = permIds[permCode]
      if (roleId && permId) insertRp.run(newId(), roleId, permId, ts, ts)
    }
  }

  if (count('SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL') === 0 && roleIds.admin) {
    database
      .prepare(
        `INSERT INTO users (id, username, password_hash, full_name, email, role_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(newId(), 'admin', bcrypt.hashSync('Admin@123', 10), 'مدير النظام', 'admin@lawoffice.local', roleIds.admin, ts, ts)
  }

  if (count('SELECT COUNT(*) as c FROM case_types WHERE deleted_at IS NULL') === 0) {
    const insertType = database.prepare(
      'INSERT INTO case_types (id, name_ar, name_en, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
    )
    CASE_TYPE_SEEDS.forEach((name, i) => insertType.run(newId(), name, name, i, ts, ts))
  }

  if (count('SELECT COUNT(*) as c FROM expense_categories WHERE deleted_at IS NULL') === 0) {
    const insertExp = database.prepare(
      'INSERT INTO expense_categories (id, name_ar, name_en, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    )
    EXPENSE_CATEGORY_SEEDS.forEach((name) => insertExp.run(newId(), name, name, ts, ts))
  }

  if (count('SELECT COUNT(*) as c FROM cashboxes WHERE deleted_at IS NULL') === 0) {
    const insertCb = database.prepare(
      'INSERT INTO cashboxes (id, name, type, current_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)'
    )
    insertCb.run(newId(), 'خزينة المكتب', 'office', ts, ts)
    insertCb.run(newId(), 'البنك', 'bank', ts, ts)
    insertCb.run(newId(), 'محفظة إلكترونية', 'wallet', ts, ts)
  }

  const seq = database.prepare(
    'INSERT OR IGNORE INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?, ?, 0, ?, ?)'
  )
  seq.run('client', 'CL-', 4, ts)
  seq.run('case', 'CS-', 5, ts)
  seq.run('invoice', 'INV-', 5, ts)
  seq.run('receipt', 'RCP-', 5, ts)
  seq.run('voucher', 'VCH-', 5, ts)
  seq.run('payment', 'PAY-', 5, ts)
  seq.run('expense', 'EXP-', 5, ts)
  seq.run('poa', 'POA-', 4, ts)
  seq.run('contract', 'CNT-', 4, ts)
  seq.run('correspondence', 'COR-', 4, ts)

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
    notify_hearings: 'true',
    ui_font_size: '16',
    supabase_url: '',
    supabase_anon_key: ''
  }
  const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v, ts)
}

export function nextNumber(database: BetterSqlite3.Database, name: string): string {
  const row = database.prepare('SELECT * FROM number_sequences WHERE name = ?').get(name) as {
    prefix: string
    current_value: number
    padding: number
  }
  if (!row) throw new Error(`Unknown sequence: ${name}`)
  const next = row.current_value + 1
  database.prepare('UPDATE number_sequences SET current_value = ?, updated_at = ? WHERE name = ?').run(next, nowIso(), name)
  return `${row.prefix}${String(next).padStart(row.padding, '0')}`
}

export function listQuery(
  database: BetterSqlite3.Database,
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
