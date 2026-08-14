import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

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

describe.skipIf(!sqliteAvailable())('sync echo loop', () => {
  let dir: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-sync-'))
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

  it('does not enqueue when applying a remote realtime write', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { recordLocalChange, pendingCount } = await import('../electron/main/sync/queue')
    const { applyRemoteWrite } = await import('../electron/main/sync/applyRemote')
    const { runAsRemote } = await import('../electron/main/sync/origin')
    const db = getDb()
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES (?, 'CL-ECHO', 'عميل مزامنة', 'individual', ?, ?)`
    ).run(id, ts, ts)
    recordLocalChange('clients', id, 'INSERT')
    expect(pendingCount()).toBeGreaterThan(0)
    db.prepare('DELETE FROM local_sync_queue').run()
    expect(pendingCount()).toBe(0)

    const later = new Date(Date.now() + 1000).toISOString()
    applyRemoteWrite(
      'clients',
      {
        id,
        client_number: 'CL-ECHO',
        full_name: 'من السحابة',
        client_type: 'individual',
        created_at: ts,
        updated_at: later,
        deleted_at: null
      },
      'UPDATE'
    )
    expect(pendingCount()).toBe(0)
    const row = db.prepare('SELECT full_name FROM clients WHERE id=?').get(id) as { full_name: string }
    expect(row.full_name).toBe('من السحابة')

    runAsRemote(() => recordLocalChange('clients', id, 'UPDATE'))
    expect(pendingCount()).toBe(0)
  })

  it('replaces a queued row instead of duplicating it', async () => {
    const { getDb } = await import('../electron/main/db/database')
    const { recordLocalChange, pendingCount } = await import('../electron/main/sync/queue')
    const db = getDb()
    const id = randomUUID()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES (?, 'CL-DEDUP', 'عميل طابور', 'individual', ?, ?)`
    ).run(id, ts, ts)
    recordLocalChange('clients', id, 'INSERT')
    recordLocalChange('clients', id, 'UPDATE')
    expect(pendingCount()).toBe(1)
    const ops = db.prepare('SELECT operation FROM local_sync_queue WHERE record_id = ?').all(id) as { operation: string }[]
    expect(ops).toHaveLength(1)
    expect(ops[0].operation).toBe('UPDATE')
  })
})
