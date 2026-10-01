import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { isUniqueConflict, naturalKeyOf } from '../electron/main/sync/adoptRemoteId'
import { mapSyncError } from '../electron/main/sync/errors'

describe('natural key helpers', () => {
  it('detects unique conflicts from sqlite and postgres', () => {
    expect(isUniqueConflict({ message: 'UNIQUE constraint failed: roles.code' })).toBe(true)
    expect(isUniqueConflict({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isUniqueConflict({ message: 'network down' })).toBe(false)
  })

  it('reads single and composite natural keys', () => {
    expect(naturalKeyOf('roles', { code: 'admin' })).toEqual({ columns: ['code'], values: ['admin'] })
    expect(naturalKeyOf('lookup_values', { kind: 'court', value: 'شمال' })).toEqual({
      columns: ['kind', 'value'],
      values: ['court', 'شمال']
    })
    expect(naturalKeyOf('clients', { id: 'x' })).toBeNull()
  })

  it('maps leftover unique errors to Arabic', () => {
    expect(mapSyncError('UNIQUE constraint failed: roles.code')).toContain('تعارض')
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

describe.skipIf(!sqliteAvailable())('adopt remote role id', () => {
  let dir: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-adopt-'))
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

  it('remaps local role id, user FK, and queue to the remote id', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { adoptRemoteId, findLocalIdByNaturalKey } = await import('../electron/main/sync/adoptRemoteId')
    const { enqueue, pendingCount } = await import('../electron/main/sync/queue')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const db = getDb()
    const local = db.prepare(`SELECT id FROM roles WHERE code = 'admin'`).get() as { id: string }
    const remoteId = randomUUID()
    const admin = db.prepare(`SELECT id, role_id FROM users WHERE username = 'admin'`).get() as {
      id: string
      role_id: string
    }
    expect(admin.role_id).toBe(local.id)
    enqueue('roles', local.id, 'UPDATE', { id: local.id, code: 'admin' })
    expect(pendingCount()).toBe(1)

    adoptRemoteId('roles', local.id, remoteId)

    expect(db.prepare(`SELECT id FROM roles WHERE code = 'admin'`).get()).toEqual({ id: remoteId })
    expect(db.prepare(`SELECT role_id FROM users WHERE id = ?`).get(admin.id)).toEqual({ role_id: remoteId })
    const queued = db.prepare(`SELECT record_id, payload FROM local_sync_queue`).get() as {
      record_id: string
      payload: string
    }
    expect(queued.record_id).toBe(remoteId)
    expect(queued.payload).toContain(remoteId)
    expect(findLocalIdByNaturalKey('roles', { code: 'admin' })).toBe(remoteId)

    const later = new Date().toISOString()
    applyRemoteWrite(
      'roles',
      {
        id: remoteId,
        code: 'admin',
        name_ar: 'المدير',
        name_en: 'Admin',
        is_system: 1,
        created_at: later,
        updated_at: later,
        deleted_at: null
      },
      'UPDATE'
    )
    expect(db.prepare(`SELECT COUNT(*) as c FROM roles WHERE code = 'admin'`).get()).toEqual({ c: 1 })
  })

  it('adopts the local twin when pull brings the same role code under a new id', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const db = getDb()
    const local = db.prepare(`SELECT id FROM roles WHERE code = 'lawyer'`).get() as { id: string }
    const remoteId = randomUUID()
    const later = new Date(Date.now() + 5000).toISOString()
    applyRemoteWrite(
      'roles',
      {
        id: remoteId,
        code: 'lawyer',
        name_ar: 'المحامي',
        name_en: 'Lawyer',
        is_system: 1,
        created_at: later,
        updated_at: later,
        deleted_at: null
      },
      'UPDATE'
    )
    expect(db.prepare(`SELECT id FROM roles WHERE code = 'lawyer'`).get()).toEqual({ id: remoteId })
    expect(db.prepare(`SELECT COUNT(*) as c FROM roles WHERE id = ?`).get(local.id)).toEqual({ c: 0 })
  })

  it('applies the cloud password even when local updated_at is newer', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const bcrypt = (await import('bcryptjs')).default
    const db = getDb()
    const user = db.prepare(`SELECT id, password_hash FROM users WHERE username = 'admin'`).get() as {
      id: string
      password_hash: string
    }
    const newer = new Date(Date.now() + 60_000).toISOString()
    db.prepare(`UPDATE users SET updated_at = ? WHERE id = ?`).run(newer, user.id)
    const cloudHash = bcrypt.hashSync('CloudNew@123', 10)
    const role = db.prepare(`SELECT role_id FROM users WHERE id = ?`).get(user.id) as { role_id: string }
    applyRemoteWrite(
      'users',
      {
        id: user.id,
        username: 'admin',
        password_hash: cloudHash,
        full_name: 'مدير النظام',
        role_id: role.role_id,
        is_active: 1,
        created_at: newer,
        updated_at: new Date(Date.now() - 60_000).toISOString(),
        deleted_at: null
      },
      'UPDATE'
    )
    const after = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(user.id) as { password_hash: string }
    expect(after.password_hash).toBe(cloudHash)
  })

  it('does not crash when a remote role is missing code', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const db = getDb()
    const before = (db.prepare(`SELECT COUNT(*) as c FROM roles`).get() as { c: number }).c
    const later = new Date(Date.now() + 5000).toISOString()
    expect(() =>
      applyRemoteWrite(
        'roles',
        {
          id: randomUUID(),
          code: null,
          name_ar: 'دور ناقص',
          name_en: 'Missing',
          is_system: 1,
          created_at: later,
          updated_at: later,
          deleted_at: null
        },
        'INSERT'
      )
    ).not.toThrow()
    expect(db.prepare(`SELECT COUNT(*) as c FROM roles`).get()).toEqual({ c: before })
  })

  it('keeps the local role code when the cloud update sends null', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const db = getDb()
    const local = db.prepare(`SELECT * FROM roles WHERE code = 'admin'`).get() as {
      id: string
      code: string
      name_ar: string
    }
    const later = new Date(Date.now() + 5000).toISOString()
    applyRemoteWrite(
      'roles',
      {
        id: local.id,
        code: null,
        name_ar: 'المدير محدّث',
        name_en: 'Admin',
        is_system: 1,
        created_at: later,
        updated_at: later,
        deleted_at: null
      },
      'UPDATE'
    )
    const after = db.prepare(`SELECT code, name_ar FROM roles WHERE id = ?`).get(local.id) as {
      code: string
      name_ar: string
    }
    expect(after.code).toBe('admin')
    expect(after.name_ar).toBe('المدير محدّث')
  })

  it('clears fake client national ids on schema patch', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { patchSchema } = await import('../electron/main/db/patch')
    const db = getDb()
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, national_id, client_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'individual', ?, ?)`
    ).run(id, `CL-FAKE-${id.slice(0, 8)}`, 'موكل تجريبي', '01056630270863', ts, ts)
    patchSchema(db)
    const after = db.prepare(`SELECT national_id FROM clients WHERE id = ?`).get(id) as { national_id: string | null }
    expect(after.national_id).toBeNull()
  })
})
