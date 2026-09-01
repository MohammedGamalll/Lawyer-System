import type Database from 'better-sqlite3'

export function ftsQuery(raw: string): string {
  const toks = String(raw || '')
    .replace(/['"^:*()]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  return toks.map((t) => `${t}*`).join(' AND ')
}

export function ensureFts(db: Database.Database): void {
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
  const casesN = (db.prepare(`SELECT COUNT(*) as c FROM cases`).get() as { c: number }).c
  const casesFts = (db.prepare(`SELECT COUNT(*) as c FROM cases_fts`).get() as { c: number }).c
  if (casesN > 0 && casesFts === 0) db.exec(`INSERT INTO cases_fts(cases_fts) VALUES('rebuild')`)
  const clientsN = (db.prepare(`SELECT COUNT(*) as c FROM clients`).get() as { c: number }).c
  const clientsFts = (db.prepare(`SELECT COUNT(*) as c FROM clients_fts`).get() as { c: number }).c
  if (clientsN > 0 && clientsFts === 0) db.exec(`INSERT INTO clients_fts(clients_fts) VALUES('rebuild')`)
}
