export type DriverName = 'sqlite' | 'postgres' | 'mysql'

export type SqlStatement = {
  run: (...params: unknown[]) => { lastInsertRowid: number | bigint; changes: number }
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
}

export type SqlDatabase = {
  driver: DriverName
  exec: (sql: string) => void
  prepare: (sql: string) => SqlStatement
  close: () => void
}

export function getDriverName(): DriverName {
  const v = String(process.env.LAW_DB_DRIVER || 'sqlite').toLowerCase()
  if (v === 'postgres' || v === 'postgresql') return 'postgres'
  if (v === 'mysql' || v === 'mariadb') return 'mysql'
  return 'sqlite'
}

export function sqliteToPostgres(sql: string): string {
  let i = 0
  return sql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/date\('now'\)/gi, 'CURRENT_DATE')
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\?/g, () => `$${++i}`)
}

export function sqliteToMysql(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/date\('now'\)/gi, 'CURDATE()')
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO')
    .replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT')
}

export function translateSql(sql: string, driver: DriverName): string {
  if (driver === 'postgres') return sqliteToPostgres(sql)
  if (driver === 'mysql') return sqliteToMysql(sql)
  return sql
}

export function assertNetworkDriverConfigured(driver: DriverName): void {
  if (driver === 'sqlite') return
  const url = process.env.LAW_DB_URL || process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      `طبقة ${driver} جاهزة معمارياً لكنها تحتاج LAW_DB_URL (أو DATABASE_URL) للاتصال الشبكي. الوضع الافتراضي يبقى SQLite.`
    )
  }
}
