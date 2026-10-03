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

describe.skipIf(!sqliteAvailable())('office search, extra parties, archived codes', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-office-search-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  const actor = {
    id: 'u1',
    username: 'admin',
    fullName: 'Admin',
    roleCode: 'admin',
    permissions: [] as string[]
  }

  it(
    'finds CS-00512 by 512 including archived, folds احمد, and includes extra case_clients',
    async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'أحمد علي', 'individual', ?, ?),
              ('cl2', 'CL-2', 'موكل إضافي', 'individual', ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, created_at, updated_at)
       VALUES ('cs512', 'CS-00512', 'قضية مؤرشفة', 'cl1', 'closed', 1, ?, ?),
              ('cs-extra', 'CS-00090', 'قضية طرف إضافي', 'cl1', 'open', 0, ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO case_clients (id, case_id, client_id, is_primary, sort_order, created_at, updated_at)
       VALUES ('cc1', 'cs-extra', 'cl2', 0, 1, ?, ?)`
    ).run(ts, ts)

    const { listCases } = await import('../electron/main/services/cases')
    const { listClients, clientProfile } = await import('../electron/main/services/clients')
    const { globalSearch, advancedSearch } = await import('../electron/main/services/reports')

    const byCode = listCases({ page: 1, pageSize: 50, search: '512' }, 0)
    expect(byCode.rows.some((r) => String(r.id) === 'cs512')).toBe(true)

    const byName = listCases({ page: 1, pageSize: 50, search: 'احمد', filters: { archive_scope: 'all' } }, 'all')
    expect(byName.rows.some((r) => String(r.id) === 'cs512')).toBe(true)

    const extra = listCases({ page: 1, pageSize: 50, search: 'موكل إضافي' }, 0)
    expect(extra.rows.some((r) => String(r.id) === 'cs-extra')).toBe(true)

    const clients = listClients({ page: 1, pageSize: 50, search: 'احمد' }, actor)
    expect(clients.rows.some((r) => String(r.id) === 'cl1')).toBe(true)

    const profile = clientProfile('cl2', actor)
    expect((profile.cases as { id: string }[]).some((r) => r.id === 'cs-extra')).toBe(true)

    const byClient = listCases({ page: 1, pageSize: 50, filters: { client_id: 'cl2', archive_scope: 'all' } }, 'all')
    expect(byClient.rows.some((r) => String(r.id) === 'cs-extra')).toBe(true)

    const global = globalSearch('512', actor) as { cases?: { id: string }[] }
    expect((global.cases || []).some((r) => r.id === 'cs512')).toBe(true)

    const adv = advancedSearch({ program_code: '512' }) as { id: string }[]
    expect(adv.some((r) => r.id === 'cs512')).toBe(true)
    },
    20000
  )
})
