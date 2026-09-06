import { describe, expect, it, afterEach } from 'vitest'
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

describe.skipIf(!sqliteAvailable())('sqlite repair', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot(file: string) {
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(file)
  }

  it('rebuilds stale cases FTS so updates succeed', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-repair-'))
    const file = path.join(dir, 't.db')
    const db = await boot(file)
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('p1', 'CL-0001', 'موكل', 'individual', ts, ts)
    db.prepare(
      `INSERT INTO cases (id, office_case_number, case_number, title, category, client_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('c1', '1', '1/2026', 'قضية', 'مدني', 'p1', 'open', ts, ts)
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()

    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const raw = new Database(file)
    raw.exec(`
      DROP TRIGGER IF EXISTS cases_fts_ai;
      DROP TRIGGER IF EXISTS cases_fts_ad;
      DROP TRIGGER IF EXISTS cases_fts_au;
      DROP TABLE IF EXISTS cases_fts;
      CREATE VIRTUAL TABLE cases_fts USING fts5(
        title, category, case_number, opponent_name,
        content='cases', content_rowid='rowid', tokenize='unicode61'
      );
      CREATE TRIGGER cases_fts_au AFTER UPDATE ON cases BEGIN
        INSERT INTO cases_fts(cases_fts, rowid, title, category, case_number, office_case_number, opponent_name)
        VALUES ('delete', old.rowid, old.title, old.category, old.case_number, old.office_case_number, old.opponent_name);
        INSERT INTO cases_fts(rowid, title, category, case_number, office_case_number, opponent_name)
        VALUES (new.rowid, new.title, new.category, new.case_number, new.office_case_number, new.opponent_name);
      END;
    `)
    raw.close()

    const db2 = await boot(file)
    expect(() => {
      db2.prepare(`UPDATE cases SET title = ?, updated_at = ? WHERE id = ?`).run('قضية معدلة', ts, 'c1')
    }).not.toThrow()
    const row = db2.prepare(`SELECT title FROM cases WHERE id = ?`).get('c1') as { title: string }
    expect(row.title).toBe('قضية معدلة')
    const cols = (db2.prepare(`PRAGMA table_info(cases_fts)`).all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('office_case_number')
    expect(() => {
      db2.prepare(`INSERT INTO lawyers (id, full_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        'l1',
        'محامي',
        'active',
        ts,
        ts
      )
      db2.prepare(`UPDATE lawyers SET full_name = ?, updated_at = ? WHERE id = ?`).run('محامي معدل', ts, 'l1')
    }).not.toThrow()
  })

  it('rebuilds clients FTS so client updates succeed', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-repair-'))
    const file = path.join(dir, 't.db')
    const db = await boot(file)
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, nickname, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('p1', 'CL-0001', 'موكل', 'كنية', ts, ts)
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()

    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const raw = new Database(file)
    raw.exec(`
      DROP TRIGGER IF EXISTS clients_fts_ai;
      DROP TRIGGER IF EXISTS clients_fts_ad;
      DROP TRIGGER IF EXISTS clients_fts_au;
      DROP TABLE IF EXISTS clients_fts;
      CREATE VIRTUAL TABLE clients_fts USING fts5(
        full_name, client_number,
        content='clients', content_rowid='rowid', tokenize='unicode61'
      );
      CREATE TRIGGER clients_fts_au AFTER UPDATE ON clients BEGIN
        INSERT INTO clients_fts(clients_fts, rowid, full_name, nickname, client_number)
        VALUES ('delete', old.rowid, old.full_name, old.nickname, old.client_number);
        INSERT INTO clients_fts(rowid, full_name, nickname, client_number)
        VALUES (new.rowid, new.full_name, new.nickname, new.client_number);
      END;
    `)
    raw.close()

    const db2 = await boot(file)
    expect(() => {
      db2.prepare(`UPDATE clients SET full_name = ?, updated_at = ? WHERE id = ?`).run('موكل معدل', ts, 'p1')
    }).not.toThrow()
    const row = db2.prepare(`SELECT full_name FROM clients WHERE id = ?`).get('p1') as { full_name: string }
    expect(row.full_name).toBe('موكل معدل')
  })

  it('maps the sqlite malformed error to Arabic', async () => {
    const { mapDbError } = await import('../electron/main/utils/errors')
    const mapped = mapDbError(new Error('SqliteError: database disk image is malformed'))
    expect(mapped.message).toMatch(/قاعدة البيانات/)
  })
})
