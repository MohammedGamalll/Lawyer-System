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

describe.skipIf(!sqliteAvailable())('listCases court search and column filters', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-cases-list-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  it('finds an appeal-only case and filters a column beyond the first page', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    const insertCase = db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived,
        first_instance_number, first_instance_year, appeal_number, appeal_year, created_at, updated_at)
       VALUES (?, ?, ?, 'cl1', 'open', ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 1; i <= 4; i++) {
      const tsi = `2026-01-0${i}T00:00:00.000Z`
      insertCase.run(`cs${i}`, `CS-0000${i}`, `قضية ${i}`, 0, String(i), '2020', null, null, tsi, tsi)
    }
    insertCase.run('cs-unique', 'CS-00005', 'UniqueZ-column', 0, '5', '2020', null, null, '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z')
    insertCase.run('cs-appeal', 'CS-00999', 'استئناف فقط', 0, null, null, '8888', '2019', '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z')
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, created_at, updated_at)
       VALUES ('cs-arch', 'CS-07000', 'محفوظة', 'cl1', 'closed', 1, ?, ?)`
    ).run(ts, ts)

    const { listCases } = await import('../electron/main/services/cases')

    const appeal = listCases(
      { page: 1, pageSize: 50, search: '8888 / 2019', filters: { archive_scope: 'all' } },
      'all'
    )
    expect(appeal.rows.some((r) => String(r.id) === 'cs-appeal')).toBe(true)

    const courtFilter = listCases(
      { page: 1, pageSize: 50, filters: { archive_scope: 'all', office_case_number: '8888 / 2019' } },
      'all'
    )
    expect(courtFilter.rows.map((r) => String(r.id))).toContain('cs-appeal')

    const page1 = listCases({ page: 1, pageSize: 2, filters: { archive_scope: 'open' } }, 0)
    expect(page1.rows.length).toBe(2)
    expect(page1.rows.some((r) => String(r.title) === 'UniqueZ-column')).toBe(false)

    const col = listCases(
      { page: 1, pageSize: 2, filters: { archive_scope: 'open' }, columnFilters: { title: 'UniqueZ-column' } },
      0
    )
    expect(col.total).toBe(1)
    expect(col.rows[0]?.title).toBe('UniqueZ-column')

    const hidden = listCases({ page: 1, pageSize: 50 }, 0)
    expect(hidden.rows.some((r) => String(r.id) === 'cs-arch')).toBe(false)
    const all = listCases({ page: 1, pageSize: 50, filters: { archive_scope: 'all' } }, 'all')
    expect(all.rows.some((r) => String(r.id) === 'cs-arch')).toBe(true)
  })

  it('sorts mixed program codes numerically across the full result set', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    const insert = db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, first_instance_number, created_at, updated_at)
       VALUES (?, ?, ?, 'cl1', 'open', 0, ?, ?, ?)`
    )
    insert.run('cs-a', '10', 'عشرة', '100', ts, ts)
    insert.run('cs-b', '2', 'اتنين', '20', ts, ts)
    insert.run('cs-c', 'CS-00003', 'ثلاثة', '9', ts, ts)
    insert.run('cs-d', '0001', 'واحد', '200', ts, ts)
    insert.run('cs-e', 'CS-00100', 'مية', '8', ts, ts)

    const { listCases } = await import('../electron/main/services/cases')
    const codeNum = (v: unknown) => Number(String(v ?? '').replace(/^(CS|CL)-/i, '')) || 0

    const asc = listCases(
      { page: 1, pageSize: 50, filters: { archive_scope: 'all' }, sortBy: 'case_number', sortDir: 'asc' },
      'all'
    )
    expect(asc.rows.map((r) => String(r.id))).toEqual(['cs-d', 'cs-b', 'cs-c', 'cs-a', 'cs-e'])
    const nums = asc.rows.map((r) => codeNum(r.case_number))
    expect(nums).toEqual([...nums].sort((a, b) => a - b))

    const page1 = listCases(
      { page: 1, pageSize: 2, filters: { archive_scope: 'all' }, sortBy: 'case_number', sortDir: 'asc' },
      'all'
    )
    expect(page1.rows.map((r) => String(r.id))).toEqual(['cs-d', 'cs-b'])

    const page2 = listCases(
      { page: 2, pageSize: 2, filters: { archive_scope: 'all' }, sortBy: 'case_number', sortDir: 'asc' },
      'all'
    )
    expect(page2.rows.map((r) => String(r.id))).toEqual(['cs-c', 'cs-a'])

    const desc = listCases(
      { page: 1, pageSize: 50, filters: { archive_scope: 'all' }, sortBy: 'case_number', sortDir: 'desc' },
      'all'
    )
    expect(desc.rows.map((r) => String(r.id))).toEqual(['cs-e', 'cs-a', 'cs-c', 'cs-b', 'cs-d'])

    const court = listCases(
      { page: 1, pageSize: 50, filters: { archive_scope: 'all' }, sortBy: 'office_case_number', sortDir: 'asc' },
      'all'
    )
    expect(court.rows.map((r) => String(r.id))).toEqual(['cs-e', 'cs-c', 'cs-b', 'cs-a', 'cs-d'])
  })
})
