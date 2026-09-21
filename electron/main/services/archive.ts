/**
 * Standalone read-only viewer for the shipped legacy archive.
 *
 * Place (or regenerate) the SQLite file at:
 *   resources/archive.db
 * before `electron-builder`. Production reads it from process.resourcesPath.
 * Do not copy it into userData, do not open it via getDb(), and do not sync it.
 */
import fs from 'fs'
import path from 'path'
import type BetterSqlite3 from 'better-sqlite3'

const TABLE_OK = /^[\w\u0600-\u06FF]+$/u
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

let archiveDb: BetterSqlite3.Database | null = null
let archivePath: string | null = null
let missingMessage: string | null = null

function openSqlite(dbPath: string, opts: BetterSqlite3.Options): BetterSqlite3.Database {
  const req = eval('require') as NodeRequire
  const Database = req('better-sqlite3') as typeof BetterSqlite3
  return new Database(dbPath, opts)
}

export function getArchiveFilePath(): string {
  if (process.env.LAW_ARCHIVE_DB) return process.env.LAW_ARCHIVE_DB
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: { isPackaged?: boolean } }
    if (app?.isPackaged && process.resourcesPath) {
      return path.join(process.resourcesPath, 'archive.db')
    }
  } catch {
    /* unit tests / non-electron */
  }
  return path.join(process.cwd(), 'resources', 'archive.db')
}

export function closeArchive(): void {
  try {
    archiveDb?.close()
  } catch {
    /* ignore */
  }
  archiveDb = null
  archivePath = null
  missingMessage = null
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function connect(): BetterSqlite3.Database | null {
  const file = getArchiveFilePath()
  if (archiveDb && archivePath === file) return archiveDb
  closeArchive()
  if (!fs.existsSync(file)) {
    missingMessage = 'ملف أرشيف النظام القديم غير موجود. ضع archive.db في مجلد resources قبل البناء.'
    return null
  }
  try {
    archiveDb = openSqlite(file, { readonly: true, fileMustExist: true })
    archivePath = file
    missingMessage = null
    return archiveDb
  } catch (err) {
    missingMessage = err instanceof Error ? err.message : String(err)
    archiveDb = null
    archivePath = null
    return null
  }
}

export function listArchiveTables(): { tables: string[]; missing: boolean; error?: string } {
  const db = connect()
  if (!db) return { tables: [], missing: true, error: missingMessage || undefined }
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all() as { name: string }[]
  return { tables: rows.map((r) => r.name), missing: false }
}

function allowedTables(db: BetterSqlite3.Database): Set<string> {
  return new Set(listArchiveTables().tables)
}

function assertTable(db: BetterSqlite3.Database, tableName: string): string {
  const name = String(tableName || '')
  if (!TABLE_OK.test(name) || !allowedTables(db).has(name)) {
    throw new Error('جدول غير مسموح')
  }
  return name
}

function columnNames(db: BetterSqlite3.Database, table: string): string[] {
  const info = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[]
  return info.map((c) => c.name)
}

export type ArchiveTablePage = {
  columns: string[]
  rows: Record<string, string>[]
  total: number
  page: number
  limit: number
  missing: boolean
  error?: string
}

export function getArchiveTableData(
  tableName: string,
  page = 1,
  limit = DEFAULT_LIMIT,
  q = ''
): ArchiveTablePage {
  const db = connect()
  const empty: ArchiveTablePage = {
    columns: [],
    rows: [],
    total: 0,
    page: 1,
    limit: DEFAULT_LIMIT,
    missing: !db,
    error: missingMessage || undefined
  }
  if (!db) return empty

  const table = assertTable(db, tableName)
  const ident = quoteIdent(table)
  const cols = columnNames(db, table)
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT)))
  const term = String(q || '').trim()
  const params: unknown[] = []
  let where = ''
  if (term && cols.length) {
    where = ` WHERE ${cols.map((c) => `${quoteIdent(c)} LIKE ?`).join(' OR ')}`
    const like = `%${term}%`
    for (let i = 0; i < cols.length; i++) params.push(like)
  }
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ${ident}${where}`).get(...params) as { c: number }).c
  const offset = (safePage - 1) * safeLimit
  const raw = db.prepare(`SELECT * FROM ${ident}${where} LIMIT ? OFFSET ?`).all(...params, safeLimit, offset) as Record<
    string,
    unknown
  >[]
  const rows = raw.map((row) => {
    const out: Record<string, string> = {}
    for (const col of cols) {
      const v = row[col]
      out[col] = v == null ? '' : String(v)
    }
    return out
  })
  return { columns: cols, rows, total, page: safePage, limit: safeLimit, missing: false }
}
