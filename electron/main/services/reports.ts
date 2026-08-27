import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'
import { softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import { hasAnyPermission } from '../ipc/session'
import { maskClientContactFields } from './clients'

export type ReportQuery = {
  type: string
  from?: string
  to?: string
  lawyer_id?: string
  case_type_id?: string
  format?: 'json' | 'xlsx' | 'csv'
}

function dateWhere(col: string, from?: string, to?: string, params: unknown[] = []) {
  let sql = ''
  if (from) {
    sql += ` AND ${col} >= ?`
    params.push(from)
  }
  if (to) {
    sql += ` AND ${col} <= ?`
    params.push(to)
  }
  return { sql, params }
}

const CASES_SELECT = `SELECT c.case_number, c.case_year, c.internal_file_number, c.title,
  cl.full_name as client_name,
  l.full_name as primary_lawyer_name,
  al.full_name as assistant_lawyer_name,
  COALESCE(ct.name_ar, c.category) as case_type_name,
  c.court, c.status, c.received_date, c.filing_date
 FROM cases c
 JOIN clients cl ON cl.id = c.client_id AND ${notDeleted('cl')}
 LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
 LEFT JOIN lawyers al ON al.id = c.assistant_lawyer_id AND ${notDeleted('al')}
 LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}`

function cellValue(v: unknown): ExcelJS.CellValue {
  if (v == null) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'string') return v
  if (typeof v === 'bigint') return Number(v)
  return String(v)
}

export function runReport(q: ReportQuery) {
  const db = getDb()
  const params: unknown[] = []
  switch (q.type) {
    case 'clients':
      return db
        .prepare(
          `SELECT client_number, full_name, trade_name, phone, governorate, district, client_type, profession, created_at
           FROM clients WHERE ${notDeleted()} ${dateWhere('date(created_at)', q.from, q.to, params).sql} ORDER BY created_at DESC`
        )
        .all(...params)
    case 'cases':
      return db
        .prepare(
          `${CASES_SELECT}
           WHERE ${notDeleted('c')} ${dateWhere('date(c.created_at)', q.from, q.to, params).sql}
           ${q.lawyer_id ? ' AND c.primary_lawyer_id = ?' : ''}
           ${q.case_type_id ? ' AND c.case_type_id = ?' : ''}
           ORDER BY c.created_at DESC`
        )
        .all(...params, ...(q.lawyer_id ? [q.lawyer_id] : []), ...(q.case_type_id ? [q.case_type_id] : []))
    case 'cases_by_type':
      return db
        .prepare(
          `SELECT COALESCE(ct.name_ar,'غير محدد') as name, COUNT(*) as count FROM cases c
           LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
           WHERE ${notDeleted('c')} GROUP BY ct.id`
        )
        .all()
    case 'cases_by_court':
      return db
        .prepare(`SELECT COALESCE(court,'غير محدد') as name, COUNT(*) as count FROM cases WHERE ${notDeleted()} GROUP BY court`)
        .all()
    case 'cases_by_lawyer':
      return db
        .prepare(
          `SELECT COALESCE(l.full_name,'غير محدد') as name, COUNT(*) as count FROM cases c
           LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
           WHERE ${notDeleted('c')} GROUP BY l.id`
        )
        .all()
    case 'open_cases':
      return db
        .prepare(
          `${CASES_SELECT} WHERE ${notDeleted('c')} AND c.status NOT IN ('closed','archived') AND c.is_archived=0 ORDER BY c.created_at DESC`
        )
        .all()
    case 'closed_cases':
      return db.prepare(`${CASES_SELECT} WHERE ${notDeleted('c')} AND c.status='closed' ORDER BY c.created_at DESC`).all()
    case 'delayed_cases':
      return db
        .prepare(
          `${CASES_SELECT} WHERE ${notDeleted('c')} AND c.status IN ('postponed','execution') ORDER BY c.created_at DESC`
        )
        .all()
    case 'hearings': {
      const d = dateWhere('hearing_date', q.from, q.to, params)
      return db
        .prepare(
          `SELECT h.hearing_date, cs.case_number, cl.full_name as client_name, h.hearing_type, h.venue, h.previous_decision,
                  h.hall, h.floor, cs.court, h.status, h.result
           FROM hearings h JOIN cases cs ON cs.id = h.case_id JOIN clients cl ON cl.id = cs.client_id
           WHERE ${notDeleted('h')} AND ${notDeleted('cs')} AND ${notDeleted('cl')} ${d.sql}
           ORDER BY h.hearing_date DESC`
        )
        .all(...d.params)
    }
    case 'poa':
      return db
        .prepare(
          `SELECT p.poa_number, p.poa_type, cl.full_name as client_name, l.full_name as primary_lawyer_name,
                  p.issuing_authority, p.issue_date, p.expiry_date, p.status
           FROM power_of_attorney p
           LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
           LEFT JOIN lawyers l ON l.id = p.lawyer_id AND ${notDeleted('l')}
           WHERE ${notDeleted('p')} ORDER BY p.created_at DESC`
        )
        .all()
    case 'contracts':
      return db
        .prepare(
          `SELECT ct.contract_number, ct.title, cl.full_name as client_name, ct.contract_type, ct.start_date, ct.end_date, ct.value, ct.status
           FROM contracts ct
           LEFT JOIN clients cl ON cl.id = ct.client_id AND ${notDeleted('cl')}
           WHERE ${notDeleted('ct')} ORDER BY ct.created_at DESC`
        )
        .all()
    case 'tasks':
      return db
        .prepare(
          `SELECT t.title, cs.case_number, cl.full_name as client_name, u.full_name as assignee_name,
                  t.due_date, t.priority, t.status, t.progress
           FROM tasks t
           LEFT JOIN cases cs ON cs.id = t.case_id AND ${notDeleted('cs')}
           LEFT JOIN clients cl ON cl.id = t.client_id AND ${notDeleted('cl')}
           LEFT JOIN users u ON u.id = t.assignee_id AND ${notDeleted('u')}
           WHERE ${notDeleted('t')} ORDER BY t.due_date`
        )
        .all()
    case 'income': {
      const d = dateWhere('payment_date', q.from, q.to, params)
      return db
        .prepare(
          `SELECT p.payment_number, cl.full_name as client_name, cs.case_number, p.amount, p.payment_type, p.payment_method, p.payment_date
           FROM payments p
           LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
           LEFT JOIN cases cs ON cs.id = p.case_id AND ${notDeleted('cs')}
           WHERE ${notDeleted('p')} ${d.sql} ORDER BY p.payment_date DESC`
        )
        .all(...d.params)
    }
    case 'expenses': {
      const d = dateWhere('expense_date', q.from, q.to, params)
      return db
        .prepare(
          `SELECT e.expense_number, e.description, e.amount, e.expense_date
           FROM expenses e WHERE ${notDeleted('e')} ${d.sql} ORDER BY e.expense_date DESC`
        )
        .all(...d.params)
    }
    case 'profit': {
      const income = (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount),0) as c FROM payments WHERE ${notDeleted()} ${dateWhere('payment_date', q.from, q.to).sql}`
          )
          .get(...(q.from ? [q.from] : []), ...(q.to ? [q.to] : [])) as { c: number }
      ).c
      const p2: unknown[] = []
      const e = dateWhere('expense_date', q.from, q.to, p2)
      const expenses = (
        db.prepare(`SELECT COALESCE(SUM(amount),0) as c FROM expenses WHERE ${notDeleted()} ${e.sql}`).get(...e.params) as {
          c: number
        }
      ).c
      return [{ income, expenses, profit: income - expenses }]
    }
    case 'due':
      return db
        .prepare(
          `SELECT c.case_number, c.title, cl.full_name as client_name, cf.total_fees, cf.paid, cf.remaining, cf.due_date
           FROM case_fees cf JOIN cases c ON c.id = cf.case_id JOIN clients cl ON cl.id = c.client_id
           WHERE cf.remaining > 0 AND ${notDeleted('cf')} AND ${notDeleted('c')} AND ${notDeleted('cl')}`
        )
        .all()
    case 'payments':
      return db
        .prepare(
          `SELECT p.payment_number, cl.full_name as client_name, cs.case_number, p.amount, p.payment_type, p.payment_method, p.payment_date
           FROM payments p
           LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
           LEFT JOIN cases cs ON cs.id = p.case_id AND ${notDeleted('cs')}
           WHERE ${notDeleted('p')} ORDER BY p.created_at DESC`
        )
        .all()
    case 'lawyer_performance':
      return db
        .prepare(
          `SELECT l.full_name as name, COUNT(c.id) as total,
                  SUM(CASE WHEN c.status='closed' THEN 1 ELSE 0 END) as closed
           FROM lawyers l LEFT JOIN cases c ON c.primary_lawyer_id = l.id AND ${notDeleted('c')}
           WHERE ${notDeleted('l')} GROUP BY l.id`
        )
        .all()
    default:
      throw new Error('نوع التقرير غير معروف')
  }
}

const REPORT_LABELS: Record<string, string> = {
  client_number: 'رقم الموكل',
  full_name: 'الاسم',
  trade_name: 'الصفة',
  phone: 'الهاتف',
  governorate: 'المحافظة',
  district: 'المنطقة',
  client_type: 'النوع',
  profession: 'المهنة',
  created_at: 'تاريخ الإنشاء',
  case_number: 'رقم القضية',
  case_year: 'السنة',
  internal_file_number: 'رقم الملف الداخلي',
  title: 'الاسم',
  client_name: 'الموكل',
  primary_lawyer_name: 'المحامي المسؤول',
  assistant_lawyer_name: 'المحامي المساعد',
  case_type_name: 'نوع القضية',
  court: 'المحكمة',
  status: 'الحالة',
  received_date: 'تاريخ الاستلام',
  filing_date: 'تاريخ رفع الدعوى',
  name: 'الاسم',
  count: 'العدد',
  hearing_date: 'تاريخ الجلسة',
  hearing_type: 'نوع الجلسة',
  venue: 'المكان',
  previous_decision: 'القرار السابق',
  hall: 'القاعة',
  floor: 'الدور',
  result: 'النتيجة',
  poa_number: 'رقم التوكيل',
  poa_type: 'نوع التوكيل',
  issuing_authority: 'جهة الإصدار',
  issue_date: 'تاريخ الإصدار',
  expiry_date: 'تاريخ الانتهاء',
  contract_number: 'رقم العقد',
  contract_type: 'نوع العقد',
  start_date: 'من',
  end_date: 'إلى',
  value: 'القيمة',
  assignee_name: 'المسؤول',
  due_date: 'تاريخ الاستحقاق',
  priority: 'الأولوية',
  progress: 'التقدم',
  payment_number: 'رقم الدفعة',
  amount: 'المبلغ',
  payment_type: 'نوع الدفعة',
  payment_method: 'طريقة الدفع',
  payment_date: 'تاريخ الدفع',
  expense_number: 'رقم المصروف',
  description: 'البيان',
  expense_date: 'التاريخ',
  income: 'الإيرادات',
  expenses: 'المصروفات',
  profit: 'الصافي',
  total: 'الإجمالي',
  total_fees: 'الاتفاق',
  paid: 'المدفوع',
  remaining: 'المتبقي',
  closed: 'مغلقة'
}

export async function exportReport(q: ReportQuery, format: 'xlsx' | 'csv'): Promise<Buffer> {
  const rows = (runReport(q) as Record<string, unknown>[]) || []
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Law Office'
  const ws = wb.addWorksheet('التقرير', { views: [{ rightToLeft: true, state: 'normal' }] })
  if (!rows.length) {
    ws.columns = [{ header: 'لا توجد بيانات', key: 'empty', width: 40 }]
  } else {
    const keys = Object.keys(rows[0])
    ws.columns = keys.map((k) => ({
      header: REPORT_LABELS[k] || k,
      key: k,
      width: Math.min(36, Math.max(14, (REPORT_LABELS[k] || k).length + 6))
    }))
    for (const r of rows) {
      const line: Record<string, ExcelJS.CellValue> = {}
      for (const k of keys) line[k] = cellValue(r[k])
      ws.addRow(line)
    }
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF122F4D' } }
  }
  if (format === 'csv') {
    const raw = Buffer.from(await wb.csv.writeBuffer())
    return Buffer.concat([Buffer.from('\uFEFF', 'utf8'), raw])
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function globalSearch(term: string, actor?: AuthedUser | null) {
  const db = getDb()
  const s = `%${term}%`
  const out: Record<string, unknown> = {}
  if (!actor) return out
  if (hasAnyPermission(actor, 'clients.view')) {
    out.clients = maskClientContactFields(
      db
        .prepare(
          `SELECT id, client_number, full_name, phone FROM clients WHERE ${notDeleted()} AND (full_name LIKE ? OR client_number LIKE ? OR phone LIKE ? OR national_id LIKE ?) LIMIT 10`
        )
        .all(s, s, s, s),
      actor
    )
  }
  if (hasAnyPermission(actor, 'cases.view')) {
    out.cases = db
      .prepare(
        `SELECT id, case_number, title, status FROM cases WHERE ${notDeleted()} AND (title LIKE ? OR case_number LIKE ? OR opponent_name LIKE ? OR category LIKE ? OR internal_file_number LIKE ?) LIMIT 10`
      )
      .all(s, s, s, s, s)
  }
  if (hasAnyPermission(actor, 'hearings.view')) {
    out.hearings = db
      .prepare(
        `SELECT h.id, h.hearing_date, cs.case_number, cs.title FROM hearings h JOIN cases cs ON cs.id = h.case_id WHERE ${notDeleted('h')} AND ${notDeleted('cs')} AND (cs.title LIKE ? OR cs.case_number LIKE ?) LIMIT 10`
      )
      .all(s, s)
  }
  if (hasAnyPermission(actor, 'documents.view')) {
    out.documents = db
      .prepare(`SELECT id, title, file_name FROM documents WHERE ${notDeleted()} AND (title LIKE ? OR file_name LIKE ?) LIMIT 10`)
      .all(s, s)
  }
  if (hasAnyPermission(actor, 'contracts.view')) {
    out.contracts = db
      .prepare(
        `SELECT id, contract_number, title FROM contracts WHERE ${notDeleted()} AND (title LIKE ? OR contract_number LIKE ?) LIMIT 10`
      )
      .all(s, s)
  }
  if (hasAnyPermission(actor, 'poa.view')) {
    out.poa = db.prepare(`SELECT id, poa_number, poa_type FROM power_of_attorney WHERE ${notDeleted()} AND poa_number LIKE ? LIMIT 10`).all(s)
  }
  if (hasAnyPermission(actor, ['accounts.view', 'accounts.payment'])) {
    out.payments = db.prepare(`SELECT id, payment_number, amount FROM payments WHERE ${notDeleted()} AND payment_number LIKE ? LIMIT 10`).all(s)
  }
  if (hasAnyPermission(actor, 'tasks.view')) {
    out.tasks = db.prepare(`SELECT id, title, status FROM tasks WHERE ${notDeleted()} AND title LIKE ? LIMIT 10`).all(s)
  }
  return out
}

export function advancedSearch(filters: {
  q?: string
  case_type_name?: string
  case_type_id?: string
  status?: string
  lawyer_id?: string
  hearing_from?: string
  hearing_to?: string
}) {
  const db = getDb()
  const params: unknown[] = []
  let sql = `SELECT DISTINCT c.*, cl.full_name as client_name, ct.name_ar as case_type_name, l.full_name as lawyer_name
             FROM cases c
             JOIN clients cl ON cl.id = c.client_id
             LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
             LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
             LEFT JOIN hearings h ON h.case_id = c.id AND ${notDeleted('h')}
             LEFT JOIN case_clients cc ON cc.case_id = c.id AND ${notDeleted('cc')}
             LEFT JOIN clients cl2 ON cl2.id = cc.client_id AND ${notDeleted('cl2')}
             WHERE ${notDeleted('c')} AND ${notDeleted('cl')}`
  if (filters.q) {
    sql += ` AND (c.title LIKE ? OR c.case_number LIKE ? OR c.category LIKE ? OR c.internal_file_number LIKE ? OR cl.full_name LIKE ? OR cl2.full_name LIKE ? OR ct.name_ar LIKE ?)`
    const s = `%${filters.q}%`
    params.push(s, s, s, s, s, s, s)
  }
  if (filters.case_type_id) {
    sql += ' AND c.case_type_id = ?'
    params.push(filters.case_type_id)
  } else if (filters.case_type_name) {
    sql += ' AND ct.name_ar LIKE ?'
    params.push(`%${filters.case_type_name}%`)
  }
  if (filters.status) {
    sql += ' AND c.status = ?'
    params.push(filters.status)
  }
  if (filters.lawyer_id) {
    sql += ' AND c.primary_lawyer_id = ?'
    params.push(filters.lawyer_id)
  }
  if (filters.hearing_from) {
    sql += ' AND h.hearing_date >= ?'
    params.push(filters.hearing_from)
  }
  if (filters.hearing_to) {
    sql += ' AND h.hearing_date <= ?'
    params.push(filters.hearing_to)
  }
  return db.prepare(sql).all(...params)
}

export function searchLegacyArchive(term: string) {
  const db = getDb()
  const s = `%${term.trim()}%`
  if (!term.trim()) {
    return { cases: [], indexes: [], rows: [] }
  }
  const cases = db
    .prepare(
      `SELECT id, case_number, title, status, is_archived FROM cases
       WHERE ${notDeleted()} AND (is_archived = 1 OR notes LIKE '%أرشيف%' OR title LIKE ?)
         AND (title LIKE ? OR case_number LIKE ? OR opponent_name LIKE ? OR notes LIKE ?)
       LIMIT 50`
    )
    .all(s, s, s, s, s)
  let indexes: unknown[] = []
  let rows: unknown[] = []
  try {
    indexes = db
      .prepare(
        `SELECT id, number, year, entity, classification, subject FROM legal_indexes
         WHERE ${notDeleted()} AND (number LIKE ? OR subject LIKE ? OR entity LIKE ? OR classification LIKE ? OR codes LIKE ?)
         LIMIT 50`
      )
      .all(s, s, s, s, s)
  } catch {
    indexes = []
  }
  try {
    rows = db
      .prepare(
        `SELECT id, source_file, source_row, entity_hint, mapped_table, mapped_id, link_status
         FROM legacy_import_rows WHERE payload_json LIKE ? OR entity_hint LIKE ? LIMIT 50`
      )
      .all(s, s)
  } catch {
    rows = []
  }
  return { cases, indexes, rows }
}

export function listAudit(q: { page?: number; pageSize?: number; search?: string }) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 50
  const params: unknown[] = []
  let where = `WHERE ${notDeleted()}`
  if (q.search) {
    where += ' AND (username LIKE ? OR description LIKE ? OR action LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function deleteAudit(ids: string[]) {
  for (const id of ids) softDelete('audit_logs', id)
}
