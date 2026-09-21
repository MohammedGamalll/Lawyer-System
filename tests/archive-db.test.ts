import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeArchive,
  getArchiveTableData,
  listArchiveTables
} from '../electron/main/services/archive'

function sqliteAvailable() {
  try {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

describe.skipIf(!sqliteAvailable())('legacy archive sqlite', () => {
  const dirs: string[] = []

  afterEach(() => {
    closeArchive()
    delete process.env.LAW_ARCHIVE_DB
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function makeDb() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-archive-'))
    dirs.push(dir)
    const file = path.join(dir, 'archive.db')
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(file)
    db.exec(`CREATE TABLE القضايا (رقم_السجل TEXT, الاسم TEXT);
             INSERT INTO القضايا VALUES ('1','احمد'),('2','محمود'),('3','سارة');`)
    db.close()
    process.env.LAW_ARCHIVE_DB = file
    return file
  }

  it('lists user tables and paginates', () => {
    makeDb()
    const tabs = listArchiveTables()
    expect(tabs.missing).toBe(false)
    expect(tabs.tables).toEqual(['القضايا'])
    const page1 = getArchiveTableData('القضايا', 1, 2)
    expect(page1.total).toBe(3)
    expect(page1.rows).toHaveLength(2)
    expect(page1.columns).toEqual(['رقم_السجل', 'الاسم'])
    const page2 = getArchiveTableData('القضايا', 2, 2)
    expect(page2.rows).toHaveLength(1)
    expect(page2.rows[0].الاسم).toBe('سارة')
  })

  it('rejects unknown tables', () => {
    makeDb()
    expect(() => getArchiveTableData('sqlite_master')).toThrow(/غير مسموح/)
    expect(() => getArchiveTableData('القضايا; DROP TABLE القضايا')).toThrow(/غير مسموح/)
    expect(() => getArchiveTableData('missing')).toThrow(/غير مسموح/)
  })

  it('filters with a parameterized search', () => {
    makeDb()
    const hit = getArchiveTableData('القضايا', 1, 100, 'محمود')
    expect(hit.total).toBe(1)
    expect(hit.rows[0].الاسم).toBe('محمود')
  })

  it('does not throw when the archive file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-archive-miss-'))
    dirs.push(dir)
    process.env.LAW_ARCHIVE_DB = path.join(dir, 'nope.db')
    const tabs = listArchiveTables()
    expect(tabs.missing).toBe(true)
    expect(tabs.tables).toEqual([])
    const page = getArchiveTableData('القضايا', 1, 100)
    expect(page.missing).toBe(true)
    expect(page.rows).toEqual([])
  })
})
