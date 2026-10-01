/**
 * Copy clients, cases, and hearings from read-only archive.db into live lawoffice.db.
 * Never UPDATE existing live rows. Default is --dry-run; pass --apply to write.
 *
 *   npx tsx scripts/migrate-archive.ts
 *   npx tsx scripts/migrate-archive.ts --apply
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type BetterSqlite3 from 'better-sqlite3'

import { arabicFold } from '../shared/arabic'
import { SYNC_TABLES } from '../electron/main/db/schema'
import {
  archiveCaseRecnoFromHex,
  archiveCourtKeys,
  extractNationalId,
  hearingDedupeKey,
  hearingStatusForDate,
  isEmptyArchiveCase,
  liveCourtKeys,
  nextFreeProgramNumber,
  parseCourtPair,
  parseLegacyDate,
  partiesMatch,
  programCodeKey,
  yearFromLegacyDate
} from '../shared/archiveMigrate'

const BUSY_MSG = 'أغلق برنامج المكتب ثم أعد التشغيل'
const SYNC_SET = new Set<string>(SYNC_TABLES)
const CASE_SEQ_FLOOR = 7000

export type MigrateOptions = {
  archivePath?: string
  dbPath?: string
  apply?: boolean
  chunk?: number
  today?: string
}

export type MigrateReport = {
  dryRun: boolean
  backupPath: string | null
  archivePath: string
  dbPath: string
  clientsInserted: number
  clientsReused: number
  opponentsInserted: number
  opponentsReused: number
  typesInserted: number
  casesInserted: number
  casesReused: number
  casesSkippedEmpty: number
  hearingsInserted: number
  hearingsSkippedDedupe: number
  hearingsOrphan: number
  caseClientsInserted: number
  caseOpponentsInserted: number
  queueAdded: number
}

type SqliteDb = BetterSqlite3.Database
type ArchiveRow = Record<string, unknown>

function argValue(name: string, fallback = ''): string {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultDbPath(): string {
  if (process.env.LAW_DB_PATH) return process.env.LAW_DB_PATH
  if (process.env.LAW_DATA_ROOT) return path.join(process.env.LAW_DATA_ROOT, 'lawoffice.db')
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  return path.join(appData, 'law-office-management', 'LawOfficeManagement', 'lawoffice.db')
}

function defaultArchivePath(): string {
  if (process.env.LAW_ARCHIVE_DB) return process.env.LAW_ARCHIVE_DB
  return path.join(process.cwd(), 'resources', 'archive.db')
}

function openSqlite(file: string, opts: BetterSqlite3.Options = {}): SqliteDb {
  const Database = (globalThis as { require?: NodeRequire }).require
    ? ((globalThis as { require: NodeRequire }).require('better-sqlite3') as typeof import('better-sqlite3'))
    : ((eval('require') as NodeRequire)('better-sqlite3') as typeof import('better-sqlite3'))
  return new Database(file, opts)
}

function busyRetry<T>(fn: () => T): T {
  for (let i = 0; i < 80; i++) {
    try {
      return fn()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED') throw err
      const until = Date.now() + 250
      while (Date.now() < until) {
        /* wait */
      }
    }
  }
  throw new Error(BUSY_MSG)
}

class Chunked {
  private n = 0
  private open = false
  constructor(
    private db: SqliteDb,
    private every: number,
    private enabled: boolean
  ) {}
  begin(): void {
    if (!this.enabled) return
    if (!this.open) {
      busyRetry(() => this.db.exec('BEGIN'))
      this.open = true
    }
  }
  tick(): void {
    if (!this.enabled) return
    this.n += 1
    if (this.n >= this.every) this.commit(true)
  }
  commit(restart = false): void {
    if (!this.enabled) return
    if (this.open) {
      busyRetry(() => this.db.exec('COMMIT'))
      this.open = false
      this.n = 0
    }
    if (restart) this.begin()
  }
}

function backupDb(dbPath: string): string {
  const dir = path.join(path.dirname(dbPath), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `pre-archive-migrate-${Date.now()}.db`)
  fs.copyFileSync(dbPath, dest)
  return dest
}

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db.prepare(`SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?`).get(name) as
    | { x: number }
    | undefined
  return Boolean(row)
}

function hasColumn(db: SqliteDb, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function str(row: ArchiveRow, key: string): string {
  return String(row[key] ?? '').trim()
}

function pkColumn(tableName: string): string {
  if (tableName === 'settings') return 'key'
  if (tableName === 'number_sequences') return 'name'
  return 'id'
}

function mapCaseStatus(code: string): { status: string; archived: number } {
  const c = String(code || '').trim()
  if (c === '1') return { status: 'new', archived: 0 }
  if (c === '2') return { status: 'in_trial', archived: 0 }
  if (c === '3') return { status: 'execution', archived: 0 }
  if (c === '4') return { status: 'closed', archived: 1 }
  return { status: 'new', archived: 0 }
}

function caseDegreeFields(row: ArchiveRow) {
  const fallback = yearFromLegacyDate(row['وردت للمكتب']) || yearFromLegacyDate(row['تاريخ الرفع'])
  const first = parseCourtPair(row['رقم أول درجة'], fallback)
  const appeal = parseCourtPair(row['رقم الإستئناف'], fallback)
  const cass = parseCourtPair(row['رقم النقض'], fallback)
  const office = parseCourtPair(row['ترقيم أول'], fallback)
  return {
    first_instance_number: first?.number ?? null,
    first_instance_year: first?.year ?? null,
    appeal_number: appeal?.number ?? null,
    appeal_year: appeal?.year ?? null,
    cassation_number: cass?.number ?? null,
    cassation_year: cass?.year ?? null,
    office_case_number: office?.number ?? first?.number ?? null,
      case_year: office?.year ?? first?.year ?? (fallback || null)
  }
}

export function migrateArchive(opts: MigrateOptions = {}): MigrateReport {
  const apply = Boolean(opts.apply)
  const chunkSize = Math.max(1, Math.floor(opts.chunk || 500))
  const today = String(opts.today || todayIso()).slice(0, 10)
  const ts = nowIso()
  const archivePath = path.resolve(opts.archivePath || defaultArchivePath())
  const dbPath = path.resolve(opts.dbPath || defaultDbPath())

  if (!fs.existsSync(archivePath)) throw new Error(`ملف الأرشيف غير موجود: ${archivePath}`)
  if (!fs.existsSync(dbPath)) throw new Error(`قاعدة البيانات غير موجودة: ${dbPath}`)

  const report: MigrateReport = {
    dryRun: !apply,
    backupPath: null,
    archivePath,
    dbPath,
    clientsInserted: 0,
    clientsReused: 0,
    opponentsInserted: 0,
    opponentsReused: 0,
    typesInserted: 0,
    casesInserted: 0,
    casesReused: 0,
    casesSkippedEmpty: 0,
    hearingsInserted: 0,
    hearingsSkippedDedupe: 0,
    hearingsOrphan: 0,
    caseClientsInserted: 0,
    caseOpponentsInserted: 0,
    queueAdded: 0
  }

  if (apply) report.backupPath = backupDb(dbPath)

  let archive: SqliteDb | null = null
  let live: SqliteDb | null = null
  try {
    archive = busyRetry(() => openSqlite(archivePath, { readonly: true, fileMustExist: true }))
    live = busyRetry(() => openSqlite(dbPath))
    live.pragma('journal_mode = WAL')
    live.pragma('busy_timeout = 120000')
    live.pragma('foreign_keys = ON')

    const extraClients = hasColumn(live, 'clients', 'extra_data')
    const extraOpponents = hasColumn(live, 'opponents', 'extra_data')

    if (apply) {
      live.exec(`CREATE TABLE IF NOT EXISTS archive_migration_map (
        archive_key TEXT PRIMARY KEY,
        live_table TEXT NOT NULL,
        live_id TEXT NOT NULL
      )`)
    }

    const chunk = new Chunked(live, chunkSize, apply)
    chunk.begin()

    const enqueue = (tableName: string, recordId: string, operation: 'INSERT' | 'UPDATE') => {
      report.queueAdded += 1
      if (!apply) return
      if (!SYNC_SET.has(tableName) || !recordId) return
      const pk = pkColumn(tableName)
      const raw = live!.prepare(`SELECT * FROM ${tableName} WHERE ${pk} = ?`).get(recordId)
      live!.prepare('DELETE FROM local_sync_queue WHERE table_name = ? AND record_id = ?').run(tableName, recordId)
      live!
        .prepare(
          `INSERT INTO local_sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (?,?,?,?,?,?)`
        )
        .run(randomUUID(), tableName, recordId, operation, JSON.stringify(raw ?? {}), Date.now())
      chunk.tick()
    }

    const saveMap = (archiveKey: string, liveTable: string, liveId: string) => {
      if (!apply || !archiveKey || !liveId) return
      live!
        .prepare(
          `INSERT INTO archive_migration_map (archive_key, live_table, live_id) VALUES (?,?,?)
           ON CONFLICT(archive_key) DO UPDATE SET live_table=excluded.live_table, live_id=excluded.live_id`
        )
        .run(archiveKey, liveTable, liveId)
      chunk.tick()
    }

    const clientByNid = new Map<string, string>()
    const clientByName = new Map<string, string>()
    const opponentByName = new Map<string, string>()
    const typeByName = new Map<string, string>()
    const lawyerByName = new Map<string, string>()
    const lawyerBySaljas = new Map<string, string>()
    const caseByKey = new Map<string, string>()
    const courtToCases = new Map<string, string[]>()
    const adoptedLiveCases = new Set<string>()
    const liveParties = new Map<string, { clients: string[]; opponents: string[] }>()
    const occupiedCaseCodes = new Set<string>()
    const occupiedClientCodes = new Set<string>()
    const caseClientLinks = new Set<string>()
    const caseOpponentLinks = new Set<string>()
    const hearingsByCase = new Map<string, Set<string>>()
    const countedClients = new Set<string>()
    const countedOpponents = new Set<string>()
    const nidByFold = new Map<string, string>()

    for (const r of live.prepare(`SELECT id, full_name, national_id FROM clients WHERE deleted_at IS NULL`).all() as {
      id: string
      full_name: string
      national_id: string | null
    }[]) {
      const fold = arabicFold(r.full_name)
      if (fold && !clientByName.has(fold)) clientByName.set(fold, r.id)
      const nid = extractNationalId(r.national_id)
      if (nid && !clientByNid.has(nid)) clientByNid.set(nid, r.id)
    }
    for (const r of live.prepare(`SELECT client_number FROM clients`).all() as { client_number: string }[]) {
      const key = programCodeKey(r.client_number)
      if (key) occupiedClientCodes.add(key)
    }
    for (const r of live.prepare(`SELECT id, full_name FROM opponents WHERE deleted_at IS NULL`).all() as {
      id: string
      full_name: string
    }[]) {
      const fold = arabicFold(r.full_name)
      if (fold && !opponentByName.has(fold)) opponentByName.set(fold, r.id)
    }
    for (const r of live.prepare(`SELECT id, name_ar FROM case_types WHERE deleted_at IS NULL`).all() as {
      id: string
      name_ar: string
    }[]) {
      const fold = arabicFold(r.name_ar)
      if (fold && !typeByName.has(fold)) typeByName.set(fold, r.id)
    }
    for (const r of live.prepare(`SELECT id, full_name, notes FROM lawyers WHERE deleted_at IS NULL`).all() as {
      id: string
      full_name: string
      notes: string | null
    }[]) {
      const fold = arabicFold(r.full_name)
      if (fold && !lawyerByName.has(fold)) lawyerByName.set(fold, r.id)
      const m = String(r.notes || '').match(/saljas_lawyer:(\S+)/)
      if (m) lawyerBySaljas.set(m[1], r.id)
    }
    for (const r of live
      .prepare(
        `SELECT cs.id, cs.case_number, cs.opponent_name, cs.first_instance_number, cs.first_instance_year,
                cs.appeal_number, cs.appeal_year, cs.cassation_number, cs.cassation_year,
                cs.office_case_number, cs.case_year, cl.full_name AS client_name
         FROM cases cs
         LEFT JOIN clients cl ON cl.id = cs.client_id AND cl.deleted_at IS NULL
         WHERE cs.deleted_at IS NULL`
      )
      .all() as Array<CourtLiveRow & { opponent_name?: string | null; client_name?: string | null }>) {
      const key = programCodeKey(r.case_number)
      if (key) occupiedCaseCodes.add(key)
      const parties = liveParties.get(r.id) ?? { clients: [], opponents: [] }
      if (r.client_name) parties.clients.push(r.client_name)
      if (r.opponent_name) parties.opponents.push(r.opponent_name)
      liveParties.set(r.id, parties)
      for (const ck of liveCourtKeys(r)) {
        const list = courtToCases.get(ck) ?? []
        if (!list.includes(r.id)) list.push(r.id)
        courtToCases.set(ck, list)
      }
    }
    for (const r of live
      .prepare(
        `SELECT co.case_id, o.full_name
         FROM case_opponents co
         JOIN opponents o ON o.id = co.opponent_id
         WHERE co.deleted_at IS NULL AND o.deleted_at IS NULL`
      )
      .all() as { case_id: string; full_name: string }[]) {
      const parties = liveParties.get(r.case_id)
      if (!parties) continue
      parties.opponents.push(r.full_name)
    }
    for (const r of live.prepare(`SELECT case_number FROM cases`).all() as { case_number: string }[]) {
      const key = programCodeKey(r.case_number)
      if (key) occupiedCaseCodes.add(key)
    }
    for (const r of live.prepare(`SELECT case_id, client_id FROM case_clients WHERE deleted_at IS NULL`).all() as {
      case_id: string
      client_id: string
    }[]) {
      caseClientLinks.add(`${r.case_id}|${r.client_id}`)
    }
    for (const r of live.prepare(`SELECT case_id, opponent_id FROM case_opponents WHERE deleted_at IS NULL`).all() as {
      case_id: string
      opponent_id: string
    }[]) {
      caseOpponentLinks.add(`${r.case_id}|${r.opponent_id}`)
    }
    for (const r of live
      .prepare(
        `SELECT case_id, hearing_date, IFNULL(court_decision,'') AS d, IFNULL(what_happened,'') AS w
         FROM hearings WHERE deleted_at IS NULL`
      )
      .all() as { case_id: string; hearing_date: string; d: string; w: string }[]) {
      const set = hearingsByCase.get(r.case_id) ?? new Set<string>()
      set.add(hearingDedupeKey(r.hearing_date, r.d || r.w))
      hearingsByCase.set(r.case_id, set)
    }

    if (apply && tableExists(live, 'archive_migration_map')) {
      for (const r of live.prepare(`SELECT archive_key, live_table, live_id FROM archive_migration_map`).all() as {
        archive_key: string
        live_table: string
        live_id: string
      }[]) {
        if (r.live_table === 'cases') {
          const hit = live.prepare(`SELECT id FROM cases WHERE id=? AND deleted_at IS NULL`).get(r.live_id) as
            | { id: string }
            | undefined
          if (hit) caseByKey.set(r.archive_key, hit.id)
        }
        if (r.live_table === 'clients') {
          const hit = live.prepare(`SELECT id FROM clients WHERE id=? AND deleted_at IS NULL`).get(r.live_id) as
            | { id: string }
            | undefined
          if (hit) {
            if (r.archive_key.startsWith('client:nid:')) clientByNid.set(r.archive_key.slice('client:nid:'.length), hit.id)
            if (r.archive_key.startsWith('client:fold:')) clientByName.set(r.archive_key.slice('client:fold:'.length), hit.id)
          }
        }
      }
    }

    const clientSeq = live.prepare(`SELECT prefix, current_value, padding FROM number_sequences WHERE name='client'`).get() as
      | { prefix: string; current_value: number; padding: number }
      | undefined
    const caseSeq = live.prepare(`SELECT prefix, current_value, padding FROM number_sequences WHERE name='case'`).get() as
      | { prefix: string; current_value: number; padding: number }
      | undefined
    const clientPrefix = clientSeq?.prefix || 'CL-'
    const clientPad = clientSeq?.padding ?? 4
    const casePrefix = caseSeq?.prefix || 'CS-'
    const casePad = caseSeq?.padding ?? 5
    let maxClientN = 0
    let maxCaseN = 0
    let typeSort =
      (
        live.prepare(`SELECT IFNULL(MAX(sort_order), 0) AS m FROM case_types`).get() as { m: number }
      ).m || 0

    const allocClientCode = () => {
      const next = nextFreeProgramNumber(occupiedClientCodes, 1, clientPrefix, clientPad)
      occupiedClientCodes.add(programCodeKey(next.code))
      maxClientN = Math.max(maxClientN, next.n)
      return next.code
    }
    const allocCaseCode = () => {
      const next = nextFreeProgramNumber(occupiedCaseCodes, 1, casePrefix, casePad)
      occupiedCaseCodes.add(programCodeKey(next.code))
      maxCaseN = Math.max(maxCaseN, next.n)
      return next.code
    }

    const noteClient = (id: string, created: boolean) => {
      if (countedClients.has(id)) return
      countedClients.add(id)
      if (created) report.clientsInserted += 1
      else report.clientsReused += 1
    }
    const noteOpponent = (id: string, created: boolean) => {
      if (countedOpponents.has(id)) return
      countedOpponents.add(id)
      if (created) report.opponentsInserted += 1
      else report.opponentsReused += 1
    }

    const findOrCreateClient = (nameRaw: string, extra: string, archiveTag: string): string | null => {
      const name = nameRaw.trim()
      if (!name) return null
      const fold = arabicFold(name)
      const nid = extractNationalId(extra) || (fold ? nidByFold.get(fold) || '' : '')
      if (nid && clientByNid.has(nid)) {
        const id = clientByNid.get(nid)!
        noteClient(id, false)
        if (fold && !clientByName.has(fold)) clientByName.set(fold, id)
        saveMap(`client:nid:${nid}`, 'clients', id)
        if (fold) saveMap(`client:fold:${fold}`, 'clients', id)
        return id
      }
      if (fold && clientByName.has(fold)) {
        const id = clientByName.get(fold)!
        noteClient(id, false)
        if (nid && !clientByNid.has(nid)) clientByNid.set(nid, id)
        saveMap(`client:fold:${fold}`, 'clients', id)
        if (nid) saveMap(`client:nid:${nid}`, 'clients', id)
        return id
      }
      const id = randomUUID()
      const code = allocClientCode()
      noteClient(id, true)
      if (fold) clientByName.set(fold, id)
      if (nid) clientByNid.set(nid, id)
      if (apply) {
        if (extraClients) {
          live!
            .prepare(
              `INSERT INTO clients (id, client_number, full_name, national_id, extra_data, client_type, id_kind, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)`
            )
            .run(id, code, name, nid || null, archiveTag || null, 'individual', 'national_id', ts, ts)
        } else {
          live!
            .prepare(
              `INSERT INTO clients (id, client_number, full_name, national_id, client_type, id_kind, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)`
            )
            .run(id, code, name, nid || null, 'individual', 'national_id', ts, ts)
        }
        chunk.tick()
      }
      enqueue('clients', id, 'INSERT')
      if (nid) saveMap(`client:nid:${nid}`, 'clients', id)
      if (fold) saveMap(`client:fold:${fold}`, 'clients', id)
      return id
    }

    const findOrCreateOpponent = (nameRaw: string, extra: string, archiveTag: string): string | null => {
      const name = nameRaw.trim()
      if (!name) return null
      const fold = arabicFold(name)
      if (fold && opponentByName.has(fold)) {
        const id = opponentByName.get(fold)!
        noteOpponent(id, false)
        saveMap(`opponent:fold:${fold}`, 'opponents', id)
        return id
      }
      const id = randomUUID()
      noteOpponent(id, true)
      if (fold) opponentByName.set(fold, id)
      if (apply) {
        if (extraOpponents) {
          live!
            .prepare(`INSERT INTO opponents (id, full_name, extra_data, created_at, updated_at) VALUES (?,?,?,?,?)`)
            .run(id, name, archiveTag || extra || null, ts, ts)
        } else {
          live!.prepare(`INSERT INTO opponents (id, full_name, created_at, updated_at) VALUES (?,?,?,?)`).run(id, name, ts, ts)
        }
        chunk.tick()
      }
      enqueue('opponents', id, 'INSERT')
      if (fold) saveMap(`opponent:fold:${fold}`, 'opponents', id)
      return id
    }

    const findOrCreateType = (nameRaw: string): string | null => {
      const name = nameRaw.trim()
      if (!name) return null
      const fold = arabicFold(name)
      if (fold && typeByName.has(fold)) return typeByName.get(fold)!
      const id = randomUUID()
      typeSort += 1
      report.typesInserted += 1
      if (fold) typeByName.set(fold, id)
      if (apply) {
        live!
          .prepare(
            `INSERT INTO case_types (id, name_ar, name_en, is_active, sort_order, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?)`
          )
          .run(id, name, name, 1, typeSort, ts, ts)
        chunk.tick()
      }
      enqueue('case_types', id, 'INSERT')
      if (fold) saveMap(`type:fold:${fold}`, 'case_types', id)
      return id
    }

    const matchLawyer = (raw: string): string | null => {
      const name = raw.trim()
      if (!name || name === '0') return null
      const fold = arabicFold(name)
      if (fold && lawyerByName.has(fold)) return lawyerByName.get(fold)!
      if (lawyerBySaljas.has(name)) return lawyerBySaljas.get(name)!
      return null
    }

    const linkCaseClient = (
      caseId: string,
      clientId: string,
      caps: { first: string; appeal: string; cass: string }
    ) => {
      const key = `${caseId}|${clientId}`
      if (caseClientLinks.has(key)) return
      caseClientLinks.add(key)
      report.caseClientsInserted += 1
      const id = randomUUID()
      if (apply) {
        live!
          .prepare(
            `INSERT OR IGNORE INTO case_clients
            (id, case_id, client_id, is_primary, capacity_first, capacity_appeal, capacity_cassation, sort_order, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
          )
          .run(id, caseId, clientId, 1, caps.first || null, caps.appeal || null, caps.cass || null, 0, ts, ts)
        chunk.tick()
        const row = live!.prepare(`SELECT id FROM case_clients WHERE case_id=? AND client_id=?`).get(caseId, clientId) as
          | { id: string }
          | undefined
        if (row) enqueue('case_clients', row.id, 'INSERT')
        return
      }
      enqueue('case_clients', id, 'INSERT')
    }

    const linkCaseOpponent = (caseId: string, opponentId: string) => {
      const key = `${caseId}|${opponentId}`
      if (caseOpponentLinks.has(key)) return
      caseOpponentLinks.add(key)
      report.caseOpponentsInserted += 1
      const id = randomUUID()
      if (apply) {
        live!
          .prepare(
            `INSERT OR IGNORE INTO case_opponents (id, case_id, opponent_id, sort_order, created_at, updated_at)
           VALUES (?,?,?,?,?,?)`
          )
          .run(id, caseId, opponentId, 0, ts, ts)
        chunk.tick()
        const row = live!.prepare(`SELECT id FROM case_opponents WHERE case_id=? AND opponent_id=?`).get(caseId, opponentId) as
          | { id: string }
          | undefined
        if (row) enqueue('case_opponents', row.id, 'INSERT')
        return
      }
      enqueue('case_opponents', id, 'INSERT')
    }

    const rememberNid = (nameRaw: string, extra: string) => {
      const fold = arabicFold(nameRaw)
      const nid = extractNationalId(extra)
      if (fold && nid && !nidByFold.has(fold)) nidByFold.set(fold, nid)
    }

    if (tableExists(archive, 'الموكلين')) {
      const clients = archive.prepare(`SELECT * FROM ${quoteIdent('الموكلين')}`).all() as ArchiveRow[]
      for (const row of clients) rememberNid(str(row, 'اسم_الموكل'), str(row, 'بيانات_الجهة'))
    }

    const cases = tableExists(archive, 'القضايا')
      ? (archive.prepare(`SELECT * FROM ${quoteIdent('القضايا')}`).all() as ArchiveRow[])
      : []
    for (const row of cases) rememberNid(str(row, 'الجهة_الموكل'), str(row, 'بيانات الجهة'))

    if (tableExists(archive, 'الموكلين')) {
      const clients = archive.prepare(`SELECT * FROM ${quoteIdent('الموكلين')}`).all() as ArchiveRow[]
      for (const row of clients) {
        const name = str(row, 'اسم_الموكل')
        const extra = str(row, 'بيانات_الجهة')
        const office = str(row, 'اول_مكتب')
        const recno = str(row, 'اول_رقم_سجل')
        findOrCreateClient(name, extra, office && recno ? `archive:${office}:${recno}` : '')
      }
    }

    const canAdoptLiveCase = (liveId: string, row: ArchiveRow): boolean => {
      if (!liveId || adoptedLiveCases.has(liveId)) return false
      const parties = liveParties.get(liveId)
      return partiesMatch(str(row, 'الجهة_الموكل'), str(row, 'إسم الخصم'), parties?.clients ?? [], parties?.opponents ?? [])
    }

    for (const row of cases) {
      const office = str(row, 'المكتب') || 'Mas002'
      const recno = str(row, 'رقم_السجل')
      const archiveKey = `${office}:${recno}`
      if (isEmptyArchiveCase(row)) {
        report.casesSkippedEmpty += 1
        continue
      }
      const clientId = findOrCreateClient(
        str(row, 'الجهة_الموكل'),
        str(row, 'بيانات الجهة'),
        `archive:${archiveKey}`
      )
      if (!clientId) {
        report.casesSkippedEmpty += 1
        continue
      }

      let caseId = caseByKey.get(archiveKey)
      if (caseId && !canAdoptLiveCase(caseId, row)) caseId = undefined
      if (!caseId) {
        for (const ck of archiveCourtKeys(row)) {
          for (const hit of courtToCases.get(ck) ?? []) {
            if (canAdoptLiveCase(hit, row)) {
              caseId = hit
              break
            }
          }
          if (caseId) break
        }
      }

      if (caseId) {
        report.casesReused += 1
        adoptedLiveCases.add(caseId)
        caseByKey.set(archiveKey, caseId)
        saveMap(archiveKey, 'cases', caseId)
      } else {
        caseId = randomUUID()
        const degrees = caseDegreeFields(row)
        const title = str(row, 'موضوع الدعوى') || (str(row, 'المحكمة') ? `قضية ${str(row, 'المحكمة')}` : `قضية ${archiveKey}`)
        const { status, archived } = mapCaseStatus(str(row, 'وضع الملف'))
        const typeId = findOrCreateType(str(row, 'نوع القضية'))
        const code = allocCaseCode()
        report.casesInserted += 1
        caseByKey.set(archiveKey, caseId)
        if (apply) {
          live!
            .prepare(
              `INSERT INTO cases (
                 id, case_number, office_case_number, case_year, title, client_id,
                 primary_lawyer_id, assistant_lawyer_id, case_type_id, category, court, circuit,
                 first_instance_number, first_instance_year, appeal_number, appeal_year,
                 cassation_number, cassation_year, session_place,
                 filing_date, received_date, status, opponent_name, description,
                 is_archived, created_at, updated_at
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            )
            .run(
              caseId,
              code,
              degrees.office_case_number,
              degrees.case_year,
              title,
              clientId,
              matchLawyer(str(row, 'محامي أول')),
              matchLawyer(str(row, 'محامي ثاني')),
              typeId,
              str(row, 'نوع القضية') || null,
              str(row, 'المحكمة') || null,
              [str(row, 'طابق'), str(row, 'قاعة')].filter(Boolean).join(' / ') || null,
              degrees.first_instance_number,
              degrees.first_instance_year,
              degrees.appeal_number,
              degrees.appeal_year,
              degrees.cassation_number,
              degrees.cassation_year,
              str(row, 'المحكمة') || null,
              parseLegacyDate(row['تاريخ الرفع']),
              parseLegacyDate(row['وردت للمكتب']),
              status,
              str(row, 'إسم الخصم') || null,
              str(row, 'موضوع الدعوى') || null,
              archived,
              ts,
              ts
            )
          chunk.tick()
        }
        enqueue('cases', caseId, 'INSERT')
        saveMap(archiveKey, 'cases', caseId)
      }

      linkCaseClient(caseId, clientId, {
        first: str(row, 'صفة أولى'),
        appeal: str(row, 'صفةالإستئناف'),
        cass: str(row, 'صفةالنقض')
      })
      const oppId = findOrCreateOpponent(str(row, 'إسم الخصم'), str(row, 'بيانات الخصم'), `archive:${archiveKey}`)
      if (oppId) linkCaseOpponent(caseId, oppId)
    }

    const hearings = tableExists(archive, 'الجلسات')
      ? (archive.prepare(`SELECT * FROM ${quoteIdent('الجلسات')}`).all() as ArchiveRow[])
      : []
    const courtByCaseId = new Map<string, string>()
    if (apply) {
      for (const r of live.prepare(`SELECT id, court FROM cases WHERE deleted_at IS NULL`).all() as {
        id: string
        court: string | null
      }[]) {
        if (r.court) courtByCaseId.set(r.id, r.court)
      }
    }

    for (const row of hearings) {
      const office = str(row, 'المكتب') || 'Mas002'
      const hearingRecno = Number(str(row, 'رقم_السجل'))
      const caseRecno = archiveCaseRecnoFromHex(row['Hex'], hearingRecno)
      if (!caseRecno) {
        report.hearingsOrphan += 1
        continue
      }
      const caseId = caseByKey.get(`${office}:${caseRecno}`)
      if (!caseId) {
        report.hearingsOrphan += 1
        continue
      }
      const date = parseLegacyDate(row['تاريخ_الجلسة'])
      if (!date) {
        report.hearingsOrphan += 1
        continue
      }
      const text = str(row, 'بيان_الجلسة')
      const dedupe = hearingDedupeKey(date, text)
      const set = hearingsByCase.get(caseId) ?? new Set<string>()
      if (set.has(dedupe)) {
        report.hearingsSkippedDedupe += 1
        continue
      }
      set.add(dedupe)
      hearingsByCase.set(caseId, set)
      report.hearingsInserted += 1
      const id = randomUUID()
      if (apply) {
        const venue = courtByCaseId.get(caseId) || null
        live!
          .prepare(
            `INSERT INTO hearings
            (id, case_id, hearing_date, hearing_type, status, court_decision, what_happened, venue, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            id,
            caseId,
            date,
            str(row, 'نوع_الجلسة') || null,
            hearingStatusForDate(date, today),
            text || null,
            text || null,
            venue,
            ts,
            ts
          )
        chunk.tick()
      }
      enqueue('hearings', id, 'INSERT')
      saveMap(`hearing:${office}:${hearingRecno}`, 'hearings', id)
    }

    const bumpSeq = (name: 'case' | 'client', maxN: number, floor: number) => {
      const row = live!.prepare(`SELECT current_value FROM number_sequences WHERE name=?`).get(name) as
        | { current_value: number }
        | undefined
      if (!row) return
      const nextVal = Math.max(row.current_value, maxN, floor)
      if (nextVal === row.current_value) return
      if (apply) {
        live!.prepare(`UPDATE number_sequences SET current_value=?, updated_at=? WHERE name=?`).run(nextVal, ts, name)
        chunk.tick()
      }
      enqueue('number_sequences', name, 'UPDATE')
    }
    bumpSeq('case', maxCaseN, CASE_SEQ_FLOOR)
    bumpSeq('client', maxClientN, 0)

    chunk.commit(false)
  } finally {
    try {
      archive?.close()
    } catch {
      /* ignore */
    }
    try {
      live?.close()
    } catch {
      /* ignore */
    }
  }

  return report
}

type CourtLiveRow = {
  id: string
  case_number: string
  first_instance_number?: unknown
  first_instance_year?: unknown
  appeal_number?: unknown
  appeal_year?: unknown
  cassation_number?: unknown
  cassation_year?: unknown
  office_case_number?: unknown
  case_year?: unknown
}

function printReport(report: MigrateReport): void {
  console.log(report.dryRun ? 'dry-run (no writes)' : 'apply')
  console.log('archive', report.archivePath)
  console.log('live', report.dbPath)
  if (report.backupPath) console.log('backup', report.backupPath)
  console.log('clients inserted/reused', report.clientsInserted, report.clientsReused)
  console.log('opponents inserted/reused', report.opponentsInserted, report.opponentsReused)
  console.log('case types inserted', report.typesInserted)
  console.log('cases inserted/reused/empty', report.casesInserted, report.casesReused, report.casesSkippedEmpty)
  console.log(
    'hearings inserted/deduped/orphan',
    report.hearingsInserted,
    report.hearingsSkippedDedupe,
    report.hearingsOrphan
  )
  console.log('links case_clients/case_opponents', report.caseClientsInserted, report.caseOpponentsInserted)
  console.log('queue added', report.queueAdded)
}

function isDirectRun(): boolean {
  const entry = process.argv[1] || ''
  return /(^|[\\/])\.?migrate-archive\.(ts|js|cjs|mts)$/i.test(entry)
}

if (isDirectRun()) {
  try {
    const report = migrateArchive({
      apply: process.argv.includes('--apply'),
      chunk: Number(argValue('--chunk', '500')) || 500,
      archivePath: argValue('--archive') || undefined,
      dbPath: argValue('--db') || undefined
    })
    printReport(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(msg)
    process.exit(1)
  }
}
