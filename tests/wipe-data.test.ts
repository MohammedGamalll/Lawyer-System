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

describe.skipIf(!sqliteAvailable())('wipe-data script', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-wipe-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase()
  }

  it('dry-run counts rows without deleting, --apply wipes tables and resets sequences to 0', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-0001', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs1', 'CS-00001', 'قضية', 'cl1', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(`UPDATE number_sequences SET current_value = 7000 WHERE name = 'case'`).run()
    db.prepare(
      `CREATE TABLE IF NOT EXISTS archive_migration_map (
        archive_key TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        live_id TEXT NOT NULL
      )`
    ).run()
    db.prepare(`INSERT INTO archive_migration_map (archive_key, table_name, live_id) VALUES ('Mas002:1', 'cases', 'cs1')`).run()

    const { runWipeData } = await import('../scripts/wipe-data')
    const dry = runWipeData({ dataRoot: dir, apply: false })
    expect(dry.dryRun).toBe(true)
    expect(dry.wiped).toBe(false)
    expect(dry.tables.find((t) => t.name === 'cases')?.rows).toBe(1)
    expect(dry.tables.find((t) => t.name === 'clients')?.rows).toBe(1)
    expect(dry.tables.find((t) => t.name === 'archive_migration_map')?.rows).toBe(1)
    expect(dry.sequences.find((s) => s.name === 'case')?.current_value).toBe(7000)

    const { initDatabase, closeDatabase, getDb } = await import('../electron/main/db/database')
    closeDatabase()
    initDatabase()
    expect((getDb().prepare(`SELECT COUNT(*) AS c FROM cases`).get() as { c: number }).c).toBe(1)
    expect(
      (getDb().prepare(`SELECT current_value FROM number_sequences WHERE name='case'`).get() as { current_value: number })
        .current_value
    ).toBe(7000)
    closeDatabase()

    const applied = runWipeData({ dataRoot: dir, apply: true })
    expect(applied.dryRun).toBe(false)
    expect(applied.wiped).toBe(true)
    expect(applied.tables.find((t) => t.name === 'cases')?.rows).toBe(0)
    expect(applied.tables.find((t) => t.name === 'clients')?.rows).toBe(0)
    expect(applied.tables.find((t) => t.name === 'hearings')?.rows).toBe(0)
    expect(applied.tables.find((t) => t.name === 'archive_migration_map')?.rows).toBe(0)
    expect(applied.sequences.every((s) => s.current_value === 0)).toBe(true)
    expect(applied.sequences.find((s) => s.name === 'case')?.current_value).toBe(0)

    closeDatabase()
    initDatabase()
    expect((getDb().prepare(`SELECT COUNT(*) AS c FROM cases`).get() as { c: number }).c).toBe(0)
    expect((getDb().prepare(`SELECT COUNT(*) AS c FROM users WHERE lower(username)='admin'`).get() as { c: number }).c).toBe(
      1
    )
    expect(
      (getDb().prepare(`SELECT current_value FROM number_sequences WHERE name='case'`).get() as { current_value: number })
        .current_value
    ).toBe(0)
  })
})
