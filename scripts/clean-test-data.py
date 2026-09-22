"""Wipe local test data and the same business rows on Supabase.

   python scripts/clean-test-data.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEEP = {
    "users",
    "roles",
    "permissions",
    "role_permissions",
    "user_permissions",
    "settings",
    "case_types",
    "expense_categories",
    "number_sequences",
    "cashboxes",
    "sessions",
    "lookup_values",
}
KEEP_REMOTE = KEEP - {"sessions"}
DB = Path(os.environ.get("APPDATA", "")) / "law-office-management" / "LawOfficeManagement" / "lawoffice.db"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for name in (".env", ".env.local"):
        p = ROOT / name
        if not p.exists():
            continue
        for raw in p.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            env.setdefault(k.strip(), v)
    return env


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def wipe_local(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    for name in (
        "cases_fts_ai",
        "cases_fts_ad",
        "cases_fts_au",
        "clients_fts_ai",
        "clients_fts_ad",
        "clients_fts_au",
    ):
        cur.execute(f"DROP TRIGGER IF EXISTS {name}")
    tables = [
        r[0]
        for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    cur.execute("PRAGMA foreign_keys = OFF")
    for t in tables:
        if t in KEEP or "_fts" in t:
            continue
        try:
            cur.execute(f'DELETE FROM "{t}"')
        except sqlite3.DatabaseError as err:
            print("skip", t, err)
    cur.execute("DELETE FROM local_sync_queue")
    cur.execute(
        "DELETE FROM user_permissions WHERE user_id NOT IN (SELECT id FROM users WHERE lower(username) = 'admin')"
    )
    cur.execute(
        "DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users WHERE lower(username) = 'admin')"
    )
    cur.execute("DELETE FROM users WHERE lower(username) != 'admin'")
    cur.execute("UPDATE number_sequences SET current_value = 0")
    cur.execute("UPDATE number_sequences SET current_value = 7000 WHERE name = 'case'")
    cur.execute("DELETE FROM settings WHERE key = 'sync_disabled'")
    cur.execute("UPDATE cashboxes SET current_balance = 0")
    ts = now_iso()
    cur.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('sync_last_pulled_at', ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (ts, ts),
    )
    cur.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('sync_parents_bootstrapped', '0', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at",
        (ts,),
    )
    cur.execute("DELETE FROM local_sync_queue")
    conn.commit()
    cur.execute("PRAGMA foreign_keys = ON")


def setting(conn: sqlite3.Connection, key: str) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return (row[0] or "").strip() if row else ""


def rest_delete(url: str, key: str, table: str, pk: str) -> str | None:
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}?{pk}=not.is.null"
    req = urllib.request.Request(endpoint, method="DELETE")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Prefer", "return=minimal")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()
        return None
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "ignore")[:200]
        return f"{table}: {err.code} {body}"


def wipe_remote(url: str, key: str) -> dict:
    tables = [
        "invoice_items",
        "document_versions",
        "case_clients",
        "case_opponents",
        "case_links",
        "case_fees",
        "case_dues",
        "cashbox_transactions",
        "payments",
        "receipts",
        "vouchers",
        "invoices",
        "expenses",
        "hearings",
        "expert_hearings",
        "appointments",
        "tasks",
        "reminders",
        "notifications",
        "documents",
        "client_contacts",
        "power_of_attorney",
        "contracts",
        "consultations",
        "correspondence",
        "attendance",
        "leaves",
        "cases",
        "clients",
        "opponents",
        "lawyers",
        "employees",
        "audit_logs",
    ]
    errors: list[str] = []
    deleted: list[str] = []
    for _ in range(4):
        failed = 0
        for table in tables:
            err = rest_delete(url, key, table, "id")
            if err:
                failed += 1
                if err not in errors:
                    errors.append(err)
            elif table not in deleted:
                deleted.append(table)
        if failed == 0:
            break
    return {"deleted": deleted, "errors": errors}


def counts(conn: sqlite3.Connection) -> dict:
    cur = conn.cursor()
    def n(sql: str) -> int:
        return int(cur.execute(sql).fetchone()[0])
    seq = cur.execute("SELECT current_value FROM number_sequences WHERE name = 'case'").fetchone()
    return {
        "clients": n("SELECT COUNT(*) FROM clients"),
        "cases": n("SELECT COUNT(*) FROM cases"),
        "lookups": n("SELECT COUNT(*) FROM lookup_values WHERE deleted_at IS NULL"),
        "queue": n("SELECT COUNT(*) FROM local_sync_queue"),
        "users": n("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"),
        "case_seq": seq[0] if seq else None,
    }


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"database not found: {DB}")
    env = load_env()
    conn = sqlite3.connect(str(DB))
    try:
        wipe_local(conn)
        url = setting(conn, "supabase_url") or env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or ""
        key = setting(conn, "supabase_anon_key") or env.get("SUPABASE_ANON_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or ""
        remote = {"deleted": [], "errors": ["missing supabase credentials"]}
        if url and key and key != "********":
            remote = wipe_remote(url, key)
        print(json.dumps({"root": str(DB.parent), "local": counts(conn), "remote": remote}, ensure_ascii=False, indent=2))
    finally:
        conn.close()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "repair-fts.py")], check=False)


if __name__ == "__main__":
    main()
