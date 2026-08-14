import { describe, expect, it } from 'vitest'
import {
  assertNetworkDriverConfigured,
  getDriverName,
  sqliteToMysql,
  sqliteToPostgres,
  translateSql
} from '../electron/main/db/adapter'

describe('database adapter / network-ready architecture', () => {
  it('defaults to sqlite', () => {
    const prev = process.env.LAW_DB_DRIVER
    delete process.env.LAW_DB_DRIVER
    expect(getDriverName()).toBe('sqlite')
    if (prev) process.env.LAW_DB_DRIVER = prev
  })

  it('selects postgres and mysql from env', () => {
    process.env.LAW_DB_DRIVER = 'postgres'
    expect(getDriverName()).toBe('postgres')
    process.env.LAW_DB_DRIVER = 'mysql'
    expect(getDriverName()).toBe('mysql')
    process.env.LAW_DB_DRIVER = 'sqlite'
  })

  it('translates sqlite datetime and placeholders to postgres', () => {
    const sql = sqliteToPostgres(`INSERT INTO clients (name, created_at) VALUES (?, datetime('now'))`)
    expect(sql).toContain('$1')
    expect(sql).toContain('NOW()')
    expect(sql).not.toContain('datetime(')
  })

  it('translates sqlite insert-or-ignore to mysql', () => {
    const sql = sqliteToMysql(`INSERT OR IGNORE INTO case_opponents (case_id, opponent_id) VALUES (?,?)`)
    expect(sql.startsWith('INSERT IGNORE INTO')).toBe(true)
  })

  it('translateSql is identity for sqlite', () => {
    const src = 'SELECT * FROM cases WHERE id = ?'
    expect(translateSql(src, 'sqlite')).toBe(src)
  })

  it('requires LAW_DB_URL before switching away from sqlite', () => {
    const prevUrl = process.env.LAW_DB_URL
    delete process.env.LAW_DB_URL
    delete process.env.DATABASE_URL
    expect(() => assertNetworkDriverConfigured('postgres')).toThrow(/LAW_DB_URL/)
    expect(() => assertNetworkDriverConfigured('mysql')).toThrow(/LAW_DB_URL/)
    expect(() => assertNetworkDriverConfigured('sqlite')).not.toThrow()
    if (prevUrl) process.env.LAW_DB_URL = prevUrl
  })
})
