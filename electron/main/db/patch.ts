import type Database from 'better-sqlite3'
import { PERMISSIONS, ROLE_PERMISSIONS } from '@shared/permissions'
import { nowIso } from '../utils/time'
import { newId } from './ids'

type Db = Database.Database

function tableCols(db: Db, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
}

function addColumn(db: Db, table: string, column: string, ddl: string) {
  if (!tableCols(db, table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}

const LOOKUP_SEEDS: Record<string, string[]> = {
  hearing_type: ['جلسة موضوع', 'مرافعة', 'حكم', 'تجديد حبس', 'استئناف', 'نقض', 'أول جلسة'],
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
  admin_action: ['تصوير قضية', 'رفع', 'قيد', 'اطلاع', 'سحب مستندات', 'إعلان'],
  venue: ['شبرا الخيمة', '6 أكتوبر', 'منيا القمح'],
  capacity: ['مدعي', 'مدعى عليه', 'متهم', 'مجني عليه', 'مستأنف', 'مستأنف ضده', 'طاعن', 'مطعون ضده']
}

export function patchSchema(db: Db): void {
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
  db.exec(`UPDATE cases SET case_year = substr(created_at, 1, 4) WHERE case_year IS NULL OR trim(case_year) = ''`)
  addColumn(db, 'tasks', 'venue', 'TEXT')
  addColumn(db, 'tasks', 'case_subject', 'TEXT')
  addColumn(db, 'opponents', 'lawyer_phone', 'TEXT')
  ensurePermissions(db)
  seedLookups(db)
}

function ensurePermissions(db: Db): void {
  const ts = nowIso()
  const existing = new Set(
    (db.prepare('SELECT code FROM permissions WHERE deleted_at IS NULL').all() as { code: string }[]).map((r) => r.code)
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
    'INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
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
