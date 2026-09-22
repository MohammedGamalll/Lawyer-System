import sqlite3
from pathlib import Path

DB = Path.home() / "AppData/Roaming/law-office-management/LawOfficeManagement/lawoffice.db"


def run(sql: str) -> None:
    conn = sqlite3.connect(str(DB))
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()


run(
    """
    DROP TRIGGER IF EXISTS cases_fts_ai;
    DROP TRIGGER IF EXISTS cases_fts_ad;
    DROP TRIGGER IF EXISTS cases_fts_au;
    DROP TRIGGER IF EXISTS clients_fts_ai;
    DROP TRIGGER IF EXISTS clients_fts_ad;
    DROP TRIGGER IF EXISTS clients_fts_au;
    PRAGMA writable_schema = ON;
    DELETE FROM sqlite_master WHERE name IN ('cases_fts','clients_fts')
      OR name LIKE 'cases_fts_%' OR name LIKE 'clients_fts_%';
    PRAGMA writable_schema = OFF;
    """
)

run(
    """
    CREATE VIRTUAL TABLE cases_fts USING fts5(
      title, category, case_number, office_case_number, opponent_name,
      content='cases', content_rowid='rowid', tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE clients_fts USING fts5(
      full_name, nickname, client_number,
      content='clients', content_rowid='rowid', tokenize='unicode61'
    );
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
    INSERT INTO cases_fts(cases_fts) VALUES('rebuild');
    INSERT INTO clients_fts(clients_fts) VALUES('rebuild');
    """
)

conn = sqlite3.connect(str(DB))
try:
    conn.execute("INSERT INTO cases_fts(cases_fts) VALUES('integrity-check')")
    conn.execute("INSERT INTO clients_fts(clients_fts) VALUES('integrity-check')")
    print("fts ok")
finally:
    conn.close()
