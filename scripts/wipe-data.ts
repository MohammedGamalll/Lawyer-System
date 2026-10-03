/**
 * Wipe local office business data (keep admin/settings/lookups). Default is dry-run.
 *
 *   npm run wipe:data
 *   npm run wipe:data -- --apply
 */
import path from 'path'
import { initDatabase, closeDatabase, getDb } from '../electron/main/db/database'
import { getDbPath } from '../electron/main/paths'
import { wipeBusinessData } from '../electron/main/services/wipe'

const COUNT_TABLES = [
  'cases',
  'clients',
  'opponents',
  'case_clients',
  'case_opponents',
  'hearings',
  'archive_migration_map',
  'local_sync_queue'
] as const

export type WipeDataOptions = {
  apply?: boolean
  dataRoot?: string
}

export type WipeDataReport = {
  dryRun: boolean
  dataRoot: string
  dbPath: string
  tables: { name: string; rows: number }[]
  sequences: { name: string; current_value: number }[]
  wiped: boolean
}

function tableExists(name: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name) as { x: number } | undefined
  return Boolean(row)
}

function snapshot(): { tables: WipeDataReport['tables']; sequences: WipeDataReport['sequences'] } {
  const db = getDb()
  const tables = COUNT_TABLES.filter((name) => tableExists(name)).map((name) => {
    const rows = (db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number }).c
    return { name, rows }
  })
  const sequences = tableExists('number_sequences')
    ? (db.prepare(`SELECT name, current_value FROM number_sequences ORDER BY name`).all() as {
        name: string
        current_value: number
      }[])
    : []
  return { tables, sequences }
}

export function runWipeData(opts: WipeDataOptions = {}): WipeDataReport {
  const apply = Boolean(opts.apply)
  process.env.LAW_DB_DRIVER = 'sqlite'
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  const dataRoot =
    opts.dataRoot ||
    process.env.LAW_DATA_ROOT ||
    path.join(appData, 'law-office-management', 'LawOfficeManagement')
  process.env.LAW_DATA_ROOT = dataRoot
  closeDatabase()
  initDatabase()
  const dbPath = getDbPath()
  const before = snapshot()
  if (!apply) {
    closeDatabase()
    return { dryRun: true, dataRoot, dbPath, ...before, wiped: false }
  }
  const admin = getDb()
    .prepare(`SELECT id, username, full_name FROM users WHERE lower(username) = 'admin'`)
    .get() as { id: string; username: string; full_name: string } | undefined
  if (!admin) {
    closeDatabase()
    throw new Error('حساب admin غير موجود')
  }
  wipeBusinessData({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name,
    roleCode: 'admin',
    permissions: ['settings.manage']
  })
  getDb().prepare('UPDATE number_sequences SET current_value = 0').run()
  const after = snapshot()
  closeDatabase()
  return { dryRun: false, dataRoot, dbPath, ...after, wiped: true }
}

function argValue(name: string, fallback = ''): string {
  const i = process.argv.indexOf(name)
  if (i < 0) return fallback
  return process.argv[i + 1] || fallback
}

function isDirectRun(): boolean {
  const entry = process.argv[1] || ''
  return /(^|[\\/])\.?wipe-data\.(ts|js|cjs|mts)$/i.test(entry)
}

if (isDirectRun()) {
  try {
    const report = runWipeData({
      apply: process.argv.includes('--apply'),
      dataRoot: argValue('--root') || undefined
    })
    console.log(JSON.stringify(report, null, 2))
    if (report.dryRun) console.log('dry-run only; pass --apply to wipe')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(msg)
    process.exit(1)
  }
}
