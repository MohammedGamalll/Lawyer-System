import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { notDeleted } from '../db/ids'
import type { AuthedUser } from '../ipc/helpers'
import type { UserSession } from '@shared/types'

const SESSION_HEADER = new Map<number, string>()

export function setSenderSession(senderId: number, sessionId: string): void {
  SESSION_HEADER.set(senderId, sessionId)
}

export function getSession(event: IpcMainInvokeEvent): AuthedUser | null {
  const sessionId = SESSION_HEADER.get(event.sender.id)
  if (!sessionId) return null
  const db = getDb()
  const row = db
    .prepare(
      `SELECT s.id, s.expires_at, u.id as user_id, u.username, u.full_name, u.is_active,
              r.code as role_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | {
        id: string
        expires_at: string
        user_id: string
        username: string
        full_name: string
        is_active: number
        role_code: string
      }
    | undefined
  if (!row || row.is_active !== 1) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    return null
  }
  return {
    id: row.user_id,
    username: row.username,
    fullName: row.full_name,
    roleCode: row.role_code,
    permissions: loadPermissions(row.user_id, row.role_code)
  }
}

export function createSession(userId: string, senderId: number, deviceInfo?: string): string {
  const db = getDb()
  const id = randomUUID()
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, device_info) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, nowIso(), expires, deviceInfo ?? null)
  setSenderSession(senderId, id)
  return id
}

export function destroySession(senderId: number): void {
  const sessionId = SESSION_HEADER.get(senderId)
  if (sessionId) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  SESSION_HEADER.delete(senderId)
}

export function loadPermissions(userId: string, roleCode: string): string[] {
  const db = getDb()
  const rolePerms = db
    .prepare(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN users u ON u.role_id = rp.role_id
       WHERE u.id = ? AND ${notDeleted('p')} AND ${notDeleted('rp')}`
    )
    .all(userId) as { code: string }[]
  const overrides = db
    .prepare(
      `SELECT p.code, up.granted FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = ? AND ${notDeleted('up')} AND ${notDeleted('p')}`
    )
    .all(userId) as { code: string; granted: number }[]

  const set = new Set(rolePerms.map((p) => p.code))
  if (roleCode === 'admin') {
    const all = db.prepare('SELECT code FROM permissions').all() as { code: string }[]
    all.forEach((p) => set.add(p.code))
  }
  for (const o of overrides) {
    if (o.granted) set.add(o.code)
    else set.delete(o.code)
  }
  return [...set]
}

export function hasAnyPermission(user: AuthedUser, codes: string | string[]): boolean {
  if (user.roleCode === 'admin') return true
  const list = Array.isArray(codes) ? codes : [codes]
  return list.some((code) => user.permissions.includes(code))
}

export function hasPermission(user: AuthedUser, code: string): boolean {
  return hasAnyPermission(user, code)
}

export function toPublicSession(user: AuthedUser): UserSession {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT u.last_login_at, r.name_ar, u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(user.id) as { last_login_at: string | null; name_ar: string; email: string | null }
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: row?.email,
    roleCode: user.roleCode,
    roleNameAr: row?.name_ar ?? user.roleCode,
    permissions: user.permissions,
    lastLoginAt: row?.last_login_at
  }
}
