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

describe.skipIf(!sqliteAvailable())('hearings date range and venue filter', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-hearings-range-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  it('returns no rows for an incomplete range and matches court as venue', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, court, session_place, created_at, updated_at)
       VALUES ('cs1', 'CS-00001', 'قضية 1', 'cl1', 'open', 'جنوب الجيزة', NULL, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, court, created_at, updated_at)
       VALUES ('cs2', 'CS-00002', 'قضية 2', 'cl1', 'open', 'شمال القاهرة', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, venue, status, created_at, updated_at)
       VALUES ('h1', 'cs1', '2026-10-08', 'موضوع', NULL, 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, venue, status, created_at, updated_at)
       VALUES ('h2', 'cs1', '2026-10-22', 'موضوع', NULL, 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, venue, status, created_at, updated_at)
       VALUES ('h3', 'cs2', '2026-10-10', 'موضوع', NULL, 'upcoming', ?, ?)`
    ).run(ts, ts)

    const { listHearings } = await import('../electron/main/services/hearings')
    const emptyRange = listHearings({ page: 1, pageSize: 50, filters: { range_empty: 1 } })
    expect(emptyRange.total).toBe(0)
    expect(emptyRange.rows).toHaveLength(0)

    const all = listHearings({ page: 1, pageSize: 50 })
    expect(all.total).toBe(3)

    const ranged = listHearings({
      page: 1,
      pageSize: 50,
      filters: { date_from: '2026-10-01', date_to: '2026-10-12', venue: 'جنوب الجيزة' }
    })
    expect(ranged.rows.map((r) => String(r.id))).toEqual(['h1'])

    const printAsc = listHearings({
      page: 1,
      pageSize: 50,
      print: true,
      sortBy: 'hearing_date',
      sortDir: 'asc'
    })
    expect(printAsc.rows.map((r) => String(r.hearing_date))).toEqual(['2026-10-08', '2026-10-10', '2026-10-22'])
  })

  it('lists the first page of a large hearings table quickly', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, court, created_at, updated_at)
       VALUES ('cs1', 'CS-00001', 'قضية 1', 'cl1', 'open', 'جنوب الجيزة', ?, ?)`
    ).run(ts, ts)
    const insert = db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, venue, status, court_decision, created_at, updated_at)
       VALUES (?, 'cs1', ?, 'موضوع', NULL, 'upcoming', ?, ?, ?)`
    )
    db.transaction(() => {
      for (let i = 0; i < 8000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0')
        insert.run(`h${i}`, `2026-09-${day}`, i % 3 === 0 ? `جلسة ${day}/10` : 'مرافعة', ts, ts)
      }
    })()
    const { listHearings } = await import('../electron/main/services/hearings')
    const started = Date.now()
    const listed = listHearings({ page: 1, pageSize: 10 })
    expect(Date.now() - started).toBeLessThan(750)
    expect(listed.total).toBe(8000)
    expect(listed.rows).toHaveLength(10)
    expect(String(listed.rows[0].previous_decision || '')).not.toMatch(/^\d{1,2}$/)
  }, 20000)
})
