import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { decideGuard } from '../electron/main/sync/guardDecision'
import { mapSyncError } from '../electron/main/sync/errors'

describe('mapSyncError', () => {
  it('translates Invalid API key', () => {
    expect(mapSyncError('Invalid API key')).toBe('مفتاح المزامنة غير صالح. تواصل مع الدعم.')
  })

  it('keeps unknown messages', () => {
    expect(mapSyncError('constraint failed')).toBe('constraint failed')
  })
})

describe('decideGuard', () => {
  const local = { password_hash: 'local-hash', is_active: 1, role_id: 'role-admin' }

  it('returns key action on fetch error', () => {
    const d = decideGuard({
      fetchError: 'مفتاح المزامنة غير صالح. تواصل مع الدعم.',
      remote: null,
      local,
      usersRowQueued: false
    })
    expect(d).toEqual({ action: 'key', error: 'مفتاح المزامنة غير صالح. تواصل مع الدعم.' })
  })

  it('bans inactive or deleted remote users', () => {
    expect(
      decideGuard({
        remote: { id: 'u1', password_hash: 'local-hash', is_active: 0, role_id: 'role-admin' },
        local,
        usersRowQueued: false
      }).action
    ).toBe('banned')
    expect(
      decideGuard({
        remote: {
          id: 'u1',
          password_hash: 'local-hash',
          is_active: 1,
          role_id: 'role-admin',
          deleted_at: '2026-01-01T00:00:00.000Z'
        },
        local,
        usersRowQueued: false
      }).action
    ).toBe('banned')
  })

  it('reverifies when remote hash differs and local users row is not queued', () => {
    expect(
      decideGuard({
        remote: { id: 'u1', password_hash: 'remote-hash', is_active: 1, role_id: 'role-admin' },
        local,
        usersRowQueued: false
      }).action
    ).toBe('reverify')
  })

  it('continues when hash differs but this device queued the users row', () => {
    expect(
      decideGuard({
        remote: { id: 'u1', password_hash: 'remote-hash', is_active: 1, role_id: 'role-admin' },
        local,
        usersRowQueued: true
      }).action
    ).toBe('continue')
  })

  it('updates role when only role_id changed', () => {
    const d = decideGuard({
      remote: { id: 'u1', password_hash: 'local-hash', is_active: 1, role_id: 'role-lawyer' },
      local,
      usersRowQueued: false
    })
    expect(d).toEqual({ action: 'role', roleId: 'role-lawyer' })
  })

  it('continues when remote matches local', () => {
    expect(
      decideGuard({
        remote: { id: 'u1', password_hash: 'local-hash', is_active: 1, role_id: 'role-admin' },
        local,
        usersRowQueued: false
      }).action
    ).toBe('continue')
  })
})

function sqliteAvailable() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

describe.skipIf(!sqliteAvailable())('sessions and privileged queue', () => {
  let dir: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-auth-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase } = await import('../electron/main/db/database')
    initDatabase(path.join(dir, 't.db'))
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  it('wipes other sessions on password change but keeps the current one', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { createSession, destroySessionsForUser } = await import('../electron/main/ipc/session')
    const { changePassword } = await import('../electron/main/services/auth')
    const db = getDb()
    const admin = db.prepare(`SELECT id, username, full_name FROM users WHERE username = 'admin'`).get() as {
      id: string
      username: string
      full_name: string
    }
    const keep = createSession(admin.id, 11, 'keep')
    createSession(admin.id, 12, 'drop')
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(admin.id) as { c: number }).toEqual({
      c: 2
    })
    changePassword(
      { id: admin.id, username: admin.username, fullName: admin.full_name, roleCode: 'admin', permissions: [] },
      'Admin@123',
      'NewPass@123',
      11
    )
    const left = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(admin.id) as { id: string }[]
    expect(left).toHaveLength(1)
    expect(left[0].id).toBe(keep)
    destroySessionsForUser(admin.id)
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(admin.id) as { c: number }).toEqual({
      c: 0
    })
  })

  it('drops privileged queue rows except the current user', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { enqueue, dropQueueExcept, pendingCount } = await import('../electron/main/sync/queue')
    const db = getDb()
    const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get() as { id: string }
    enqueue('settings', 'office_name', 'UPDATE', { key: 'office_name', value: 'x' })
    enqueue('users', admin.id, 'UPDATE', { id: admin.id })
    enqueue('users', 'other-user', 'UPDATE', { id: 'other-user' })
    dropQueueExcept(['settings'], null)
    dropQueueExcept(['users'], admin.id)
    expect(pendingCount()).toBe(1)
    const left = db.prepare('SELECT table_name, record_id FROM local_sync_queue').all() as {
      table_name: string
      record_id: string
    }[]
    expect(left).toEqual([{ table_name: 'users', record_id: admin.id }])
  })

  it('does not queue the users row after a failed local password check', async () => {
    const { login } = await import('../electron/main/services/auth')
    const { pendingCount } = await import('../electron/main/sync/queue')
    const before = pendingCount()
    await expect(login('admin', 'WrongPass@1', 1, 'test')).rejects.toThrow('غير صحيحة')
    expect(pendingCount()).toBe(before)
  })
})
