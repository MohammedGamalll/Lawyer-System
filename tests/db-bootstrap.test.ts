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

describe.skipIf(!sqliteAvailable())('database bootstrap', () => {
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

  it('initializes a fresh database twice', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-boot-'))
    const file = path.join(dir, 't.db')
    const db = await boot(file)
    expect((db.prepare('SELECT COUNT(*) as c FROM permissions').get() as { c: number }).c).toBeGreaterThan(0)
    expect((db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c).toBeGreaterThan(0)
    const db2 = await boot(file)
    expect((db2.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c).toBeGreaterThan(0)
  })

  it('recovers when permissions exist without roles', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-boot-'))
    const file = path.join(dir, 't.db')
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const raw = new Database(file)
    raw.exec(`
      CREATE TABLE permissions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name_ar TEXT, name_en TEXT, module TEXT,
        created_at TEXT, updated_at TEXT, deleted_at TEXT
      );
      INSERT INTO permissions (id, code, name_ar, name_en, module, created_at, updated_at)
      VALUES ('p1', 'cases.view', 'عرض', 'view', 'cases', 't', 't');
    `)
    raw.close()
    const db = await boot(file)
    expect((db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c).toBeGreaterThan(0)
    expect(db.prepare('SELECT id FROM permissions WHERE code = ?').get('cases.view')).toBeTruthy()
  })

  it('adds nickname on a legacy clients table then starts', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-boot-'))
    const file = path.join(dir, 't.db')
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const raw = new Database(file)
    raw.exec(`
      CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        client_number TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `)
    raw.close()
    const db = await boot(file)
    const cols = (db.prepare('PRAGMA table_info(clients)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('nickname')
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, nickname, created_at, updated_at) VALUES (?,?,?,?,?,?)`
    ).run('c1', 'CL-0001', 'عميل', 'كنية', 't', 't')
    expect((db.prepare('SELECT nickname FROM clients WHERE id = ?').get('c1') as { nickname: string }).nickname).toBe(
      'كنية'
    )
  })
})
