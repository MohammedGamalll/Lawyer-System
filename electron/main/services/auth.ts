import bcrypt from 'bcryptjs'
import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, notDeleted } from '../db/ids'
import { adoptRemoteId } from '../sync/adoptRemoteId'
import { getSupabase } from '../sync/client'
import { runAsRemote } from '../sync/origin'
import { recordLocalChange } from '../sync/queue'
import { createSession, destroySession, destroySessionsForUser, loadPermissions, sessionIdForSender, toPublicSession } from '../ipc/session'
import type { AuthedUser } from '../ipc/helpers'
import type { UserSession } from '@shared/types'
import { loginSchema, passwordChangeSchema, parseSchema } from '@shared/schemas'

function setting(key: string, fallback: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

type LoginUser = {
  id: string
  username: string
  password_hash: string
  full_name: string
  is_active: number
  failed_login_attempts: number
  locked_until: string | null
  role_code: string
}

function findLoginUser(username: string): LoginUser | undefined {
  return getDb()
    .prepare(
      `SELECT u.*, r.code as role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE lower(trim(u.username)) = lower(trim(?)) AND ${notDeleted('u')}`
    )
    .get(username.trim()) as LoginUser | undefined
}

/** If the typed password matches the cloud hash, store it locally (and adopt the cloud user id). */
export async function acceptCloudPassword(localId: string, username: string, password: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || !password) return false
  const { data, error } = await sb
    .from('users')
    .select('id,password_hash,is_active,deleted_at')
    .eq('username', username.trim())
    .maybeSingle()
  if (error || !data?.password_hash) return false
  if (data.deleted_at || Number(data.is_active) === 0) return false
  if (!bcrypt.compareSync(password, String(data.password_hash))) return false
  const remoteId = String(data.id)
  if (remoteId !== localId) adoptRemoteId('users', localId, remoteId)
  runAsRemote(() => {
    getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(String(data.password_hash), remoteId)
  })
  return true
}

export async function login(
  username: string,
  password: string,
  senderId: number,
  deviceInfo?: string
): Promise<UserSession> {
  parseSchema(loginSchema, { username, password })
  const db = getDb()
  let user = findLoginUser(username)

  const logAttempt = (success: number) => {
    db.prepare(
      'INSERT INTO login_attempts (id, username, success, device_info, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(newId(), username, success, deviceInfo ?? null, nowIso())
  }

  if (!user) {
    logAttempt(0)
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    logAttempt(0)
    throw new Error('الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة')
  }
  if (!user.role_code) {
    logAttempt(0)
    throw new Error('هذا الحساب غير مرتبط بدور صحيح. عدّل المستخدم واختر الدور ثم أعد تسجيل الدخول')
  }
  if (!user.is_active) {
    logAttempt(0)
    throw new Error('هذا الحساب معطّل. تواصل مع المدير')
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    const accepted = await acceptCloudPassword(user.id, user.username, password)
    if (accepted) {
      user = findLoginUser(username)
      if (!user || !user.role_code || !user.is_active) {
        logAttempt(0)
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
      }
    } else {
      const max = Number(setting('max_login_attempts', '5'))
      const lockMin = Number(setting('lock_minutes', '15'))
      const fails = user.failed_login_attempts + 1
      const lockedUntil = fails >= max ? new Date(Date.now() + lockMin * 60 * 1000).toISOString() : null
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
        fails,
        lockedUntil,
        user.id
      )
      logAttempt(0)
      if (lockedUntil) throw new Error(`تم قفل الحساب لمدة ${lockMin} دقيقة بعد ${max} محاولات فاشلة`)
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
    }
  }

  db.prepare(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, last_login_device = ?, updated_at = ? WHERE id = ?'
  ).run(nowIso(), deviceInfo ?? 'Windows Desktop', nowIso(), user.id)
  recordLocalChange('users', user.id, 'UPDATE', ['password_hash'])
  logAttempt(1)
  createSession(user.id, senderId, deviceInfo)
  const authed: AuthedUser = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    roleCode: user.role_code,
    permissions: loadPermissions(user.id, user.role_code)
  }
  audit(authed, 'login', 'users', user.id, `قام المستخدم ${user.username} بتسجيل الدخول`, undefined, undefined, deviceInfo)
  return toPublicSession(authed)
}

export function logout(user: AuthedUser | null, senderId: number): void {
  if (user) audit(user, 'logout', 'users', user.id, `قام المستخدم ${user.username} بتسجيل الخروج`)
  destroySession(senderId)
}

export function changePassword(user: AuthedUser, current: string, next: string, senderId?: number): void {
  parseSchema(passwordChangeSchema, { current, next })
  if (!next || next.length < 6) throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف')
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
  if (!bcrypt.compareSync(current, row.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة')
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    bcrypt.hashSync(next, 10),
    nowIso(),
    user.id
  )
  recordLocalChange('users', user.id, 'UPDATE')
  const keep = senderId != null ? sessionIdForSender(senderId) : null
  destroySessionsForUser(user.id, keep)
  audit(user, 'change_password', 'users', user.id, `قام المستخدم ${user.username} بتغيير كلمة المرور`)
}

export function resetPassword(admin: AuthedUser, userId: string, next: string, senderId?: number): void {
  if (!next || next.length < 6) throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف')
  const db = getDb()
  const target = db.prepare(`SELECT username FROM users WHERE id = ? AND ${notDeleted()}`).get(userId) as
    | { username: string }
    | undefined
  if (!target) throw new Error('المستخدم غير موجود')
  db.prepare(
    'UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?'
  ).run(bcrypt.hashSync(next, 10), nowIso(), userId)
  recordLocalChange('users', userId, 'UPDATE')
  const keep = admin.id === userId && senderId != null ? sessionIdForSender(senderId) : null
  destroySessionsForUser(userId, keep)
  audit(admin, 'reset_password', 'users', userId, `قام المدير بإعادة تعيين كلمة مرور ${target.username}`)
}
