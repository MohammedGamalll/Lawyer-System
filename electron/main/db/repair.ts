import fs from 'fs'
import type Database from 'better-sqlite3'

const CORRUPT_RE =
  /malformed|corrupt|SQLITE_CORRUPT|SQLITE_NOTADB|file is not a database|disk image/i

export function isCorruptError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.name}` : String(err)
  return CORRUPT_RE.test(msg)
}

export function sqliteSidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]
}

export function stripSqliteSidecars(dbPath: string): void {
  for (const p of sqliteSidecarPaths(dbPath)) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore locked sidecars */
    }
  }
}

export function integrityOk(db: Database.Database): boolean {
  try {
    const rows = db.pragma('quick_check') as unknown
    if (!Array.isArray(rows) || rows.length === 0) return true
    const first = rows[0] as { quick_check?: string } | string
    const text = typeof first === 'string' ? first : String(first?.quick_check ?? '')
    return text.toLowerCase() === 'ok'
  } catch {
    return false
  }
}

export function checkpointWal(db: Database.Database): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
}
