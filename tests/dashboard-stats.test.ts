import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

function sqliteAvailable() {
  try {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

describe.skipIf(!sqliteAvailable())('dashboard case totals', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  it('counts every non-deleted case in إجمالي القضايا including archived', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-dash-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    const db = initDatabase(path.join(dir, 't.db'))
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, created_at, updated_at)
       VALUES ('cs-open', 'CS-00001', 'مفتوحة', 'cl1', 'open', 0, ?, ?),
              ('cs-closed', 'CS-00002', 'مغلقة', 'cl1', 'closed', 0, ?, ?),
              ('cs-arch', 'CS-00003', 'مؤرشفة', 'cl1', 'closed', 1, ?, ?),
              ('cs-del', 'CS-00004', 'محذوفة', 'cl1', 'open', 0, ?, ?)`
    ).run(ts, ts, ts, ts, ts, ts, ts, ts)
    db.prepare(`UPDATE cases SET deleted_at = ? WHERE id = 'cs-del'`).run(ts)

    const { dashboardStats } = await import('../electron/main/services/dashboard')
    const stats = dashboardStats({
      id: 'u1',
      username: 'admin',
      fullName: 'Admin',
      roleCode: 'admin',
      permissions: []
    })
    expect(stats.cases).toBe(3)
    expect(stats.openCases).toBe(1)
    expect(stats.closedCases).toBe(2)
  })
})
