import type Database from 'better-sqlite3'
import { PERMISSIONS, ROLE_PERMISSIONS } from '@shared/permissions'
import { nowIso } from '../utils/time'
import { newId } from './ids'
import { PERFORMANCE_INDEXES } from './indexes'

type Db = Database.Database

function tableCols(db: Db, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
}

function addColumn(db: Db, table: string, column: string, ddl: string) {
  try {
    if (!tableCols(db, table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  } catch (err) {
    console.warn('add column skipped', table, column, err)
  }
}

const LOOKUP_SEEDS: Record<string, string[]> = {
  hearing_type: ['جلسة موضوع', 'مرافعة', 'حكم', 'تجديد حبس', 'استئناف', 'نقض', 'أول جلسة', 'جلسة خبير'],
  case_subject: [
    'شيكات',
    'نصب',
    'تعويضات',
    'إيجارات',
    'أحوال شخصية',
    'جنحة مباني',
    'ضرب',
    'خيانة أمانة',
    'جنحة نظم',
    'سب وقذف عن طريق الهاتف',
    'عدم تسليم حصة ميراثية'
  ],
  extra_ref_type: ['تسوية', 'فض منازعات', 'شهر عقاري', 'سجل خبراء', 'أخرى'],
  admin_action: [
    'تصوير قضية',
    'رفع',
    'قيد',
    'اطلاع',
    'سحب مستندات',
    'إعلان',
    'كتابة مذكرة',
    'استلام قرار',
    'تصوير حكم',
    'استخراج صورة رسمية من الحكم',
    'تقديم مذكرة',
    'سحب شهادة'
  ],
  execution_action: ['إعلان بالحكم', 'صيغة تنفيذية', 'تنفيذ حكم', 'إنذار على يد محضر', 'حجز'],
  venue: ['شبرا الخيمة', '6 أكتوبر', 'منيا القمح'],
  capacity: ['مدعي', 'مدعى عليه', 'متهم', 'مجني عليه', 'مستأنف', 'مستأنف ضده', 'طاعن', 'مطعون ضده'],
  profession: ['شخص', 'مدير شركة', 'رئيس مجلس إدارة', 'عضو منتدب', 'محام', 'موظف']
}

export function patchSchema(db: Db): void {
  addColumn(db, 'clients', 'nickname', 'TEXT')
  addColumn(db, 'opponents', 'nickname', 'TEXT')
  addColumn(db, 'hearings', 'previous_decision', 'TEXT')
  addColumn(db, 'hearings', 'hall', 'TEXT')
  addColumn(db, 'hearings', 'floor', 'TEXT')
  addColumn(db, 'hearings', 'venue', 'TEXT')
  addColumn(db, 'cases', 'first_instance_number', 'TEXT')
  addColumn(db, 'cases', 'first_instance_year', 'TEXT')
  addColumn(db, 'cases', 'appeal_number', 'TEXT')
  addColumn(db, 'cases', 'appeal_year', 'TEXT')
  addColumn(db, 'cases', 'cassation_number', 'TEXT')
  addColumn(db, 'cases', 'cassation_year', 'TEXT')
  addColumn(db, 'cases', 'extra_ref_type', 'TEXT')
  addColumn(db, 'cases', 'extra_ref_number', 'TEXT')
  addColumn(db, 'cases', 'office_case_number', 'TEXT')
  addColumn(db, 'cases', 'case_year', 'TEXT')
  addColumn(db, 'cases', 'session_place', 'TEXT')
  addColumn(db, 'cases', 'previous_circuit', 'TEXT')
  addColumn(db, 'cases', 'extra_ref2_type', 'TEXT')
  addColumn(db, 'cases', 'extra_ref2_number', 'TEXT')
  addColumn(db, 'cases', 'extra_ref3_type', 'TEXT')
  addColumn(db, 'cases', 'extra_ref3_number', 'TEXT')
  addColumn(db, 'cases', 'opponent_capacity_first', 'TEXT')
  addColumn(db, 'cases', 'opponent_capacity_appeal', 'TEXT')
  addColumn(db, 'cases', 'opponent_capacity_cassation', 'TEXT')
  addColumn(db, 'case_opponents', 'capacity_first', 'TEXT')
  addColumn(db, 'case_opponents', 'capacity_appeal', 'TEXT')
  addColumn(db, 'case_opponents', 'capacity_cassation', 'TEXT')
  addColumn(db, 'case_opponents', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
  ensureCaseSequenceFrom(db, 7000)
  db.exec(`UPDATE cases SET case_year = substr(created_at, 1, 4) WHERE case_year IS NULL OR trim(case_year) = ''`)
  extractCourtNumbers(db)
  try {
    mergeDuplicateClientsByNationalId(db)
  } catch (err) {
    console.error('mergeDuplicateClientsByNationalId', err)
  }
  addColumn(db, 'tasks', 'venue', 'TEXT')
  addColumn(db, 'tasks', 'case_subject', 'TEXT')
  addColumn(db, 'tasks', 'work_kind', "TEXT NOT NULL DEFAULT 'admin'")
  addColumn(db, 'lawyers', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'opponents', 'lawyer_phone', 'TEXT')
  addColumn(db, 'clients', 'id_kind', "TEXT NOT NULL DEFAULT 'national_id'")
  addColumn(db, 'clients', 'passport_country', 'TEXT')
  addColumn(db, 'clients', 'phone_home', 'TEXT')
  addColumn(db, 'clients', 'phone_work', 'TEXT')
  addColumn(db, 'clients', 'address2', 'TEXT')
  for (const col of ['poa_number', 'poa_year', 'poa_letter', 'poa_office', 'blacklist_note'] as const) {
    addColumn(db, 'clients', col, 'TEXT')
    addColumn(db, 'opponents', col, 'TEXT')
  }
  addColumn(db, 'clients', 'rating', 'INTEGER')
  addColumn(db, 'opponents', 'rating', 'INTEGER')
  addColumn(db, 'clients', 'is_blacklisted', 'INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'opponents', 'is_blacklisted', 'INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'opponents', 'id_kind', "TEXT NOT NULL DEFAULT 'national_id'")
  addColumn(db, 'opponents', 'passport_country', 'TEXT')
  addColumn(db, 'opponents', 'phone2', 'TEXT')
  addColumn(db, 'opponents', 'whatsapp', 'TEXT')
  addColumn(db, 'opponents', 'phone_home', 'TEXT')
  addColumn(db, 'opponents', 'phone_work', 'TEXT')
  addColumn(db, 'opponents', 'email', 'TEXT')
  addColumn(db, 'opponents', 'address2', 'TEXT')
  addColumn(db, 'documents', 'opponent_id', 'TEXT')
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_pages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page_no INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `)
  seedLookups(db)
  for (const stmt of PERFORMANCE_INDEXES.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      db.exec(stmt)
    } catch (err) {
      console.warn('index skipped', stmt.slice(0, 80), err)
    }
  }
}

export function ensurePermissions(db: Db): void {
  const ts = nowIso()
  const existing = new Set(
    (db.prepare('SELECT code FROM permissions').all() as { code: string }[]).map((r) => r.code)
  )
  const insertPerm = db.prepare(
    'INSERT INTO permissions (id, code, name_ar, name_en, module, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const permIds: Record<string, string> = {}
  for (const row of db.prepare('SELECT id, code FROM permissions WHERE deleted_at IS NULL').all() as { id: string; code: string }[]) {
    permIds[row.code] = row.id
  }
  for (const p of PERMISSIONS) {
    if (existing.has(p.code)) continue
    const id = newId()
    permIds[p.code] = id
    insertPerm.run(id, p.code, p.nameAr, p.nameEn, p.module, ts, ts)
  }
  const hasRp = db.prepare(
    `SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ? AND deleted_at IS NULL`
  )
  const insertRp = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  const roles = db.prepare(`SELECT id, code FROM roles WHERE deleted_at IS NULL`).all() as { id: string; code: string }[]
  for (const role of roles) {
    const codes = ROLE_PERMISSIONS[role.code] || []
    for (const code of codes) {
      const pid = permIds[code]
      if (!pid || hasRp.get(role.id, pid)) continue
      insertRp.run(newId(), role.id, pid, ts, ts)
    }
  }
}

function ensureCaseSequenceFrom(db: Db, minCurrent: number): void {
  const row = db.prepare(`SELECT current_value, padding FROM number_sequences WHERE name = 'case'`).get() as
    | { current_value: number; padding: number }
    | undefined
  if (!row) return
  const nextVal = Math.max(Number(row.current_value) || 0, minCurrent)
  const pad = Math.max(Number(row.padding) || 0, 4)
  db.prepare(`UPDATE number_sequences SET current_value = ?, padding = ? WHERE name = 'case'`).run(nextVal, pad)
}

function extractCourtNumbers(db: Db): void {
  const rows = db
    .prepare(
      `SELECT id, case_number, office_case_number, case_year FROM cases WHERE deleted_at IS NULL`
    )
    .all() as { id: string; case_number: string; office_case_number: string | null; case_year: string | null }[]
  const upd = db.prepare(`UPDATE cases SET office_case_number = ?, case_year = ?, updated_at = ? WHERE id = ?`)
  const ts = nowIso()
  for (const r of rows) {
    if (String(r.office_case_number ?? '').trim()) continue
    const cn = String(r.case_number ?? '')
    if (cn.startsWith('CS-')) continue
    const m = cn.match(/^(.+)\/(\d{2,4})$/)
    if (!m) continue
    upd.run(m[1].trim(), m[2], ts, r.id)
  }
}

function digitsNid(value: unknown) {
  const s = String(value ?? '').replace(/\D/g, '')
  return s.length === 14 ? s : ''
}

const CLIENT_ID_TABLES = [
  'cases',
  'case_clients',
  'client_contacts',
  'documents',
  'payments',
  'expenses',
  'invoices',
  'receipts',
  'appointments',
  'tasks',
  'reminders',
  'contracts',
  'power_of_attorney',
  'consultations',
  'correspondence'
] as const

function mergeDuplicateClientsByNationalId(db: Db): void {
  const clients = db
    .prepare(
      `SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY created_at ASC, client_number ASC`
    )
    .all() as Record<string, unknown>[]
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const c of clients) {
    const nid = digitsNid(c.national_id)
    if (!nid) continue
    const list = groups.get(nid) ?? []
    list.push(c)
    groups.set(nid, list)
  }
  const ts = nowIso()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const keep = list[0]
    const keepId = String(keep.id)
    const fillable = [
      'phone',
      'phone2',
      'whatsapp',
      'email',
      'address',
      'governorate',
      'district',
      'profession',
      'notes',
      'birth_date'
    ]
    for (const dup of list.slice(1)) {
      const dupId = String(dup.id)
      for (const key of fillable) {
        if (!String(keep[key] ?? '').trim() && String(dup[key] ?? '').trim()) {
          db.prepare(`UPDATE clients SET ${key} = ?, updated_at = ? WHERE id = ?`).run(dup[key], ts, keepId)
          keep[key] = dup[key]
        }
      }
      if (tableCols(db, 'case_clients').has('client_id')) {
        const links = db
          .prepare(`SELECT id, case_id FROM case_clients WHERE client_id = ? AND deleted_at IS NULL`)
          .all(dupId) as { id: string; case_id: string }[]
        for (const link of links) {
          const other = db
            .prepare(
              `SELECT id FROM case_clients WHERE case_id = ? AND client_id = ? AND deleted_at IS NULL`
            )
            .get(link.case_id, keepId) as { id: string } | undefined
          if (other) {
            db.prepare(`UPDATE case_clients SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, link.id)
          } else {
            db.prepare(`UPDATE case_clients SET client_id = ?, updated_at = ? WHERE id = ?`).run(keepId, ts, link.id)
          }
        }
      }
      for (const table of CLIENT_ID_TABLES) {
        if (table === 'case_clients') continue
        if (!tableCols(db, table).has('client_id')) continue
        db.prepare(`UPDATE ${table} SET client_id = ?, updated_at = ? WHERE client_id = ?`).run(keepId, ts, dupId)
      }
      db.prepare(`UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, dupId)
    }
  }
}

function seedLookups(db: Db): void {
  const ts = nowIso()
  const exists = db.prepare('SELECT 1 FROM lookup_values WHERE kind = ? AND value = ? AND deleted_at IS NULL')
  const insert = db.prepare(
    'INSERT INTO lookup_values (id, kind, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [kind, values] of Object.entries(LOOKUP_SEEDS)) {
    for (const value of values) {
      if (exists.get(kind, value)) continue
      insert.run(newId(), kind, value, ts, ts)
    }
  }
}
