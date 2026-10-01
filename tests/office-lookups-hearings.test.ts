import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parsePostponedDate, stemLookupValue } from '../shared/hearingText'
import { shouldShowWorkAlert } from '../electron/main/services/alertVisibility'
import { programCodeKey } from '../electron/main/services/cases'

describe('stemLookupValue', () => {
  it('keeps the legal phrase and strips every date form', () => {
    expect(stemLookupValue('للاطلاع لجلسة 11/1')).toBe('للاطلاع')
    expect(stemLookupValue('إعادة إعلان بتاريخ 15/10')).toBe('إعادة إعلان')
    expect(stemLookupValue('للاطلاع لجلسة 15/10/2026')).toBe('للاطلاع')
    expect(stemLookupValue('للحكم 15/10')).toBe('للحكم')
    expect(stemLookupValue('إعادة إعلان 15-10-2026')).toBe('إعادة إعلان')
    expect(stemLookupValue('للاطلاع 2026-10-15')).toBe('للاطلاع')
    expect(stemLookupValue('11/1')).toBe('')
    expect(stemLookupValue('  إعادة   إعلان  ')).toBe('إعادة إعلان')
  })
})

describe('parsePostponedDate', () => {
  it('rolls the year when 15/1 follows a December hearing', () => {
    expect(parsePostponedDate('15/1 إعادة إعلان', '2026-12-10')).toBe('2027-01-15')
  })

  it('parses a date without لجلسة and keeps the same year when still upcoming', () => {
    expect(parsePostponedDate('15/10 إعادة إعلان', '2026-09-01')).toBe('2026-10-15')
    expect(parsePostponedDate('للحكم 15/10', '2026-09-20')).toBe('2026-10-15')
  })

  it('accepts ISO and full d/m/y tokens', () => {
    expect(parsePostponedDate('تأجيل 2026-11-02', '2026-10-01')).toBe('2026-11-02')
    expect(parsePostponedDate('15/10/2026', '2026-09-01')).toBe('2026-10-15')
  })
})

describe('hearing alert visibility extras', () => {
  it('hides a done hearing', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-28',
        hearingStatus: 'done',
        today: '2026-09-27'
      })
    ).toBe(false)
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-28',
        hearingStatus: 'تمت',
        today: '2026-09-27'
      })
    ).toBe(false)
  })

  it('hides an older postponed hearing when a newer one exists', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-01',
        nextDate: '2026-10-10',
        hearingStatus: 'postponed',
        latestHearingDate: '2026-10-10',
        today: '2026-09-27'
      })
    ).toBe(false)
  })

  it('still shows today’s upcoming hearing even if a later date exists', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-27',
        hearingStatus: 'upcoming',
        latestHearingDate: '2026-10-10',
        today: '2026-09-27'
      })
    ).toBe(true)
  })
})

describe('programCodeKey duplicate identity', () => {
  it('treats padded CS codes as the same key used by live duplicate check', () => {
    expect(programCodeKey('CS-00245')).toBe(programCodeKey('245'))
  })
})

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

describe.skipIf(!sqliteAvailable())('program code check and hearing notifications', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-office-lookups-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  it('flags a duplicate program code immediately', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs1', 'CS-00245', 'قضية', 'cl1', 'open', ?, ?)`
    ).run(ts, ts)
    const { checkProgramCode } = await import('../electron/main/services/cases')
    expect(checkProgramCode('245').taken).toBe(true)
    expect(checkProgramCode('CS-245').taken).toBe(true)
    expect(checkProgramCode('246').taken).toBe(false)
    expect(checkProgramCode('245', 'cs1').taken).toBe(false)
  })

  it('hides alerts for a done hearing and for an older hearing after a newer one exists', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs1', '100', 'قضية', 'cl1', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at)
       VALUES ('h-old', 'cs1', '2026-09-01', 'postponed', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at)
       VALUES ('h-new', 'cs1', '2026-10-10', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at)
       VALUES ('h-done', 'cs1', '2026-09-28', 'done', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-old', 'جلسة قديمة', 'hearing', 'hearing', 'h-old', 0, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-done', 'جلسة تمت', 'hearing', 'hearing', 'h-done', 0, ?, ?)`
    ).run(ts, ts)
    const { listNotifications } = await import('../electron/main/services/schedule')
    const rows = listNotifications('anyone') as { id: string }[]
    expect(rows.find((r) => r.id === 'n-old')).toBeUndefined()
    expect(rows.find((r) => r.id === 'n-done')).toBeUndefined()
  })
})
