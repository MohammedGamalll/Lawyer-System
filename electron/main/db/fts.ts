import type Database from 'better-sqlite3'
import log from 'electron-log'

const FTS_TRIGGERS = [
  'cases_fts_ai',
  'cases_fts_ad',
  'cases_fts_au',
  'clients_fts_ai',
  'clients_fts_ad',
  'clients_fts_au'
] as const

const CASES_FTS_COLS = ['title', 'category', 'case_number', 'office_case_number', 'opponent_name'] as const
const CLIENTS_FTS_COLS = ['full_name', 'nickname', 'client_number'] as const

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column)
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare(`SELECT 1 as x FROM sqlite_master WHERE type IN ('table','view') AND name = ?`).get(name)
  )
}

function ftsHasColumns(db: Database.Database, table: string, cols: readonly string[]): boolean {
  try {
    if (!tableExists(db, table)) return false
    const names = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    )
    return cols.every((c) => names.has(c))
  } catch {
    return false
  }
}

function ftsIntegrityOk(db: Database.Database, name: string): boolean {
  if (!tableExists(db, name)) return false
  try {
    db.prepare(`INSERT INTO ${name}(${name}) VALUES('integrity-check')`).run()
    return true
  } catch {
    return false
  }
}

export function dropFtsTriggers(db: Database.Database): void {
  for (const name of FTS_TRIGGERS) {
    db.exec(`DROP TRIGGER IF EXISTS ${name}`)
  }
}

function forceDropFtsTable(db: Database.Database, name: string): void {
  dropFtsTriggers(db)
  try {
    db.exec(`DROP TABLE IF EXISTS ${name}`)
    return
  } catch (err) {
    log.warn('drop fts table failed', name, err)
  }
  try {
    db.pragma('writable_schema = ON')
    db.prepare(`DELETE FROM sqlite_master WHERE name = ? OR name LIKE ?`).run(name, `${name}_%`)
    db.pragma('writable_schema = OFF')
  } catch (err) {
    log.warn('force drop fts schema failed', name, err)
  }
}

function createFtsObjects(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(
      title, category, case_number, office_case_number, opponent_name,
      content='cases', content_rowid='rowid', tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
      full_name, nickname, client_number,
      content='clients', content_rowid='rowid', tokenize='unicode61'
    );
    DROP TRIGGER IF EXISTS cases_fts_ai;
    DROP TRIGGER IF EXISTS cases_fts_ad;
    DROP TRIGGER IF EXISTS cases_fts_au;
    DROP TRIGGER IF EXISTS clients_fts_ai;
    DROP TRIGGER IF EXISTS clients_fts_ad;
    DROP TRIGGER IF EXISTS clients_fts_au;
    CREATE TRIGGER cases_fts_ai AFTER INSERT ON cases BEGIN
      INSERT INTO cases_fts(rowid, title, category, case_number, office_case_number, opponent_name)
      VALUES (new.rowid, new.title, new.category, new.case_number, new.office_case_number, new.opponent_name);
    END;
    CREATE TRIGGER cases_fts_ad AFTER DELETE ON cases BEGIN
      INSERT INTO cases_fts(cases_fts, rowid, title, category, case_number, office_case_number, opponent_name)
      VALUES ('delete', old.rowid, old.title, old.category, old.case_number, old.office_case_number, old.opponent_name);
    END;
    CREATE TRIGGER cases_fts_au AFTER UPDATE ON cases BEGIN
      INSERT INTO cases_fts(cases_fts, rowid, title, category, case_number, office_case_number, opponent_name)
      VALUES ('delete', old.rowid, old.title, old.category, old.case_number, old.office_case_number, old.opponent_name);
      INSERT INTO cases_fts(rowid, title, category, case_number, office_case_number, opponent_name)
      VALUES (new.rowid, new.title, new.category, new.case_number, new.office_case_number, new.opponent_name);
    END;
    CREATE TRIGGER clients_fts_ai AFTER INSERT ON clients BEGIN
      INSERT INTO clients_fts(rowid, full_name, nickname, client_number)
      VALUES (new.rowid, new.full_name, new.nickname, new.client_number);
    END;
    CREATE TRIGGER clients_fts_ad AFTER DELETE ON clients BEGIN
      INSERT INTO clients_fts(clients_fts, rowid, full_name, nickname, client_number)
      VALUES ('delete', old.rowid, old.full_name, old.nickname, old.client_number);
    END;
    CREATE TRIGGER clients_fts_au AFTER UPDATE ON clients BEGIN
      INSERT INTO clients_fts(clients_fts, rowid, full_name, nickname, client_number)
      VALUES ('delete', old.rowid, old.full_name, old.nickname, old.client_number);
      INSERT INTO clients_fts(rowid, full_name, nickname, client_number)
      VALUES (new.rowid, new.full_name, new.nickname, new.client_number);
    END;
  `)
}

function rebuildFts(db: Database.Database, name: string): void {
  db.exec(`INSERT INTO ${name}(${name}) VALUES('rebuild')`)
}

export function ftsQuery(raw: string): string {
  const toks = String(raw || '')
    .replace(/['"^:*()]/g, ' ')
    .split(/\s+/)
    .filter((s) => s.trim().length >= 2)
  return toks.map((t) => `${t}*`).join(' AND ')
}

export function ensureFts(db: Database.Database, opts?: { forceRebuild?: boolean }): void {
  if (!hasColumn(db, 'clients', 'nickname')) {
    db.exec(`ALTER TABLE clients ADD COLUMN nickname TEXT`)
  }
  if (hasColumn(db, 'opponents', 'id') && !hasColumn(db, 'opponents', 'nickname')) {
    db.exec(`ALTER TABLE opponents ADD COLUMN nickname TEXT`)
  }

  const casesSchemaOk = ftsHasColumns(db, 'cases_fts', CASES_FTS_COLS)
  const clientsSchemaOk = ftsHasColumns(db, 'clients_fts', CLIENTS_FTS_COLS)
  const needCases =
    Boolean(opts?.forceRebuild) || !casesSchemaOk || (tableExists(db, 'cases_fts') && !ftsIntegrityOk(db, 'cases_fts'))
  const needClients =
    Boolean(opts?.forceRebuild) ||
    !clientsSchemaOk ||
    (tableExists(db, 'clients_fts') && !ftsIntegrityOk(db, 'clients_fts'))

  dropFtsTriggers(db)
  if (needCases) forceDropFtsTable(db, 'cases_fts')
  if (needClients) forceDropFtsTable(db, 'clients_fts')

  createFtsObjects(db)

  const rebuildOne = (name: string) => {
    try {
      rebuildFts(db, name)
    } catch (err) {
      log.warn('fts rebuild failed, recreating', name, err)
      forceDropFtsTable(db, name)
      createFtsObjects(db)
      rebuildFts(db, name)
    }
  }
  rebuildOne('cases_fts')
  rebuildOne('clients_fts')
}
