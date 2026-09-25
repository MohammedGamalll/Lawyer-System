import bcrypt from 'bcryptjs'
import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { getDb } from '../db/database'
import { notDeleted } from '../db/ids'
import { destroySessionsForUser, listActiveSessionUsers, loadPermissions } from '../ipc/session'
import { nowIso } from '../utils/time'
import { getSupabase } from './client'
import { mapSyncError } from './errors'
import { decideGuard, PRIVILEGED_QUEUE_TABLES, type RemoteUserRow } from './guardDecision'
import { runAsRemote } from './origin'
import { clearQueue, dropQueueExcept, isQueued } from './queue'

const REVERIFY_KEY = 'sync_reverify_user_id'
const REVERIFY_HASH_KEY = 'sync_reverify_password_hash'

let getWin: () => BrowserWindow | null = () => null
let paused = false

export function setAuthGuardWindow(fn: () => BrowserWindow | null): void {
  getWin = fn
}

function emitAuth(channel: 'auth:banned' | 'auth:reverify' | 'auth:roleChanged', payload?: unknown): void {
  getWin()?.webContents.send(channel, payload)
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, nowIso())
}

function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value || ''
}

function clearReverifySettings(): void {
  getDb().prepare(`DELETE FROM settings WHERE key IN (?, ?)`).run(REVERIFY_KEY, REVERIFY_HASH_KEY)
}

export function isSyncPaused(): boolean {
  if (paused) return true
  return Boolean(getSetting(REVERIFY_KEY))
}

export function restorePauseFromSettings(): void {
  paused = Boolean(getSetting(REVERIFY_KEY))
}

function currentUserId(): string | null {
  return listActiveSessionUsers()[0]?.id || null
}

function localUser(userId: string): { password_hash: string; is_active: number; role_id: string } | undefined {
  return getDb()
    .prepare(`SELECT password_hash, is_active, role_id FROM users WHERE id = ?`)
    .get(userId) as { password_hash: string; is_active: number; role_id: string } | undefined
}

async function fetchRemoteUser(userId: string): Promise<{ row: RemoteUserRow | null; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { row: null, error: 'المزامنة غير مفعّلة' }
  const { data, error } = await sb
    .from('users')
    .select('id,password_hash,is_active,role_id,deleted_at,updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { row: null, error: mapSyncError(error.message) }
  return { row: (data as RemoteUserRow | null) || null }
}

function beginReverify(userId: string, remoteHash: string): void {
  paused = true
  setSetting(REVERIFY_KEY, userId)
  setSetting(REVERIFY_HASH_KEY, remoteHash)
  emitAuth('auth:reverify', { userId })
}

function applyBanned(userId: string): void {
  runAsRemote(() => {
    getDb()
      .prepare(`UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?`)
      .run(nowIso(), userId)
  })
  clearQueue()
  destroySessionsForUser(userId)
  paused = false
  clearReverifySettings()
  emitAuth('auth:banned', { message: 'تم إيقاف حسابك من قبل الإدارة.' })
}

function applyRemoteRole(userId: string, roleId: string): void {
  const role = getDb().prepare(`SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL`).get(roleId)
  if (!role) return
  runAsRemote(() => {
    getDb().prepare(`UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?`).run(roleId, nowIso(), userId)
  })
  const perms = loadPermissions(userId, roleCodeFor(userId))
  if (!perms.includes('settings.manage')) {
    dropQueueExcept([...PRIVILEGED_QUEUE_TABLES], null)
  }
  if (!perms.includes('users.manage')) {
    dropQueueExcept(['users'], userId)
  }
  emitAuth('auth:roleChanged', { userId, roleId })
}

function roleCodeFor(userId: string): string {
  const row = getDb()
    .prepare(
      `SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(userId) as { code: string } | undefined
  return row?.code || ''
}

export async function runPrePushGuard(): Promise<{ proceed: boolean; error?: string }> {
  restorePauseFromSettings()
  const userId = currentUserId()
  if (!userId) {
    if (isSyncPaused()) return { proceed: false, error: reverifyErrorMessage() }
    return { proceed: true }
  }

  const marked = getSetting(REVERIFY_KEY)
  if (marked && marked !== userId) {
    paused = false
    clearReverifySettings()
  }

  if (isSyncPaused() && getSetting(REVERIFY_KEY) === userId) {
    emitAuth('auth:reverify', { userId })
    return { proceed: false, error: reverifyErrorMessage() }
  }

  const local = localUser(userId)
  if (!local) return { proceed: true }

  const fetched = await fetchRemoteUser(userId)
  const decision = decideGuard({
    fetchError: fetched.error,
    remote: fetched.row,
    local,
    usersRowQueued: isQueued('users', userId)
  })

  if (decision.action === 'key') {
    log.warn('sync auth guard', decision.error)
    return { proceed: false, error: decision.error }
  }
  if (decision.action === 'banned') {
    applyBanned(userId)
    return { proceed: false, error: 'تم إيقاف حسابك من قبل الإدارة.' }
  }
  if (decision.action === 'reverify' && fetched.row) {
    beginReverify(userId, fetched.row.password_hash)
    return { proceed: false, error: reverifyErrorMessage() }
  }
  if (decision.action === 'role') {
    applyRemoteRole(userId, decision.roleId)
    return { proceed: true }
  }
  return { proceed: true }
}

export function onRemoteUserApplied(
  local: { id: string; password_hash: string; is_active: number; role_id: string } | undefined,
  remote: Record<string, unknown>
): { password_hash?: string } {
  const userId = String(remote.id || local?.id || '')
  const loggedIn = listActiveSessionUsers().some((u) => u.id === userId)
  if (!loggedIn || !local) return {}

  if (remote.deleted_at || Number(remote.is_active) === 0) {
    applyBanned(userId)
    return {}
  }

  const remoteHash = String(remote.password_hash || '')
  if (remoteHash && remoteHash !== local.password_hash && !isQueued('users', userId)) {
    beginReverify(userId, remoteHash)
    return { password_hash: local.password_hash }
  }

  if (String(remote.role_id || '') && String(remote.role_id) !== local.role_id) {
    applyRemoteRole(userId, String(remote.role_id))
  }
  return {}
}

export function confirmRemotePassword(userId: string, password: string): void {
  if (!password) throw new Error('أدخل كلمة المرور الجديدة')
  const expected = getSetting(REVERIFY_HASH_KEY)
  const marked = getSetting(REVERIFY_KEY)
  if (!expected || marked !== userId) throw new Error('لا يوجد طلب تأكيد كلمة مرور')
  if (!bcrypt.compareSync(password, expected)) throw new Error('كلمة المرور غير صحيحة')
  runAsRemote(() => {
    getDb()
      .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(expected, nowIso(), userId)
  })
  paused = false
  clearReverifySettings()
}

export function reverifyErrorMessage(): string {
  return 'تم تغيير كلمة المرور من جهاز آخر. أدخل كلمة المرور الجديدة لاستئناف المزامنة.'
}

export function guardAbortError(): string {
  if (isSyncPaused()) return reverifyErrorMessage()
  return ''
}
