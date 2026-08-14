import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import {
  attendanceSchema,
  contactSchema,
  employeeSchema,
  lawyerSchema,
  leaveSchema,
  opponentSchema,
  parseSchema
} from '@shared/schemas'

function paged(table: string, searchCols: string[], query: ListQuery, extraWhere = '') {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE 1=1 ${extraWhere}`
  if (query.search && searchCols.length) {
    where += ` AND (${searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`
    const s = `%${query.search}%`
    searchCols.forEach(() => params.push(s))
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM ${table} ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(`SELECT * FROM ${table} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function listLawyers(q: ListQuery = {}) {
  return paged('lawyers', ['full_name', 'bar_number', 'specialization', 'phone'], q)
}

export function getLawyer(id: number) {
  const db = getDb()
  const lawyer = db.prepare('SELECT * FROM lawyers WHERE id = ?').get(id)
  if (!lawyer) throw new Error('المحامي غير موجود')
  const cases = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.primary_lawyer_id = ? OR c.assistant_lawyer_id = ? ORDER BY c.id DESC`
    )
    .all(id, id)
  const open = (cases as { status: string }[]).filter((c) => !['closed', 'archived'].includes(c.status))
  const closed = (cases as { status: string }[]).filter((c) => c.status === 'closed')
  const hearings = db
    .prepare(
      `SELECT h.*, cs.case_number, cs.title as case_title FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.lawyer_id = ? ORDER BY h.hearing_date DESC`
    )
    .all(id)
  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN lawyers l ON l.user_id = t.assignee_id WHERE l.id = ? ORDER BY t.due_date`
    )
    .all(id)
  return { lawyer, cases, openCount: open.length, closedCount: closed.length, hearings, tasks }
}

export function createLawyer(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(lawyerSchema, data) as Record<string, unknown>
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم المحامي مطلوب')
  const info = getDb()
    .prepare(
      `INSERT INTO lawyers (user_id, full_name, photo_path, bar_number, specialization, phone, email, hire_date, status, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.user_id || null,
      data.full_name,
      data.photo_path ?? null,
      data.bar_number ?? null,
      data.specialization ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.hire_date ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  audit(actor, 'create', 'lawyers', id, `تمت إضافة المحامي ${data.full_name}`)
  return { id }
}

export function updateLawyer(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  data = parseSchema(lawyerSchema, data) as Record<string, unknown>
  getDb()
    .prepare(
      `UPDATE lawyers SET user_id=?, full_name=?, photo_path=?, bar_number=?, specialization=?, phone=?, email=?, hire_date=?, status=?, notes=? WHERE id=?`
    )
    .run(
      data.user_id || null,
      data.full_name,
      data.photo_path ?? null,
      data.bar_number ?? null,
      data.specialization ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.hire_date ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      id
    )
  audit(actor, 'update', 'lawyers', id, `تم تعديل بيانات المحامي ${data.full_name}`)
  return { id }
}

export function removeLawyer(actor: AuthedUser, id: number) {
  const used = getDb().prepare('SELECT COUNT(*) as c FROM cases WHERE primary_lawyer_id = ? OR assistant_lawyer_id = ?').get(id, id) as { c: number }
  if (used.c > 0) throw new Error('لا يمكن حذف محامٍ مرتبط بقضايا')
  getDb().prepare('DELETE FROM lawyers WHERE id = ?').run(id)
  audit(actor, 'delete', 'lawyers', id, `تم حذف محامٍ رقم ${id}`)
}

export function listEmployees(q: ListQuery = {}) {
  return paged('employees', ['full_name', 'job_title', 'phone'], q)
}

export function getEmployee(id: number) {
  const db = getDb()
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id)
  if (!employee) throw new Error('الموظف غير موجود')
  const attendance = db.prepare('SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 60').all(id)
  const leaves = db.prepare('SELECT * FROM leaves WHERE employee_id = ? ORDER BY start_date DESC').all(id)
  const emp = employee as { user_id: number | null }
  const tasks = emp.user_id
    ? db.prepare('SELECT * FROM tasks WHERE assignee_id = ? ORDER BY due_date').all(emp.user_id)
    : []
  return { employee, attendance, leaves, tasks }
}

export function createEmployee(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(employeeSchema, data) as Record<string, unknown>
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم الموظف مطلوب')
  const info = getDb()
    .prepare(
      `INSERT INTO employees (user_id, full_name, job_title, department, salary, hire_date, phone, email, status, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.user_id || null,
      data.full_name,
      data.job_title ?? null,
      data.department ?? null,
      data.salary ?? null,
      data.hire_date ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  audit(actor, 'create', 'employees', id, `تمت إضافة الموظف ${data.full_name}`)
  return { id }
}

export function updateEmployee(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  data = parseSchema(employeeSchema, data) as Record<string, unknown>
  getDb()
    .prepare(
      `UPDATE employees SET user_id=?, full_name=?, job_title=?, department=?, salary=?, hire_date=?, phone=?, email=?, status=?, notes=? WHERE id=?`
    )
    .run(
      data.user_id || null,
      data.full_name,
      data.job_title ?? null,
      data.department ?? null,
      data.salary ?? null,
      data.hire_date ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      id
    )
  audit(actor, 'update', 'employees', id, `تم تعديل الموظف ${data.full_name}`)
  return { id }
}

export function removeEmployee(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM employees WHERE id = ?').run(id)
  audit(actor, 'delete', 'employees', id, `تم حذف موظف رقم ${id}`)
}

export function addAttendance(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(attendanceSchema, data) as Record<string, unknown>
  const info = getDb()
    .prepare(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes) VALUES (?,?,?,?,?,?)`
    )
    .run(data.employee_id, data.date, data.check_in ?? null, data.check_out ?? null, data.status ?? 'present', data.notes ?? null)
  audit(actor, 'create', 'attendance', Number(info.lastInsertRowid), 'تم تسجيل حضور')
  return { id: Number(info.lastInsertRowid) }
}

export function addLeave(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(leaveSchema, data) as Record<string, unknown>
  const info = getDb()
    .prepare(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, status, notes) VALUES (?,?,?,?,?,?)`
    )
    .run(data.employee_id, data.leave_type, data.start_date, data.end_date, data.status ?? 'pending', data.notes ?? null)
  return { id: Number(info.lastInsertRowid) }
}

export function listOpponents(q: ListQuery = {}) {
  return paged('opponents', ['full_name', 'national_id', 'phone', 'lawyer_name'], q)
}

export function getOpponent(id: number) {
  const db = getDb()
  const opponent = db.prepare('SELECT * FROM opponents WHERE id = ?').get(id)
  if (!opponent) throw new Error('الخصم غير موجود')
  const cases = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name FROM cases c
       JOIN case_opponents co ON co.case_id = c.id
       JOIN clients cl ON cl.id = c.client_id
       WHERE co.opponent_id = ?`
    )
    .all(id)
  return { opponent, cases }
}

export function createOpponent(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(opponentSchema, data) as Record<string, unknown>
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم الخصم مطلوب')
  const info = getDb()
    .prepare(
      `INSERT INTO opponents (full_name, national_id, phone, address, lawyer_name, extra_data, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      data.full_name,
      data.national_id ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.lawyer_name ?? null,
      data.extra_data ?? null,
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  if (data.case_id) {
    getDb().prepare('INSERT OR IGNORE INTO case_opponents (case_id, opponent_id) VALUES (?,?)').run(data.case_id, id)
  }
  audit(actor, 'create', 'opponents', id, `تمت إضافة الخصم ${data.full_name}`)
  return { id }
}

export function updateOpponent(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE opponents SET full_name=?, national_id=?, phone=?, address=?, lawyer_name=?, extra_data=?, notes=? WHERE id=?`
    )
    .run(
      data.full_name,
      data.national_id ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.lawyer_name ?? null,
      data.extra_data ?? null,
      data.notes ?? null,
      id
    )
  audit(actor, 'update', 'opponents', id, `تم تعديل الخصم ${data.full_name}`)
  return { id }
}

export function removeOpponent(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM opponents WHERE id = ?').run(id)
  audit(actor, 'delete', 'opponents', id, `تم حذف خصم رقم ${id}`)
}

export function linkOpponentToCase(actor: AuthedUser, opponentId: number, caseId: number) {
  if (!opponentId || !caseId) throw new Error('الخصم والقضية مطلوبان')
  getDb().prepare('INSERT OR IGNORE INTO case_opponents (case_id, opponent_id) VALUES (?,?)').run(caseId, opponentId)
  audit(actor, 'update', 'opponents', opponentId, `تم ربط الخصم بالقضية ${caseId}`)
  return { ok: true }
}

export function addClientContact(
  actor: AuthedUser,
  clientId: number,
  data: { name: string; position?: string; phone?: string; email?: string }
) {
  const parsed = parseSchema(contactSchema, data)
  if (!parsed.name) throw new Error('اسم الموظف مطلوب')
  const info = getDb()
    .prepare('INSERT INTO client_contacts (client_id, name, position, phone, email) VALUES (?,?,?,?,?)')
    .run(clientId, parsed.name, parsed.position ?? null, parsed.phone ?? null, parsed.email ?? null)
  audit(actor, 'create', 'clients', clientId, `تمت إضافة جهة اتصال ${parsed.name}`)
  return { id: Number(info.lastInsertRowid) }
}

export function removeClientContact(id: number) {
  getDb().prepare('DELETE FROM client_contacts WHERE id = ?').run(id)
}
