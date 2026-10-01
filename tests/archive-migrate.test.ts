import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { arabicFold } from '../shared/arabic'
import {
  archiveCaseRecnoFromHex,
  archiveCourtKeys,
  extractNationalId,
  hearingStatusForDate,
  isEmptyArchiveCase,
  liveCourtKeys,
  nextFreeProgramNumber,
  parseCourtPair,
  parseLegacyDate,
  partiesMatch,
  programCodeKey
} from '../shared/archiveMigrate'
import { SCHEMA_SQL } from '../electron/main/db/schema'
import { migrateArchive } from '../scripts/migrate-archive'

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

function hexFor(caseRecno: number, hearingRecno: number): string {
  const hv = caseRecno + Math.trunc(1000 * Math.sqrt(hearingRecno)) + 13
  return hv.toString(16).toUpperCase()
}

describe('archive migrate matchers', () => {
  it('folds names and extracts a valid Egyptian NID only', () => {
    expect(arabicFold('أحمد علي')).toBe(arabicFold('احمد علي'))
    expect(extractNationalId('رقم قومي 28301011234567 عنوان')).toBe('28301011234567')
    expect(extractNationalId('لا يوجد')).toBe('')
    expect(extractNationalId('01056630270863')).toBe('')
    expect(extractNationalId('ت 0105663027 - 086360964')).toBe('')
    expect(extractNationalId('14720052562005')).toBe('')
    expect(extractNationalId('19320051852005')).toBe('')
    expect(extractNationalId('33858470338221')).toBe('')
    expect(extractNationalId('97720236002025')).toBe('')
  })

  it('parses court number+year including spaced slash', () => {
    expect(parseCourtPair('2057/ 2026')).toEqual({ number: '2057', year: '2026' })
    expect(parseCourtPair('627/1994')).toEqual({ number: '627', year: '1994' })
    expect(parseCourtPair('3741', '2026')).toEqual({ number: '3741', year: '2026' })
    const keys = archiveCourtKeys({
      'رقم أول درجة': '627/1994',
      'وردت للمكتب': '15-09-2026'
    })
    expect(keys.has('627|1994')).toBe(true)
    expect(liveCourtKeys({ first_instance_number: '627', first_instance_year: '1994' }).has('627|1994')).toBe(true)
  })

  it('parses legacy dates and hearing status', () => {
    expect(parseLegacyDate('28-09-2026')).toBe('2026-09-28')
    expect(parseLegacyDate('01/12/1993')).toBe('1993-12-01')
    expect(hearingStatusForDate('2026-09-29', '2026-10-01')).toBe('done')
    expect(hearingStatusForDate('2026-10-15', '2026-10-01')).toBe('upcoming')
  })

  it('computes CASES1 recno from the VB Hex formula', () => {
    expect(archiveCaseRecnoFromHex('3F6', 1)).toBe(1)
    expect(archiveCaseRecnoFromHex('99     3F6', 1)).toBe(1)
    expect(archiveCaseRecnoFromHex('2CB3E', 31097)).toBe(6746)
    expect(archiveCaseRecnoFromHex(hexFor(2, 2), 2)).toBe(2)
  })

  it('skips empty CASES1 rows and avoids occupied CS codes', () => {
    expect(isEmptyArchiveCase({ 'نوع القضية': '', 'الجهة_الموكل': '' })).toBe(true)
    expect(isEmptyArchiveCase({ 'نوع القضية': 'جنح', 'الجهة_الموكل': '' })).toBe(false)
    const occupied = new Set([programCodeKey('CS-00245'), programCodeKey('CS-00001')])
    const next = nextFreeProgramNumber(occupied, 1, 'CS-', 5)
    expect(next.code).toBe('CS-00002')
    expect(programCodeKey(next.code)).not.toBe('245')
  })

  it('matches parties only when a folded client or opponent name aligns', () => {
    expect(partiesMatch('أحمد علي', 'خصم', ['احمد علي'], [])).toBe(true)
    expect(partiesMatch('موكل', 'النيابة العامة', [], ['النيابه العامه'])).toBe(true)
    expect(partiesMatch('شخص آخر', 'خصم آخر', ['احمد علي'], ['خصم أول'])).toBe(false)
    expect(partiesMatch('', '', ['احمد علي'], ['خصم'])).toBe(false)
    expect(partiesMatch('أحمد علي', 'خصم', [], [])).toBe(false)
  })
})

describe.skipIf(!sqliteAvailable())('archive migrate sqlite', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function openDb(file: string) {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    return new Database(file)
  }

  function makePair() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-mig-'))
    dirs.push(dir)
    const archivePath = path.join(dir, 'archive.db')
    const dbPath = path.join(dir, 'lawoffice.db')
    const archive = openDb(archivePath)
    archive.exec(`
      CREATE TABLE "القضايا" (
        "المكتب" TEXT, "رقم_السجل" TEXT, "نوع القضية" TEXT, "وردت للمكتب" TEXT, "تاريخ الرفع" TEXT,
        "ترقيم أول" TEXT, "الجهة_الموكل" TEXT, "إسم الخصم" TEXT, "موضوع الدعوى" TEXT,
        "محامي أول" TEXT, "محامي ثاني" TEXT, "صفة أولى" TEXT, "صفةالإستئناف" TEXT, "صفةالنقض" TEXT,
        "رقم أول درجة" TEXT, "رقم الإستئناف" TEXT, "رقم النقض" TEXT, "المحكمة" TEXT,
        "طابق" TEXT, "قاعة" TEXT, "وضع الملف" TEXT, "بيانات الجهة" TEXT, "بيانات الخصم" TEXT
      );
      CREATE TABLE "الموكلين" (
        "اسم_الموكل" TEXT, "بيانات_الجهة" TEXT, "اول_مكتب" TEXT, "اول_رقم_سجل" TEXT
      );
      CREATE TABLE "الجلسات" (
        "المكتب" TEXT, "رقم_السجل" TEXT, "تاريخ_الجلسة" TEXT, "بيان_الجلسة" TEXT, "نوع_الجلسة" TEXT, "Hex" TEXT
      );
    `)
    const live = openDb(dbPath)
    live.exec(SCHEMA_SQL)
    const ts = '2026-10-01T00:00:00.000Z'
    live.prepare(`INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,?,?,?)`).run(
      'case',
      'CS-',
      0,
      5,
      ts
    )
    live.prepare(`INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,?,?,?)`).run(
      'client',
      'CL-',
      0,
      4,
      ts
    )
    return { dir, archivePath, dbPath, archive, live, ts }
  }

  it('reuses NID/folded clients and court-number cases, queues only new rows', () => {
    const { archivePath, dbPath, archive, live, ts } = makePair()
    live
      .prepare(
        `INSERT INTO clients (id, client_number, full_name, national_id, client_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run('c-fold', 'CL-0001', 'احمد علي', null, 'individual', ts, ts)
    live
      .prepare(
        `INSERT INTO clients (id, client_number, full_name, national_id, client_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run('c-nid', 'CL-0002', 'اسم حي', '28301011234567', 'individual', ts, ts)
    live
      .prepare(
        `INSERT INTO cases (id, case_number, title, client_id, first_instance_number, first_instance_year, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run('cs-live', 'CS-00245', 'LIVE TITLE', 'c-fold', '627', '1994', ts, ts)
    live
      .prepare(
        `INSERT INTO cases (id, case_number, title, client_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run('cs-one', 'CS-00001', 'occupied one', 'c-fold', ts, ts)

    archive.exec(`
      INSERT INTO "الموكلين" VALUES ('أحمد علي', '', 'Mas002', '1');
      INSERT INTO "الموكلين" VALUES ('نادر جدا', '28301011234567', 'Mas002', '3');
      INSERT INTO "الموكلين" VALUES ('موكل جديد', '', 'Mas002', '4');
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة","المحكمة","بيانات الجهة")
      VALUES
        ('Mas002','1','مدني','01-01-1994','أحمد علي','خصم أول','موضوع مؤرشف','627/1994','جنوب','');
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة","المحكمة","بيانات الجهة")
      VALUES
        ('Mas002','2','','','','','','','','');
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة","المحكمة","بيانات الجهة")
      VALUES
        ('Mas002','3','جنح','27-09-2026','نادر جدا','النيابة','مباني','33479/2026','الهرم','28301011234567');
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة","المحكمة","بيانات الجهة")
      VALUES
        ('Mas002','4','صحة توقيع','28-09-2026','موكل جديد','خصم جديد','عقد','8888/2026','الهرم','');
      INSERT INTO "الجلسات" VALUES ('Mas002','1','10-01-1994','اول جلسه','1','${hexFor(1, 1)}');
      INSERT INTO "الجلسات" VALUES ('Mas002','5','10-01-1994','اول جلسه','1','${hexFor(1, 5)}');
      INSERT INTO "الجلسات" VALUES ('Mas002','2','15-10-2026','اول جلسه','1','${hexFor(2, 2)}');
      INSERT INTO "الجلسات" VALUES ('Mas002','4','29-09-2026','اول جلسه','1','${hexFor(4, 4)}');
    `)
    archive.close()
    live.close()

    const dry = migrateArchive({ archivePath, dbPath, apply: false, today: '2026-10-01' })
    expect(dry.dryRun).toBe(true)
    expect(dry.casesSkippedEmpty).toBe(1)
    expect(dry.casesReused).toBe(1)
    expect(dry.casesInserted).toBe(2)
    expect(dry.clientsReused).toBe(2)
    expect(dry.clientsInserted).toBe(1)
    expect(dry.hearingsSkippedDedupe).toBe(1)
    expect(dry.hearingsOrphan).toBe(1)
    expect(dry.hearingsInserted).toBe(2)

    const liveCheck = openDb(dbPath)
    expect((liveCheck.prepare(`SELECT COUNT(*) AS c FROM cases`).get() as { c: number }).c).toBe(2)
    expect((liveCheck.prepare(`SELECT COUNT(*) AS c FROM local_sync_queue`).get() as { c: number }).c).toBe(0)
    liveCheck.close()

    const applied = migrateArchive({ archivePath, dbPath, apply: true, today: '2026-10-01' })
    expect(applied.dryRun).toBe(false)
    expect(applied.backupPath).toBeTruthy()
    expect(applied.casesReused).toBe(1)
    expect(applied.casesInserted).toBe(2)
    expect(applied.clientsReused).toBe(2)
    expect(applied.clientsInserted).toBe(1)
    expect(applied.hearingsInserted).toBe(2)
    expect(applied.hearingsSkippedDedupe).toBe(1)
    expect(applied.hearingsOrphan).toBe(1)

    const db = openDb(dbPath)
    const liveCase = db.prepare(`SELECT title, case_number FROM cases WHERE id='cs-live'`).get() as {
      title: string
      case_number: string
    }
    expect(liveCase.title).toBe('LIVE TITLE')
    expect(liveCase.case_number).toBe('CS-00245')

    const allCases = db.prepare(`SELECT id, case_number, title, client_id FROM cases ORDER BY case_number`).all() as {
      id: string
      case_number: string
      title: string
      client_id: string
    }[]
    expect(allCases).toHaveLength(4)
    const created = allCases.filter((c) => c.id !== 'cs-live' && c.id !== 'cs-one')
    expect(created.every((c) => programCodeKey(c.case_number) !== '245')).toBe(true)
    expect(created.some((c) => programCodeKey(c.case_number) === '1')).toBe(false)

    expect((db.prepare(`SELECT COUNT(*) AS c FROM clients`).get() as { c: number }).c).toBe(3)
    const nidClient = db.prepare(`SELECT full_name FROM clients WHERE id='c-nid'`).get() as { full_name: string }
    expect(nidClient.full_name).toBe('اسم حي')

    const hearings = db
      .prepare(`SELECT case_id, hearing_date, status, court_decision FROM hearings ORDER BY hearing_date`)
      .all() as {
      case_id: string
      hearing_date: string
      status: string
      court_decision: string
    }[]
    expect(hearings).toHaveLength(2)
    expect(hearings.filter((h) => h.case_id === 'cs-live')).toHaveLength(1)
    expect(hearings.find((h) => h.hearing_date === '1994-01-10')?.status).toBe('done')
    expect(hearings.find((h) => h.hearing_date === '2026-09-29')?.status).toBe('done')

    const queued = db.prepare(`SELECT table_name, record_id, operation FROM local_sync_queue`).all() as {
      table_name: string
      record_id: string
      operation: string
    }[]
    expect(queued.every((q) => q.operation === 'INSERT' || q.table_name === 'number_sequences')).toBe(true)
    expect(queued.some((q) => q.table_name === 'clients' && q.record_id === 'c-fold')).toBe(false)
    expect(queued.some((q) => q.table_name === 'clients' && q.record_id === 'c-nid')).toBe(false)
    expect(queued.some((q) => q.table_name === 'cases' && q.record_id === 'cs-live')).toBe(false)
    expect(queued.filter((q) => q.table_name === 'cases' && q.operation === 'INSERT').length).toBe(2)
    expect(queued.filter((q) => q.table_name === 'hearings').length).toBe(2)
    expect(queued.filter((q) => q.table_name === 'clients' && q.operation === 'INSERT').length).toBe(1)

    const seq = db.prepare(`SELECT current_value FROM number_sequences WHERE name='case'`).get() as { current_value: number }
    expect(seq.current_value).toBeGreaterThanOrEqual(7000)

    db.close()

    const second = migrateArchive({ archivePath, dbPath, apply: true, today: '2026-10-01' })
    expect(second.casesInserted).toBe(0)
    expect(second.hearingsInserted).toBe(0)
    expect(second.clientsInserted).toBe(0)
  })

  it('reuses a live case at most once and keeps the second archive row separate', () => {
    const { archivePath, dbPath, archive, live, ts } = makePair()
    live
      .prepare(
        `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run('c1', 'CL-0001', 'احمد علي', 'individual', ts, ts)
    live
      .prepare(
        `INSERT INTO cases (id, case_number, title, client_id, first_instance_number, first_instance_year, opponent_name, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run('cs-live', 'CS-00245', 'LIVE TITLE', 'c1', '627', '1994', 'خصم أول', ts, ts)
    archive.exec(`
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة")
      VALUES
        ('Mas002','1','مدني','01-01-1994','أحمد علي','خصم أول','موضوع أ','627/1994'),
        ('Mas002','2','مدني','02-01-1994','شخص آخر','خصم مختلف','موضوع ب','627/1994');
      INSERT INTO "الجلسات" VALUES ('Mas002','1','10-01-1994','جلسة أ','1','${hexFor(1, 1)}');
      INSERT INTO "الجلسات" VALUES ('Mas002','2','11-01-1994','جلسة ب','1','${hexFor(2, 2)}');
    `)
    archive.close()
    live.close()

    const report = migrateArchive({ archivePath, dbPath, apply: true, today: '2026-10-01' })
    expect(report.casesReused).toBe(1)
    expect(report.casesInserted).toBe(1)
    const db = openDb(dbPath)
    expect((db.prepare(`SELECT COUNT(*) AS c FROM cases WHERE deleted_at IS NULL`).get() as { c: number }).c).toBe(2)
    expect((db.prepare(`SELECT title FROM cases WHERE id='cs-live'`).get() as { title: string }).title).toBe('LIVE TITLE')
    const hLive = db.prepare(`SELECT court_decision FROM hearings WHERE case_id='cs-live'`).all() as { court_decision: string }[]
    expect(hLive.map((h) => h.court_decision)).toEqual(['جلسة أ'])
    const hNew = db
      .prepare(`SELECT court_decision FROM hearings WHERE case_id != 'cs-live'`)
      .all() as { court_decision: string }[]
    expect(hNew.map((h) => h.court_decision)).toEqual(['جلسة ب'])
    db.close()
  })

  it('does not reuse when court matches but client and opponent names differ', () => {
    const { archivePath, dbPath, archive, live, ts } = makePair()
    live
      .prepare(
        `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run('c1', 'CL-0001', 'احمد علي', 'individual', ts, ts)
    live
      .prepare(
        `INSERT INTO cases (id, case_number, title, client_id, first_instance_number, first_instance_year, opponent_name, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run('cs-live', '1', 'LIVE TITLE', 'c1', '627', '1994', 'خصم أول', ts, ts)
    archive.exec(`
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة")
      VALUES
        ('Mas002','1','مدني','01-01-1994','موكل غريب','خصم غريب','موضوع','627/1994');
    `)
    archive.close()
    live.close()
    const report = migrateArchive({ archivePath, dbPath, apply: true, today: '2026-10-01' })
    expect(report.casesReused).toBe(0)
    expect(report.casesInserted).toBe(1)
    const db = openDb(dbPath)
    expect((db.prepare(`SELECT title FROM cases WHERE id='cs-live'`).get() as { title: string }).title).toBe('LIVE TITLE')
    expect((db.prepare(`SELECT COUNT(*) AS c FROM cases WHERE deleted_at IS NULL`).get() as { c: number }).c).toBe(2)
    db.close()
  })

  it('ignores soft-deleted live cases with the same court number', () => {
    const { archivePath, dbPath, archive, live, ts } = makePair()
    live
      .prepare(
        `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run('c1', 'CL-0001', 'احمد علي', 'individual', ts, ts)
    live
      .prepare(
        `INSERT INTO cases (id, case_number, title, client_id, first_instance_number, first_instance_year, opponent_name, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run('cs-del', '1', 'DELETED', 'c1', '627', '1994', 'خصم أول', ts, ts, ts)
    archive.exec(`
      INSERT INTO "القضايا"
        ("المكتب","رقم_السجل","نوع القضية","وردت للمكتب","الجهة_الموكل","إسم الخصم","موضوع الدعوى","رقم أول درجة")
      VALUES
        ('Mas002','1','مدني','01-01-1994','أحمد علي','خصم أول','موضوع','627/1994');
    `)
    archive.close()
    live.close()
    const report = migrateArchive({ archivePath, dbPath, apply: true, today: '2026-10-01' })
    expect(report.casesReused).toBe(0)
    expect(report.casesInserted).toBe(1)
    const db = openDb(dbPath)
    expect((db.prepare(`SELECT COUNT(*) AS c FROM cases WHERE deleted_at IS NULL`).get() as { c: number }).c).toBe(1)
    expect((db.prepare(`SELECT title FROM cases WHERE id='cs-del'`).get() as { title: string }).title).toBe('DELETED')
    db.close()
  })
})
