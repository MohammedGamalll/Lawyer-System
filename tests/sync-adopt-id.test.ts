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
})
