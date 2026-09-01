import bcrypt from 'bcryptjs'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import { loadPermissions, hasAnyPermission } from '../ipc/session'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { PERMISSIONS, ROLE_PERMISSIONS } from '@shared/permissions'
import { userCreateSchema, userUpdateSchema, parseSchema } from '@shared/schemas'
import { clampPageSize, pageKind } from '../db/queryLimits'

export function listUsers(query: ListQuery = {}, actor?: AuthedUser | null) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('u')}`
  if (query.search) {
    where += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)'
    const s = `%${query.search}%`
    params.push(s, s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM users u ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, u.last_login_at, u.locked_until,
              r.code as role_code, COALESCE(r.name_ar, '') as role_name,
              lw.id as lawyer_id, em.id as employee_id
       FROM users u LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
       LEFT JOIN lawyers lw ON lw.user_id = u.id AND ${notDeleted('lw')}
       LEFT JOIN employees em ON em.user_id = u.id AND ${notDeleted('em')}
       ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  const safe =
    actor && !hasAnyPermission(actor, ['users.manage', 'employees.manage'])
      ? (rows as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          username: r.username,
          full_name: r.full_name
        }))
      : rows
  return { rows: safe, total, page, pageSize }
}

export function getUser(id: string) {
  const db = getDb()
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active, u.last_login_at, u.role_id,
              r.code as role_code, COALESCE(r.name_ar, '') as role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id AND ${notDeleted('r')}
       WHERE u.id = ? AND ${notDeleted('u')}`
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
  const roleId = asId(data.role_id)
  if (!username) throw new Error('اسم المستخدم مطلوب')
  if (password.length < 6) throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف')
  if (!fullName) throw new Error('الاسم الكامل مطلوب')
  if (!roleId) throw new Error('يجب اختيار الدور')
  const db = getDb()
  const exists = db.prepare(`SELECT id FROM users WHERE lower(trim(username)) = lower(?) AND ${notDeleted()}`).get(username)
  if (exists) throw new Error('اسم المستخدم مستخدم بالفعل')
  const role = db.prepare(`SELECT id FROM roles WHERE id = ? AND ${notDeleted()}`).get(roleId)
  if (!role) throw new Error('الدور غير موجود')
  const ts = nowIso()
  const id = newId()
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, email, phone, role_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
  recordLocalChange('users', id, 'INSERT')
  audit(actor, 'create', 'users', id, `تم إنشاء المستخدم ${username}`)
  return { id }
}

export function updateUser(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(userUpdateSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT * FROM users WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { username: string; password_hash: string }
    | undefined
  if (!old) throw new Error('المستخدم غير موجود')
  const username = String(data.username ?? old.username).trim()
  if (!username) throw new Error('اسم المستخدم مطلوب')
  const taken = db
    .prepare(`SELECT id FROM users WHERE lower(trim(username)) = lower(?) AND id != ? AND ${notDeleted()}`)
    .get(username, id)
  if (taken) throw new Error('اسم المستخدم مستخدم بالفعل')
  const roleId = asId(data.role_id)
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
  recordLocalChange('users', id, 'UPDATE')
  audit(actor, 'update', 'users', id, `تم تعديل المستخدم ${username}`, old, { ...data, password: password ? '***' : undefined })
  return { id }
}

export function removeUser(actor: AuthedUser, id: string) {
  if (id === actor.id) throw new Error('لا يمكنك حذف حسابك الحالي')
  const db = getDb()
  const old = db.prepare(`SELECT username FROM users WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { username: string }
    | undefined
  if (!old) throw new Error('المستخدم غير موجود')
  const perms = db.prepare(`SELECT id FROM user_permissions WHERE user_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const p of perms) softDelete('user_permissions', p.id)
  softDelete('users', id)
  audit(actor, 'delete', 'users', id, `تم حذف المستخدم ${old.username}`)
}

export function setUserPermissions(actor: AuthedUser, userId: string, codes: string[]) {
  const db = getDb()
  const user = db
    .prepare(
      `SELECT u.username, r.code as role_code FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND ${notDeleted('u')}`
    )
    .get(userId) as { username: string; role_code: string } | undefined
  if (!user) throw new Error('المستخدم غير موجود')
  const ts = nowIso()
  const wantedSet = new Set(codes)
  const roleSet = new Set(
    user.role_code === 'admin' ? PERMISSIONS.map((p) => p.code) : ROLE_PERMISSIONS[user.role_code] || []
  )
  const permRows = db.prepare(`SELECT id, code FROM permissions WHERE ${notDeleted()}`).all() as { id: string; code: string }[]
  const permByCode = new Map(permRows.map((p) => [p.code, p.id]))
  const existing = db
    .prepare('SELECT id, permission_id, granted, deleted_at FROM user_permissions WHERE user_id = ?')
    .all(userId) as { id: string; permission_id: string; granted: number; deleted_at: string | null }[]
  const byPerm = new Map(existing.map((r) => [r.permission_id, r]))

  const upsert = (permissionId: string, granted: number) => {
    const row = byPerm.get(permissionId)
    if (row && !row.deleted_at && Number(row.granted) === granted) return
    if (row) {
      db.prepare(
        'UPDATE user_permissions SET deleted_at = NULL, granted = ?, updated_at = ? WHERE id = ?'
      ).run(granted, ts, row.id)
      recordLocalChange('user_permissions', row.id, 'UPDATE')
      byPerm.set(permissionId, { ...row, deleted_at: null, granted })
    } else {
      const id = newId()
      db.prepare(
        'INSERT INTO user_permissions (id, user_id, permission_id, granted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, userId, permissionId, granted, ts, ts)
      recordLocalChange('user_permissions', id, 'INSERT')
      byPerm.set(permissionId, { id, permission_id: permissionId, granted, deleted_at: null })
    }
  }

  for (const p of PERMISSIONS) {
    const pid = permByCode.get(p.code)
    if (!pid) continue
    const wanted = wantedSet.has(p.code)
    const inRole = roleSet.has(p.code)
    const row = byPerm.get(pid)
    if (wanted === inRole) {
      if (row && !row.deleted_at) softDelete('user_permissions', row.id)
      continue
    }
    upsert(pid, wanted ? 1 : 0)
  }
  audit(actor, 'update', 'users', userId, `تم تحديث صلاحيات ${user.username}`)
}

export function listRoles() {
  return getDb().prepare(`SELECT * FROM roles WHERE ${notDeleted()} ORDER BY created_at`).all()
}

export function listPermissions() {
  return getDb().prepare(`SELECT * FROM permissions WHERE ${notDeleted()} ORDER BY module, code`).all()
}
