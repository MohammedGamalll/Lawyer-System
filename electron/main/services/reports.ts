import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { getTempDir } from '../paths'
import path from 'path'
import fs from 'fs'
import { notDeleted } from '../db/ids'
import { softDelete } from '../sync/queue'

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

export function runReport(q: ReportQuery) {
  const db = getDb()
  const params: unknown[] = []
  switch (q.type) {
    case 'clients':
      return db
        .prepare(
          `SELECT * FROM clients WHERE ${notDeleted()} ${dateWhere('date(created_at)', q.from, q.to, params).sql} ORDER BY created_at DESC`
        )
        .all(...params)
    case 'cases':
      return db
        .prepare(
          `SELECT c.*, cl.full_name as client_name, ct.name_ar as case_type_name, l.full_name as lawyer_name
           FROM cases c JOIN clients cl ON cl.id = c.client_id
           LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
           LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
           WHERE ${notDeleted('c')} AND ${notDeleted('cl')} ${dateWhere('date(c.created_at)', q.from, q.to, params).sql}
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
        .prepare(`SELECT * FROM cases WHERE status NOT IN ('closed','archived') AND is_archived=0 AND ${notDeleted()}`)
        .all()
    case 'closed_cases':
      return db.prepare(`SELECT * FROM cases WHERE status='closed' AND ${notDeleted()}`).all()
    case 'delayed_cases':
      return db.prepare(`SELECT * FROM cases WHERE status IN ('postponed','execution') AND ${notDeleted()}`).all()
    case 'hearings': {
      const d = dateWhere('hearing_date', q.from, q.to, params)
      return db
        .prepare(
          `SELECT h.*, cs.case_number, cs.title as case_title FROM hearings h JOIN cases cs ON cs.id = h.case_id
           WHERE ${notDeleted('h')} AND ${notDeleted('cs')} ${d.sql}`
        )
        .all(...d.params)
    }
    case 'poa':
      return db.prepare(`SELECT * FROM power_of_attorney WHERE ${notDeleted()} ORDER BY created_at DESC`).all()
    case 'contracts':
      return db.prepare(`SELECT * FROM contracts WHERE ${notDeleted()} ORDER BY created_at DESC`).all()
    case 'tasks':
      return db.prepare(`SELECT * FROM tasks WHERE ${notDeleted()} ORDER BY due_date`).all()
    case 'income': {
      const d = dateWhere('payment_date', q.from, q.to, params)
      return db.prepare(`SELECT * FROM payments WHERE ${notDeleted()} ${d.sql}`).all(...d.params)
    }
    case 'expenses': {
      const d = dateWhere('expense_date', q.from, q.to, params)
      return db.prepare(`SELECT * FROM expenses WHERE ${notDeleted()} ${d.sql}`).all(...d.params)
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
          `SELECT cf.*, c.case_number, c.title, cl.full_name as client_name
           FROM case_fees cf JOIN cases c ON c.id = cf.case_id JOIN clients cl ON cl.id = c.client_id
           WHERE cf.remaining > 0 AND ${notDeleted('cf')} AND ${notDeleted('c')} AND ${notDeleted('cl')}`
        )
        .all()
    case 'payments':
      return db.prepare(`SELECT * FROM payments WHERE ${notDeleted()} ORDER BY created_at DESC`).all()
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

export async function exportReport(q: ReportQuery, format: 'xlsx' | 'csv') {
  const rows = runReport(q) as Record<string, unknown>[]
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Report')
  if (!rows.length) {
    ws.addRow(['لا توجد بيانات'])
  } else {
    const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object')
    ws.addRow(keys)
    for (const r of rows) ws.addRow(keys.map((k) => r[k] as ExcelJS.CellValue))
  }
  const file = path.join(getTempDir(), `report-${q.type}-${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`)
  if (format === 'csv') await wb.csv.writeFile(file)
  else await wb.xlsx.writeFile(file)
  return { file, bytes: fs.readFileSync(file) }
}

export function globalSearch(term: string) {
  const db = getDb()
  const s = `%${term}%`
  return {
    clients: db
      .prepare(
        `SELECT id, client_number, full_name, phone FROM clients WHERE ${notDeleted()} AND (full_name LIKE ? OR client_number LIKE ? OR phone LIKE ? OR national_id LIKE ?) LIMIT 10`
      )
      .all(s, s, s, s),
    cases: db
      .prepare(
        `SELECT id, case_number, title, status FROM cases WHERE ${notDeleted()} AND (title LIKE ? OR case_number LIKE ? OR opponent_name LIKE ?) LIMIT 10`
      )
      .all(s, s, s),
    hearings: db
      .prepare(
        `SELECT h.id, h.hearing_date, cs.case_number, cs.title FROM hearings h JOIN cases cs ON cs.id = h.case_id WHERE ${notDeleted('h')} AND ${notDeleted('cs')} AND (cs.title LIKE ? OR cs.case_number LIKE ?) LIMIT 10`
      )
      .all(s, s),
    documents: db
      .prepare(`SELECT id, title, file_name FROM documents WHERE ${notDeleted()} AND (title LIKE ? OR file_name LIKE ?) LIMIT 10`)
      .all(s, s),
    contracts: db
      .prepare(
        `SELECT id, contract_number, title FROM contracts WHERE ${notDeleted()} AND (title LIKE ? OR contract_number LIKE ?) LIMIT 10`
      )
      .all(s, s),
    poa: db.prepare(`SELECT id, poa_number, poa_type FROM power_of_attorney WHERE ${notDeleted()} AND poa_number LIKE ? LIMIT 10`).all(s),
    payments: db.prepare(`SELECT id, payment_number, amount FROM payments WHERE ${notDeleted()} AND payment_number LIKE ? LIMIT 10`).all(s),
    tasks: db.prepare(`SELECT id, title, status FROM tasks WHERE ${notDeleted()} AND title LIKE ? LIMIT 10`).all(s)
  }
}

export function advancedSearch(filters: {
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
             WHERE ${notDeleted('c')} AND ${notDeleted('cl')}`
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
