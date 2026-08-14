import bcrypt from 'bcryptjs'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { loadPermissions } from '../ipc/session'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { PERMISSIONS } from '@shared/permissions'
import { userCreateSchema, userUpdateSchema, parseSchema } from '@shared/schemas'

export function listUsers(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (query.search) {
    where += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)'
    const s = `%${query.search}%`
    params.push(s, s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM users u ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, u.last_login_at, u.locked_until,
              r.code as role_code, COALESCE(r.name_ar, '') as role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getUser(id: number) {
  const db = getDb()
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active, u.last_login_at, u.role_id,
              r.code as role_code, COALESCE(r.name_ar, '') as role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(id)
  if (!user) throw new Error('المستخدم غير موجود')
  const role = user as { role_code?: string }
  return { ...user, permissions: loadPermissions(id, role.role_code || ''), allPermissions: PERMISSIONS }
}

export function createUser(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(userCreateSchema, data) as Record<string, unknown>
  const username = String(data.username ?? '').trim()
  const password = String(data.password ?? '')
  const fullName = String(data.full_name ?? '').trim()
  const roleId = Number(data.role_id)
  if (!username) throw new Error('اسم المستخدم مطلوب')
  if (password.length < 6) throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف')
  if (!fullName) throw new Error('الاسم الكامل مطلوب')
  if (!roleId) throw new Error('يجب اختيار الدور')
  const db = getDb()
  const exists = db.prepare('SELECT id FROM users WHERE lower(trim(username)) = lower(?)').get(username)
  if (exists) throw new Error('اسم المستخدم مستخدم بالفعل')
  const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId)
  if (!role) throw new Error('الدور غير موجود')
  const ts = nowIso()
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, email, phone, role_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      username,
      bcrypt.hashSync(password, 10),
      fullName,
      data.email ?? null,
      data.phone ?? null,
      roleId,
      Number(data.is_active) === 0 ? 0 : 1,
      ts,
      ts
    )
  audit(actor, 'create', 'users', Number(info.lastInsertRowid), `تم إنشاء المستخدم ${username}`)
  return { id: Number(info.lastInsertRowid) }
}

export function updateUser(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  data = parseSchema(userUpdateSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { username: string; password_hash: string }
    | undefined
  if (!old) throw new Error('المستخدم غير موجود')
  const username = String(data.username ?? old.username).trim()
  if (!username) throw new Error('اسم المستخدم مطلوب')
  const taken = db.prepare('SELECT id FROM users WHERE lower(trim(username)) = lower(?) AND id != ?').get(username, id)
  if (taken) throw new Error('اسم المستخدم مستخدم بالفعل')
  const roleId = Number(data.role_id)
  if (!roleId) throw new Error('يجب اختيار الدور')
  const password = data.password ? String(data.password) : ''
  const hash = password.length >= 6 ? bcrypt.hashSync(password, 10) : old.password_hash
  db.prepare(
    `UPDATE users SET username = ?, password_hash = ?, full_name = ?, email = ?, phone = ?, role_id = ?, is_active = ?,
      failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`
  ).run(
    username,
    hash,
    data.full_name,
    data.email ?? null,
    data.phone ?? null,
    roleId,
    Number(data.is_active) === 0 ? 0 : 1,
    nowIso(),
    id
  )
  audit(actor, 'update', 'users', id, `تم تعديل المستخدم ${username}`, old, { ...data, password: password ? '***' : undefined })
  return { id }
}

export function removeUser(actor: AuthedUser, id: number) {
  if (id === actor.id) throw new Error('لا يمكنك حذف حسابك الحالي')
  const db = getDb()
  const old = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined
  if (!old) throw new Error('المستخدم غير موجود')
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  audit(actor, 'delete', 'users', id, `تم حذف المستخدم ${old.username}`)
}

export function setUserPermissions(actor: AuthedUser, userId: number, codes: string[]) {
  const db = getDb()
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined
  if (!user) throw new Error('المستخدم غير موجود')
  db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId)
  const perm = db.prepare('SELECT id FROM permissions WHERE code = ?')
  const insert = db.prepare(
    'INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, 1)'
  )
  for (const code of codes) {
    const p = perm.get(code) as { id: number } | undefined
    if (p) insert.run(userId, p.id)
  }
  audit(actor, 'update', 'users', userId, `تم تحديث صلاحيات ${user.username}`)
}

export function listRoles() {
  return getDb().prepare('SELECT * FROM roles ORDER BY id').all()
}

export function listPermissions() {
  return getDb().prepare('SELECT * FROM permissions ORDER BY module, id').all()
}
