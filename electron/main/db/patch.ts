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
  profession: ['شخص', 'مدير شركة', 'رئيس مجلس إدارة', 'عضو منتدب', 'محام', 'موظف'],
  doc_category: ['بطاقة', 'كارنيه', 'توكيل', 'جواز سفر', 'عقد', 'شهادة ميلاد', 'أخرى'],
  police_station: ['قسم أول شبرا الخيمة', 'قسم ثان شبرا الخيمة', 'قسم ثان بنها'],
  link_type: ['original', 'appeal', 'cassation', 'execution'],
  poa_office: ['توثيق بنها', 'توثيق شبرا الخيمة', 'توثيق قليوب'],
  task_status: ['not_done', 'new', 'in_progress', 'completed', 'overdue', 'cancelled'],
  payment_type: ['fees', 'advance', 'installment', 'consultation', 'service', 'reimbursed'],
  due_type: ['أتعاب إضافية', 'مصروف', 'رسوم محكمة', 'أخرى'],
  execution_kind: ['مدني', 'جنائي'],
  police_report_kind: ['حصر', 'جدول', 'جنحة', 'محضر'],
  case_status: [
    'new',
    'under_review',
    'filed',
    'in_trial',
    'postponed',
    'for_judgment',
    'judged',
    'appeal',
    'cassation',
    'execution',
    'closed',
    'archived'
  ],
  hearing_status: ['upcoming', 'done', 'postponed', 'cancelled', 'judged', 'client_absent', 'lawyer_absent'],
  poa_status: ['active', 'expired', 'revoked'],
  contract_status: ['active', 'expired', 'cancelled'],
  staff_status: ['active', 'inactive']
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
  addColumn(db, 'documents', 'lawyer_id', 'TEXT')
  addColumn(db, 'documents', 'employee_id', 'TEXT')
  addColumn(db, 'lawyers', 'whatsapp', 'TEXT')
  addColumn(db, 'lawyers', 'phone_home', 'TEXT')
  addColumn(db, 'lawyers', 'phone_other', 'TEXT')
  addColumn(db, 'lawyers', 'address', 'TEXT')
  addColumn(db, 'lawyers', 'salary', 'REAL')
  addColumn(db, 'lawyers', 'rating', 'INTEGER')
  addColumn(db, 'lawyers', 'bar_degree', 'TEXT')
  addColumn(db, 'lawyers', 'duties', 'TEXT')
  addColumn(db, 'employees', 'whatsapp', 'TEXT')
  addColumn(db, 'employees', 'phone_home', 'TEXT')
  addColumn(db, 'employees', 'phone_other', 'TEXT')
  addColumn(db, 'employees', 'address', 'TEXT')
  addColumn(db, 'cases', 'police_station', 'TEXT')
  addColumn(db, 'hearings', 'expert_name', 'TEXT')
  addColumn(db, 'hearings', 'expert_office', 'TEXT')
  addColumn(db, 'tasks', 'hearing_id', 'TEXT')
  addColumn(db, 'tasks', 'execution_kind', 'TEXT')
  addColumn(db, 'tasks', 'police_report_no', 'TEXT')
  addColumn(db, 'tasks', 'police_station', 'TEXT')
  addColumn(db, 'tasks', 'police_report_kind', 'TEXT')
  addColumn(db, 'tasks', 'execution_number', 'TEXT')
  addColumn(db, 'tasks', 'execution_officer', 'TEXT')
  addColumn(db, 'tasks', 'judgment_date', 'TEXT')
  addColumn(db, 'tasks', 'judgment_text', 'TEXT')
  addColumn(db, 'tasks', 'notes', 'TEXT')
  addColumn(db, 'tasks', 'opponent_address', 'TEXT')
  addColumn(db, 'tasks', 'opponent_phone', 'TEXT')
  addColumn(db, 'cases', 'judgment_date', 'TEXT')
  addColumn(db, 'cases', 'judgment_text', 'TEXT')
  addColumn(db, 'lawyers', 'national_id', 'TEXT')
  addColumn(db, 'employees', 'national_id', 'TEXT')
  addColumn(db, 'power_of_attorney', 'poa_year', 'TEXT')
  addColumn(db, 'power_of_attorney', 'poa_letter', 'TEXT')
  addColumn(db, 'power_of_attorney', 'poa_office', 'TEXT')
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_dues (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      amount REAL NOT NULL,
      due_type TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `)
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      page_size TEXT NOT NULL DEFAULT 'A4',
      layout_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `)
  addColumn(db, 'lookup_values', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
  seedLookups(db)
  backfillLookupSort(db)
  migrateExpertHearings(db)
  for (const stmt of PERFORMANCE_INDEXES.split(';').map((s) => s.trim()).filter(Boolean)) {
    try {
      db.exec(stmt)
    } catch (err) {
      console.warn('index skipped', stmt.slice(0, 80), err)
    }
  }
}

function migrateExpertHearings(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expert_hearings (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      hearing_date TEXT NOT NULL,
      hearing_time TEXT,
      expert_office TEXT,
      expert_name TEXT,
      floor TEXT,
      hall TEXT,
      previous_action TEXT,
      current_action TEXT,
      notes TEXT,
      lawyer_id TEXT REFERENCES lawyers(id),
      status TEXT NOT NULL DEFAULT 'upcoming',
      source_hearing_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_expert_hearings_date ON expert_hearings(hearing_date);
    CREATE INDEX IF NOT EXISTS idx_expert_hearings_case ON expert_hearings(case_id);
  `)
  addColumn(db, 'expert_hearings', 'source_hearing_id', 'TEXT')
  const flag = db.prepare(`SELECT value FROM settings WHERE key = 'expert_hearings_migrated'`).get() as
    | { value: string }
    | undefined
  if (flag?.value === '1') return
  const rows = db
    .prepare(
      `SELECT * FROM hearings
       WHERE deleted_at IS NULL AND (hearing_type LIKE '%خبير%' OR hearing_type LIKE '%expert%')`
    )
    .all() as Record<string, unknown>[]
  const ts = nowIso()
  try {
    const copied = new Set(
      (
        db.prepare(`SELECT source_hearing_id FROM expert_hearings WHERE source_hearing_id IS NOT NULL`).all() as {
          source_hearing_id: string
        }[]
      ).map((r) => r.source_hearing_id)
    )
    const insert = db.prepare(
      `INSERT INTO expert_hearings (
          id, case_id, hearing_date, hearing_time, expert_office, expert_name, floor, hall,
          previous_action, current_action, notes, lawyer_id, status, source_hearing_id, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    db.transaction(() => {
      for (const r of rows) {
        const hid = String(r.id)
        if (copied.has(hid)) continue
        insert.run(
          newId(),
          r.case_id,
          r.hearing_date,
          r.hearing_time ?? null,
          r.expert_office ?? null,
          r.expert_name ?? null,
          r.floor ?? null,
          r.hall ?? null,
          r.previous_decision ?? null,
          r.court_decision ?? r.what_happened ?? r.next_actions ?? null,
          r.notes ?? null,
          r.lawyer_id ?? null,
          r.status ?? 'upcoming',
          hid,
          r.created_at ?? ts,
          ts
        )
      }
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('expert_hearings_migrated', '1', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(ts)
    })()
  } catch (err) {
    const n = rows.length
    throw new Error(
      `تعذر نسخ جلسات الخبراء (${n}). أوقفنا الترحيل دون حذف الصفوف الأصلية. ${err instanceof Error ? err.message : ''}`
    )
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

function backfillLookupSort(db: Db): void {
  if (!tableCols(db, 'lookup_values').has('sort_order')) return
  const kinds = db.prepare(`SELECT DISTINCT kind FROM lookup_values`).all() as { kind: string }[]
  const list = db.prepare(
    `SELECT id FROM lookup_values WHERE kind = ? AND deleted_at IS NULL ORDER BY IFNULL(sort_order, 0), value COLLATE NOCASE`
  )
  const zeros = db.prepare(
    `SELECT COUNT(*) as c FROM lookup_values WHERE kind = ? AND deleted_at IS NULL AND IFNULL(sort_order, 0) = 0`
  )
  const totalStmt = db.prepare(`SELECT COUNT(*) as c FROM lookup_values WHERE kind = ? AND deleted_at IS NULL`)
  const upd = db.prepare(`UPDATE lookup_values SET sort_order = ? WHERE id = ?`)
  for (const { kind } of kinds) {
    const total = (totalStmt.get(kind) as { c: number }).c
    const z = (zeros.get(kind) as { c: number }).c
    if (!total || z !== total) continue
    const rows = list.all(kind) as { id: string }[]
    rows.forEach((r, i) => upd.run(i, r.id))
  }
}

function seedLookups(db: Db): void {
  const ts = nowIso()
  const exists = db.prepare('SELECT 1 FROM lookup_values WHERE kind = ? AND value = ? AND deleted_at IS NULL')
  const maxOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) as m FROM lookup_values WHERE kind = ?`)
  const insert = db.prepare(
    'INSERT INTO lookup_values (id, kind, value, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const [kind, values] of Object.entries(LOOKUP_SEEDS)) {
    for (const value of values) {
      if (exists.get(kind, value)) continue
      insert.run(newId(), kind, value, Number((maxOrder.get(kind) as { m: number }).m) + 1, ts, ts)
    }
  }
}
