import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { ensureDir, getDataRoot } from '../paths'
import {
  attendanceSchema,
  contactSchema,
  employeeSchema,
  lawyerSchema,
  leaveSchema,
  opponentSchema,
  parseSchema,
  staffSchema
} from '@shared/schemas'

function photoDataUrl(filePath?: string | null) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const ext = path.extname(filePath).slice(1).toLowerCase() || 'png'
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'bmp'
              ? 'image/bmp'
              : `image/${ext}`
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function fileBuffer(file: { name: string; data: number[] | Uint8Array | Buffer }) {
  const d = file.data as number[] | Uint8Array | Buffer | { type?: string; data?: number[] }
  if (Buffer.isBuffer(d)) return d
  if (d && typeof d === 'object' && 'data' in d && Array.isArray((d as { data: number[] }).data)) {
    return Buffer.from((d as { data: number[] }).data)
  }
  return Buffer.from(d as number[] | Uint8Array)
}

function paged(table: string, searchCols: string[], query: ListQuery, extraWhere = '') {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted()} ${extraWhere}`
  if (query.search && searchCols.length) {
    where += ` AND (${searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`
    const s = `%${query.search}%`
    searchCols.forEach(() => params.push(s))
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM ${table} ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function listLawyers(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('l')}`
  if (q.search) {
    where += ' AND (l.full_name LIKE ? OR l.bar_number LIKE ? OR l.specialization LIKE ? OR l.phone LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM lawyers l ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT l.*, e.id as employee_id, u.username
       FROM lawyers l
       LEFT JOIN users u ON u.id = l.user_id AND ${notDeleted('u')}
       LEFT JOIN employees e ON e.user_id = l.user_id AND ${notDeleted('e')}
       ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getLawyer(id: string) {
  const db = getDb()
  const lawyer = db.prepare(`SELECT * FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(id)
  if (!lawyer) throw new Error('المحامي غير موجود')
  const rec = lawyer as Record<string, unknown>
  rec.photo_data = photoDataUrl(String(rec.photo_path || ''))
  const cases = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE (c.primary_lawyer_id = ? OR c.assistant_lawyer_id = ?) AND ${notDeleted('c')} AND ${notDeleted('cl')}
       ORDER BY c.created_at DESC`
    )
    .all(id, id)
  const open = (cases as { status: string }[]).filter((c) => !['closed', 'archived'].includes(c.status))
  const closed = (cases as { status: string }[]).filter((c) => c.status === 'closed')
  const hearings = db
    .prepare(
      `SELECT h.*, cs.case_number, cs.title as case_title FROM hearings h JOIN cases cs ON cs.id = h.case_id
       WHERE h.lawyer_id = ? AND ${notDeleted('h')} AND ${notDeleted('cs')} ORDER BY h.hearing_date DESC`
    )
    .all(id)
  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN lawyers l ON l.user_id = t.assignee_id WHERE l.id = ? AND ${notDeleted('t')} AND ${notDeleted('l')} ORDER BY t.due_date`
    )
    .all(id)
  const userId = asIdOrNull(rec.user_id)
  const account = userId
    ? db
        .prepare(
          `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, r.code as role_code, COALESCE(r.name_ar,'') as role_name
           FROM users u LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
           WHERE u.id = ? AND ${notDeleted('u')}`
        )
        .get(userId)
    : null
  const employee = userId
    ? db.prepare(`SELECT * FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(userId) ?? null
    : null
  return { lawyer, account, employee, cases, openCount: open.length, closedCount: closed.length, hearings, tasks }
}

export function createLawyer(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(lawyerSchema, data) as Record<string, unknown>
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم المحامي مطلوب')
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO lawyers (id, user_id, full_name, photo_path, bar_number, specialization, phone, email, hire_date, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      asIdOrNull(data.user_id),
      data.full_name,
      data.photo_path ?? null,
      data.bar_number ?? null,
      data.specialization ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.hire_date ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      ts,
      ts
    )
  recordLocalChange('lawyers', id, 'INSERT')
  audit(actor, 'create', 'lawyers', id, `تمت إضافة المحامي ${data.full_name}`)
  return { id }
}

export function setLawyerPhoto(actor: AuthedUser, id: string, file: { name: string; data: number[] | Uint8Array | Buffer }) {
  return setStaffPhoto(actor, { lawyerId: id }, file)
}

export function setStaffPhoto(
  actor: AuthedUser,
  ids: { employeeId?: string; lawyerId?: string },
  file: { name: string; data: number[] | Uint8Array | Buffer }
) {
  const db = getDb()
  const dir = path.join(getDataRoot(), 'photos')
  ensureDir(dir)
  const ext = path.extname(file.name) || '.png'
  const dest = path.join(dir, `staff-${Date.now()}${ext}`)
  fs.writeFileSync(dest, fileBuffer(file))
  let employeeId = asId(ids.employeeId)
  let lawyerId = asId(ids.lawyerId)
  if (lawyerId && !employeeId) {
    const lw = db.prepare(`SELECT user_id FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(lawyerId) as
      | { user_id: string | null }
      | undefined
    if (lw?.user_id) {
      const emp = db.prepare(`SELECT id FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(lw.user_id) as
        | { id: string }
        | undefined
      if (emp) employeeId = emp.id
    }
  }
  if (employeeId && !lawyerId) {
    const emp = db.prepare(`SELECT user_id FROM employees WHERE id = ? AND ${notDeleted()}`).get(employeeId) as
      | { user_id: string | null }
      | undefined
    if (emp?.user_id) {
      const lw = db.prepare(`SELECT id FROM lawyers WHERE user_id = ? AND ${notDeleted()}`).get(emp.user_id) as
        | { id: string }
        | undefined
      if (lw) lawyerId = lw.id
    }
  }
  if (employeeId) {
    db.prepare('UPDATE employees SET photo_path = ?, updated_at = ? WHERE id = ?').run(dest, nowIso(), employeeId)
    recordLocalChange('employees', employeeId, 'UPDATE')
  }
  if (lawyerId) {
    db.prepare('UPDATE lawyers SET photo_path = ?, updated_at = ? WHERE id = ?').run(dest, nowIso(), lawyerId)
    recordLocalChange('lawyers', lawyerId, 'UPDATE')
  }
  audit(actor, 'update', 'employees', employeeId || lawyerId, 'تم تحديث صورة الموظف')
  return { path: dest, photo_data: photoDataUrl(dest) }
}

export function updateLawyer(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(lawyerSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT user_id, photo_path FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { user_id: string | null; photo_path: string | null }
    | undefined
  if (!old) throw new Error('المحامي غير موجود')
  db.prepare(
    `UPDATE lawyers SET user_id=?, full_name=?, photo_path=?, bar_number=?, specialization=?, phone=?, email=?, hire_date=?, status=?, notes=?, updated_at=? WHERE id=?`
  ).run(
    asIdOrNull(data.user_id) || old.user_id,
    data.full_name,
    data.photo_path ?? old.photo_path,
    data.bar_number ?? null,
    data.specialization ?? null,
    data.phone ?? null,
    data.email ?? null,
    data.hire_date ?? null,
    data.status ?? 'active',
    data.notes ?? null,
    nowIso(),
    id
  )
  recordLocalChange('lawyers', id, 'UPDATE')
  audit(actor, 'update', 'lawyers', id, `تم تعديل بيانات المحامي ${data.full_name}`)
  return { id }
}

export function saveStaff(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(staffSchema, data) as Record<string, unknown>
  const db = getDb()
  const ts = nowIso()
  const fullName = String(data.full_name).trim()
  const run = db.transaction(() => {
    let lawyerId = asId(data.lawyer_id)
    let userId = asId(data.user_id)
    let employeeId = asId(data.employee_id)
    if (lawyerId) {
      const lw = db.prepare(`SELECT user_id FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(lawyerId) as
        | { user_id: string | null }
        | undefined
      if (!lw) throw new Error('المحامي غير موجود')
      if (!userId && lw.user_id) userId = asId(lw.user_id)
    }
    if (userId) {
      const emp = db.prepare(`SELECT id FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
        | { id: string }
        | undefined
      if (emp) employeeId = emp.id
    }

    const username = String(data.username || '').trim()
    const roleId = asId(data.role_id)
    if (!roleId) throw new Error('يجب اختيار نوع الموظف / الدور')
    if (userId) {
      const old = db.prepare(`SELECT username, password_hash FROM users WHERE id = ? AND ${notDeleted()}`).get(userId) as
        | { username: string; password_hash: string }
        | undefined
      if (!old) throw new Error('المستخدم غير موجود')
      const nextUser = username || old.username
      const taken = db
        .prepare(`SELECT id FROM users WHERE lower(trim(username)) = lower(?) AND id != ? AND ${notDeleted()}`)
        .get(nextUser, userId)
      if (taken) throw new Error('اسم المستخدم مستخدم بالفعل')
      const password = data.password ? String(data.password) : ''
      const hash = password.length >= 6 ? bcrypt.hashSync(password, 10) : old.password_hash
      db.prepare(
        `UPDATE users SET username=?, password_hash=?, full_name=?, email=?, phone=?, role_id=?, is_active=?, updated_at=? WHERE id=?`
      ).run(
        nextUser,
        hash,
        fullName,
        data.email ?? null,
        data.phone ?? null,
        roleId,
        Number(data.is_active) === 0 ? 0 : 1,
        ts,
        userId
      )
      recordLocalChange('users', userId, 'UPDATE')
    } else {
      if (!username) throw new Error('اسم المستخدم مطلوب')
      if (!data.password || String(data.password).length < 6) throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف')
      const taken = db.prepare(`SELECT id FROM users WHERE lower(trim(username)) = lower(?) AND ${notDeleted()}`).get(username)
      if (taken) throw new Error('اسم المستخدم مستخدم بالفعل')
      userId = newId()
      db.prepare(
        `INSERT INTO users (id, username, password_hash, full_name, email, phone, role_id, is_active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(
        userId,
        username,
        bcrypt.hashSync(String(data.password), 10),
        fullName,
        data.email ?? null,
        data.phone ?? null,
        roleId,
        Number(data.is_active) === 0 ? 0 : 1,
        ts,
        ts
      )
      recordLocalChange('users', userId, 'INSERT')
    }

    const roleRow = db.prepare(`SELECT code FROM roles WHERE id = ? AND ${notDeleted()}`).get(roleId) as
      | { code: string }
      | undefined
    const roleCode = roleRow?.code || ''
    const isLawyer = roleCode === 'lawyer'
    const jobTitle =
      String(data.job_title || '').trim() ||
      (roleCode === 'lawyer'
        ? 'محامٍ'
        : roleCode === 'accountant'
          ? 'محاسب'
          : roleCode === 'legal_assistant'
            ? 'مساعد محامٍ'
            : roleCode === 'secretary'
              ? 'موظف إداري'
              : roleCode === 'admin'
                ? 'مدير'
                : 'موظف')

    if (isLawyer) {
      if (lawyerId) {
        const old = db.prepare(`SELECT photo_path FROM lawyers WHERE id = ?`).get(lawyerId) as { photo_path: string | null }
        db.prepare(
          `UPDATE lawyers SET user_id=?, full_name=?, photo_path=?, bar_number=?, specialization=?, phone=?, email=?, hire_date=?, status=?, notes=?, updated_at=? WHERE id=?`
        ).run(
          userId,
          fullName,
          old.photo_path,
          data.bar_number ?? null,
          data.specialization ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.hire_date ?? null,
          data.status ?? 'active',
          data.notes ?? null,
          ts,
          lawyerId
        )
        recordLocalChange('lawyers', lawyerId, 'UPDATE')
      } else {
        const other = db.prepare(`SELECT id FROM lawyers WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
          | { id: string }
          | undefined
        if (other) {
          lawyerId = other.id
          db.prepare(
            `UPDATE lawyers SET full_name=?, bar_number=?, specialization=?, phone=?, email=?, hire_date=?, status=?, notes=?, updated_at=? WHERE id=?`
          ).run(
            fullName,
            data.bar_number ?? null,
            data.specialization ?? null,
            data.phone ?? null,
            data.email ?? null,
            data.hire_date ?? null,
            data.status ?? 'active',
            data.notes ?? null,
            ts,
            lawyerId
          )
          recordLocalChange('lawyers', lawyerId, 'UPDATE')
        } else {
          lawyerId = newId()
          db.prepare(
            `INSERT INTO lawyers (id, user_id, full_name, photo_path, bar_number, specialization, phone, email, hire_date, status, notes, created_at, updated_at)
               VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?)`
          ).run(
            lawyerId,
            userId,
            fullName,
            data.bar_number ?? null,
            data.specialization ?? null,
            data.phone ?? null,
            data.email ?? null,
            data.hire_date ?? null,
            data.status ?? 'active',
            data.notes ?? null,
            ts,
            ts
          )
          recordLocalChange('lawyers', lawyerId, 'INSERT')
        }
      }
    } else {
      const existingLawyer = db.prepare(`SELECT id FROM lawyers WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
        | { id: string }
        | undefined
      lawyerId = existingLawyer?.id || ''
    }

    if (employeeId) {
      db.prepare(
        `UPDATE employees SET user_id=?, full_name=?, job_title=?, department=?, salary=?, hire_date=?, phone=?, email=?, status=?, notes=?, license_no=?, qualification=?, updated_at=? WHERE id=?`
      ).run(
        userId,
        fullName,
        jobTitle,
        data.department ?? null,
        data.salary ?? null,
        data.hire_date ?? null,
        data.phone ?? null,
        data.email ?? null,
        data.status ?? 'active',
        data.notes ?? null,
        data.license_no ?? null,
        data.qualification ?? null,
        ts,
        employeeId
      )
      recordLocalChange('employees', employeeId, 'UPDATE')
    } else {
      const existing = db.prepare(`SELECT id FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
        | { id: string }
        | undefined
      if (existing) {
        employeeId = existing.id
        db.prepare(
          `UPDATE employees SET full_name=?, job_title=?, department=?, salary=?, hire_date=?, phone=?, email=?, status=?, notes=?, license_no=?, qualification=?, updated_at=? WHERE id=?`
        ).run(
          fullName,
          jobTitle,
          data.department ?? null,
          data.salary ?? null,
          data.hire_date ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.status ?? 'active',
          data.notes ?? null,
          data.license_no ?? null,
          data.qualification ?? null,
          ts,
          employeeId
        )
        recordLocalChange('employees', employeeId, 'UPDATE')
      } else {
        employeeId = newId()
        db.prepare(
          `INSERT INTO employees (id, user_id, full_name, job_title, department, salary, hire_date, phone, email, status, notes, license_no, qualification, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          employeeId,
          userId,
          fullName,
          jobTitle,
          data.department ?? null,
          data.salary ?? null,
          data.hire_date ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.status ?? 'active',
          data.notes ?? null,
          data.license_no ?? null,
          data.qualification ?? null,
          ts,
          ts
        )
        recordLocalChange('employees', employeeId, 'INSERT')
      }
    }

    return { lawyer_id: lawyerId || null, user_id: userId, employee_id: employeeId }
  })
  const ids = run()
  audit(actor, 'update', 'lawyers', ids.lawyer_id, `تم حفظ بيانات المحامي/الموظف/المستخدم ${fullName}`)
  return ids
}

export function removeLawyer(actor: AuthedUser, id: string) {
  const used = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM cases WHERE (primary_lawyer_id = ? OR assistant_lawyer_id = ?) AND ${notDeleted()}`
    )
    .get(id, id) as { c: number }
  if (used.c > 0) throw new Error('لا يمكن حذف محامٍ مرتبط بقضايا')
  softDelete('lawyers', id)
  audit(actor, 'delete', 'lawyers', id, `تم حذف محامٍ رقم ${id}`)
}

export function listPayrollEmployees() {
  return getDb()
    .prepare(
      `SELECT e.id, e.full_name, e.job_title, e.salary, e.status
       FROM employees e
       WHERE ${notDeleted('e')}
       ORDER BY e.full_name COLLATE NOCASE ASC, e.created_at ASC`
    )
    .all() as { id: string; full_name: string; job_title: string | null; salary: number | null; status: string }[]
}

export function listEmployees(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('e')}`
  if (q.search) {
    where += ' AND (e.full_name LIKE ? OR e.job_title LIKE ? OR e.phone LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM employees e ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT e.*, l.id as lawyer_id, u.username, u.role_id, r.code as role_code, COALESCE(r.name_ar,'') as role_name
       FROM employees e
       LEFT JOIN users u ON u.id = e.user_id AND ${notDeleted('u')}
       LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
       LEFT JOIN lawyers l ON l.user_id = e.user_id AND ${notDeleted('l')}
       ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getEmployee(id: string) {
  return getStaff({ employeeId: id })
}

export function getStaff(opts: { employeeId?: string; lawyerId?: string; userId?: string }) {
  const db = getDb()
  let employee = opts.employeeId
    ? (db.prepare(`SELECT * FROM employees WHERE id = ? AND ${notDeleted()}`).get(opts.employeeId) as
        | Record<string, unknown>
        | undefined)
    : undefined
  let lawyer = opts.lawyerId
    ? (db.prepare(`SELECT * FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(opts.lawyerId) as
        | Record<string, unknown>
        | undefined)
    : undefined
  let account = opts.userId
    ? (db
        .prepare(
          `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, r.code as role_code, COALESCE(r.name_ar,'') as role_name
           FROM users u LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
           WHERE u.id = ? AND ${notDeleted('u')}`
        )
        .get(opts.userId) as Record<string, unknown> | undefined)
    : undefined

  const userId = asId(employee?.user_id || lawyer?.user_id || account?.id)
  if (userId && !account) {
    account = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, r.code as role_code, COALESCE(r.name_ar,'') as role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
         WHERE u.id = ? AND ${notDeleted('u')}`
      )
      .get(userId) as Record<string, unknown> | undefined
  }
  if (userId && !employee) {
    employee = db.prepare(`SELECT * FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
      | Record<string, unknown>
      | undefined
  }
  if (userId && !lawyer) {
    lawyer = db.prepare(`SELECT * FROM lawyers WHERE user_id = ? AND ${notDeleted()}`).get(userId) as
      | Record<string, unknown>
      | undefined
  }
  if (!employee && !lawyer && !account) throw new Error('السجل غير موجود')

  const photo = photoDataUrl(String(employee?.photo_path || lawyer?.photo_path || ''))
  if (employee) employee.photo_data = photo
  if (lawyer) lawyer.photo_data = photo
  const employeeId = asId(employee?.id)
  const lawyerId = asId(lawyer?.id)
  if (employee) employee.lawyer_id = lawyerId || null
  const attendance = employeeId
    ? db.prepare(`SELECT * FROM attendance WHERE employee_id = ? AND ${notDeleted()} ORDER BY date DESC LIMIT 60`).all(employeeId)
    : []
  const leaves = employeeId
    ? db.prepare(`SELECT * FROM leaves WHERE employee_id = ? AND ${notDeleted()} ORDER BY start_date DESC`).all(employeeId)
    : []
  const tasks = userId
    ? db.prepare(`SELECT * FROM tasks WHERE assignee_id = ? AND ${notDeleted()} ORDER BY due_date`).all(userId)
    : []
  const cases = lawyerId
    ? db
        .prepare(
          `SELECT c.*, cl.full_name as client_name FROM cases c JOIN clients cl ON cl.id = c.client_id
           WHERE (c.primary_lawyer_id = ? OR c.assistant_lawyer_id = ?) AND ${notDeleted('c')} AND ${notDeleted('cl')}
           ORDER BY c.created_at DESC`
        )
        .all(lawyerId, lawyerId)
    : []
  const hearings = lawyerId
    ? db
        .prepare(
          `SELECT h.*, cs.case_number, cs.title as case_title FROM hearings h JOIN cases cs ON cs.id = h.case_id
           WHERE h.lawyer_id = ? AND ${notDeleted('h')} AND ${notDeleted('cs')} ORDER BY h.hearing_date DESC`
        )
        .all(lawyerId)
    : []
  const open = (cases as { status: string }[]).filter((c) => !['closed', 'archived'].includes(c.status))
  const closed = (cases as { status: string }[]).filter((c) => c.status === 'closed')
  return {
    employee: employee || null,
    lawyer: lawyer || null,
    account: account || null,
    attendance,
    leaves,
    tasks,
    cases,
    hearings,
    openCount: open.length,
    closedCount: closed.length
  }
}

export function createEmployee(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(employeeSchema, data) as Record<string, unknown>
  const db = getDb()
  const lawyerId = asId(data.lawyer_id)
  let userId = asIdOrNull(data.user_id)
  if (lawyerId) {
    const lw = db.prepare(`SELECT * FROM lawyers WHERE id = ? AND ${notDeleted()}`).get(lawyerId) as
      | {
          id: string
          user_id: string | null
          full_name: string
          phone?: string
          email?: string
          hire_date?: string
        }
      | undefined
    if (!lw) throw new Error('المحامي غير موجود')
    if (lw.user_id) {
      const dup = db.prepare(`SELECT id FROM employees WHERE user_id = ? AND ${notDeleted()}`).get(lw.user_id)
      if (dup) throw new Error('هذا المحامي مرتبط بموظف وحساب بالفعل')
      userId = lw.user_id
    } else {
      const role = db.prepare(`SELECT id FROM roles WHERE code = 'lawyer' AND ${notDeleted()}`).get() as
        | { id: string }
        | undefined
      if (!role) throw new Error('دور المحامي غير موجود')
      let username = `lawyer${lawyerId.slice(0, 8)}`
      let n = 1
      while (db.prepare(`SELECT id FROM users WHERE username = ? AND ${notDeleted()}`).get(username))
        username = `lawyer${lawyerId.slice(0, 8)}_${n++}`
      const ts = nowIso()
      userId = newId()
      db.prepare(
        `INSERT INTO users (id, username, password_hash, full_name, email, phone, role_id, is_active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,1,?,?)`
      ).run(userId, username, bcrypt.hashSync('Lawyer@123', 10), lw.full_name, lw.email ?? null, lw.phone ?? null, role.id, ts, ts)
      recordLocalChange('users', userId, 'INSERT')
      db.prepare('UPDATE lawyers SET user_id = ?, updated_at = ? WHERE id = ?').run(userId, ts, lawyerId)
      recordLocalChange('lawyers', lawyerId, 'UPDATE')
    }
    if (!data.full_name) data.full_name = lw.full_name
    if (!data.phone) data.phone = lw.phone
    if (!data.email) data.email = lw.email
    if (!data.hire_date) data.hire_date = lw.hire_date
    if (!data.job_title) data.job_title = 'محامٍ'
  }
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم الموظف مطلوب')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO employees (id, user_id, full_name, job_title, department, salary, hire_date, phone, email, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    userId,
    data.full_name,
    data.job_title ?? null,
    data.department ?? null,
    data.salary ?? null,
    data.hire_date ?? null,
    data.phone ?? null,
    data.email ?? null,
    data.status ?? 'active',
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('employees', id, 'INSERT')
  audit(actor, 'create', 'employees', id, `تمت إضافة الموظف ${data.full_name}`)
  return { id }
}

export function updateEmployee(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(employeeSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT * FROM employees WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { user_id: string | null; full_name: string }
    | undefined
  if (!old) throw new Error('الموظف غير موجود')
  db.prepare(
    `UPDATE employees SET user_id=?, full_name=?, job_title=?, department=?, salary=?, hire_date=?, phone=?, email=?, status=?, notes=?, updated_at=? WHERE id=?`
  ).run(
    asIdOrNull(data.user_id) || old.user_id,
    data.full_name || old.full_name,
    data.job_title ?? null,
    data.department ?? null,
    data.salary ?? null,
    data.hire_date ?? null,
    data.phone ?? null,
    data.email ?? null,
    data.status ?? 'active',
    data.notes ?? null,
    nowIso(),
    id
  )
  recordLocalChange('employees', id, 'UPDATE')
  audit(actor, 'update', 'employees', id, `تم تعديل الموظف ${data.full_name || old.full_name}`)
  return { id }
}

export function removeEmployee(actor: AuthedUser, id: string) {
  softDelete('employees', id)
  audit(actor, 'delete', 'employees', id, `تم حذف موظف رقم ${id}`)
}

export function addAttendance(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(attendanceSchema, data) as Record<string, unknown>
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      asId(data.employee_id),
      data.date,
      data.check_in ?? null,
      data.check_out ?? null,
      data.status ?? 'present',
      data.notes ?? null,
      ts,
      ts
    )
  recordLocalChange('attendance', id, 'INSERT')
  audit(actor, 'create', 'attendance', id, 'تم تسجيل حضور')
  return { id }
}

export function addLeave(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(leaveSchema, data) as Record<string, unknown>
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO leaves (id, employee_id, leave_type, start_date, end_date, status, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      asId(data.employee_id),
      data.leave_type,
      data.start_date,
      data.end_date,
      data.status ?? 'pending',
      data.notes ?? null,
      ts,
      ts
    )
  recordLocalChange('leaves', id, 'INSERT')
  return { id }
}

export function listOpponents(q: ListQuery = {}) {
  return paged('opponents', ['full_name', 'national_id', 'phone', 'lawyer_name'], q)
}

export function getOpponent(id: string) {
  const db = getDb()
  const opponent = db.prepare(`SELECT * FROM opponents WHERE id = ? AND ${notDeleted()}`).get(id)
  if (!opponent) throw new Error('الخصم غير موجود')
  const cases = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name FROM cases c
       JOIN case_opponents co ON co.case_id = c.id
       JOIN clients cl ON cl.id = c.client_id
       WHERE co.opponent_id = ? AND ${notDeleted('c')} AND ${notDeleted('co')} AND ${notDeleted('cl')}`
    )
    .all(id)
  return { opponent, cases }
}

export function createOpponent(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(opponentSchema, data) as Record<string, unknown>
  if (!String(data.full_name ?? '').trim()) throw new Error('اسم الخصم مطلوب')
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO opponents (id, full_name, national_id, phone, address, lawyer_name, extra_data, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      data.full_name,
      data.national_id ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.lawyer_name ?? null,
      data.extra_data ?? null,
      data.notes ?? null,
      ts,
      ts
    )
  recordLocalChange('opponents', id, 'INSERT')
  const caseId = asIdOrNull(data.case_id)
  if (caseId) linkOpponentRow(caseId, id)
  audit(actor, 'create', 'opponents', id, `تمت إضافة الخصم ${data.full_name}`)
  return { id }
}

export function updateOpponent(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE opponents SET full_name=?, national_id=?, phone=?, address=?, lawyer_name=?, extra_data=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      data.full_name,
      data.national_id ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.lawyer_name ?? null,
      data.extra_data ?? null,
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('opponents', id, 'UPDATE')
  audit(actor, 'update', 'opponents', id, `تم تعديل الخصم ${data.full_name}`)
  return { id }
}

export function removeOpponent(actor: AuthedUser, id: string) {
  const links = getDb().prepare(`SELECT id FROM case_opponents WHERE opponent_id = ? AND ${notDeleted()}`).all(id) as {
    id: string
  }[]
  for (const l of links) softDelete('case_opponents', l.id)
  softDelete('opponents', id)
  audit(actor, 'delete', 'opponents', id, `تم حذف خصم رقم ${id}`)
}

function linkOpponentRow(caseId: string, opponentId: string) {
  const db = getDb()
  const existing = db
    .prepare('SELECT id, deleted_at FROM case_opponents WHERE case_id = ? AND opponent_id = ?')
    .get(caseId, opponentId) as { id: string; deleted_at: string | null } | undefined
  if (existing && !existing.deleted_at) return
  const ts = nowIso()
  if (existing) {
    db.prepare('UPDATE case_opponents SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(ts, existing.id)
    recordLocalChange('case_opponents', existing.id, 'UPDATE')
    return
  }
  const id = newId()
  db.prepare(
    'INSERT INTO case_opponents (id, case_id, opponent_id, created_at, updated_at) VALUES (?,?,?,?,?)'
  ).run(id, caseId, opponentId, ts, ts)
  recordLocalChange('case_opponents', id, 'INSERT')
}

export function linkOpponentToCase(actor: AuthedUser, opponentId: string, caseId: string) {
  opponentId = asId(opponentId)
  caseId = asId(caseId)
  if (!opponentId || !caseId) throw new Error('الخصم والقضية مطلوبان')
  linkOpponentRow(caseId, opponentId)
  audit(actor, 'update', 'opponents', opponentId, `تم ربط الخصم بالقضية ${caseId}`)
  return { ok: true }
}

export function addClientContact(
  actor: AuthedUser,
  clientId: string,
  data: { name: string; position?: string; phone?: string; email?: string }
) {
  const parsed = parseSchema(contactSchema, data)
  if (!parsed.name) throw new Error('اسم الموظف مطلوب')
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      'INSERT INTO client_contacts (id, client_id, name, position, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(id, clientId, parsed.name, parsed.position ?? null, parsed.phone ?? null, parsed.email ?? null, ts, ts)
  recordLocalChange('client_contacts', id, 'INSERT')
  audit(actor, 'create', 'clients', clientId, `تمت إضافة جهة اتصال ${parsed.name}`)
  return { id }
}

export function removeClientContact(id: string) {
  softDelete('client_contacts', id)
}
