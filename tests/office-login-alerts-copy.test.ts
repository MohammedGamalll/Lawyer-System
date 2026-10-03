import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isInactiveCaseForAlerts,
  notificationIsVisible,
  shouldShowWorkAlert,
  dedupeNotifications
} from '../electron/main/services/alertVisibility'

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

describe('alert visibility', () => {
  it('treats closed, judged, archived, and Arabic settled statuses as inactive', () => {
    expect(isInactiveCaseForAlerts('closed')).toBe(true)
    expect(isInactiveCaseForAlerts('judged')).toBe(true)
    expect(isInactiveCaseForAlerts('مغلقة')).toBe(true)
    expect(isInactiveCaseForAlerts('منتهية')).toBe(true)
    expect(isInactiveCaseForAlerts('open')).toBe(false)
    expect(isInactiveCaseForAlerts('open', 1)).toBe(true)
  })

  it('keeps the newest notification per related record', () => {
    const rows = dedupeNotifications([
      { id: 'n2', related_type: 'hearing', related_id: 'h1', created_at: '2026-10-02' },
      { id: 'n1', related_type: 'hearing', related_id: 'h1', created_at: '2026-10-01' },
      { id: 'n3', related_type: 'task', related_id: 't1', created_at: '2026-10-02' }
    ])
    expect(rows.map((r) => r.id)).toEqual(['n2', 'n3'])
  })

  it('hides a hearing alert when related_id is set but the hearing row is missing', () => {
    expect(
      notificationIsVisible(
        {
          related_type: 'hearing',
          related_id: 'ghost-h',
          title: 'جلسة القضية 2 — إتلاف'
        },
        '2026-10-03'
      )
    ).toBe(false)
  })

  it('dedupes hearing alerts for the same case digits and date across different ids', () => {
    const rows = dedupeNotifications([
      {
        id: 'n-a',
        related_type: 'hearing',
        related_id: 'h-a',
        case_number: '02',
        hearing_date: '2026-10-03',
        hearing_type: 'إتلاف',
        created_at: '2026-10-03T09:00:00'
      },
      {
        id: 'n-b',
        related_type: 'hearing',
        related_id: 'h-b',
        case_number: '2',
        hearing_date: '2026-10-03',
        hearing_type: 'إتلاف',
        created_at: '2026-10-03T08:00:00'
      }
    ])
    expect(rows.map((r) => r.id)).toEqual(['n-a'])
  })

  it('collapses hearing alerts for the same case and date even when hearing_type differs', () => {
    const rows = dedupeNotifications([
      {
        id: 'n-a',
        related_type: 'hearing',
        related_id: 'h-a',
        case_number: 'CS-06717',
        hearing_date: '2026-10-04',
        hearing_type: 'موضوع',
        title: 'جلسة الغد'
      },
      {
        id: 'n-b',
        related_type: 'hearing',
        related_id: 'h-b',
        case_number: '6717',
        hearing_date: '2026-10-04',
        hearing_type: 'خبير',
        title: 'جلسة الغد'
      }
    ])
    expect(rows.map((r) => r.id)).toEqual(['n-a'])
  })

  it('hides a past hearing on a closed case', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'closed',
        kind: 'hearing',
        actionDate: '1994-03-01',
        today: '2026-09-27'
      })
    ).toBe(false)
    expect(
      notificationIsVisible(
        {
          related_type: 'hearing',
          case_status: 'closed',
          hearing_date: '1994-03-01'
        },
        '2026-09-27'
      )
    ).toBe(false)
  })

  it('shows an upcoming hearing even when the case is closed', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'closed',
        kind: 'hearing',
        actionDate: '2026-09-28',
        today: '2026-09-27'
      })
    ).toBe(true)
  })

  it('shows a postponed hearing when the next date is in the future', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-01',
        nextDate: '2026-10-10',
        result: 'تأجيل',
        today: '2026-09-27'
      })
    ).toBe(true)
  })

  it('hides a past unfinished action once its date has passed', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-01',
        today: '2026-09-27'
      })
    ).toBe(false)
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'task',
        actionDate: '2026-09-01',
        taskStatus: 'overdue',
        today: '2026-09-27'
      })
    ).toBe(false)
  })

  it('still shows today’s hearing or task', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-27',
        hearingStatus: 'upcoming',
        today: '2026-09-27'
      })
    ).toBe(true)
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'task',
        actionDate: '2026-09-27',
        taskStatus: 'not_done',
        today: '2026-09-27'
      })
    ).toBe(true)
  })

  it('hides a past finished hearing and a completed task', () => {
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'hearing',
        actionDate: '2026-09-01',
        result: 'حكمت المحكمة',
        today: '2026-09-27'
      })
    ).toBe(false)
    expect(
      shouldShowWorkAlert({
        caseStatus: 'open',
        kind: 'task',
        actionDate: '2026-09-01',
        taskStatus: 'completed',
        today: '2026-09-27'
      })
    ).toBe(false)
  })
})

describe.skipIf(!sqliteAvailable())('login usernames, closed-case alerts, and party copy', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-office-plan-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  it('lists active usernames without hashes', async () => {
    await boot()
    const { listActiveUsernames } = await import('../electron/main/services/users')
    const rows = listActiveUsernames()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['full_name', 'username'])
      expect(row.username).toBeTruthy()
      expect(JSON.stringify(row).toLowerCase()).not.toContain('password')
      expect(JSON.stringify(row)).not.toContain('hash')
    }
  })

  it('does not return a past hearing alert for a closed case', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs1', '1993', 'قضية قديمة', 'cl1', 'closed', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at)
       VALUES ('h1', 'cs1', '1994-03-01', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n1', 'جلسة', 'hearing', 'hearing', 'h1', 0, ?, ?)`
    ).run(ts, ts)
    const { listNotifications } = await import('../electron/main/services/schedule')
    const rows = listNotifications('anyone') as { id: string }[]
    expect(rows.find((r) => r.id === 'n1')).toBeUndefined()
  })

  it('hides ghost hearing alerts and collapses duplicate case+date hearings', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl-dup', 'CL-D', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs-dup', '6576', 'إتلاف', 'cl-dup', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-dup-1', 'cs-dup', '2099-01-15', 'إتلاف', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-dup-2', 'cs-dup', '2099-01-15', 'موضوع', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-dup-1', 'جلسة القضية 6576', 'hearing', 'hearing', 'h-dup-1', 0, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-dup-2', 'جلسة القضية 6576', 'hearing', 'hearing', 'h-dup-2', 0, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-ghost', 'جلسة مفقودة', 'hearing', 'hearing', 'missing-hearing', 0, ?, ?)`
    ).run(ts, ts)
    const { listNotifications } = await import('../electron/main/services/schedule')
    const rows = listNotifications('anyone') as { id: string }[]
    expect(rows.find((r) => r.id === 'n-ghost')).toBeUndefined()
    const dups = rows.filter((r) => r.id === 'n-dup-1' || r.id === 'n-dup-2')
    expect(dups).toHaveLength(1)
  })

  it('creates only one daily hearing alert per case and date', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    const { cairoAddDays, cairoTodayIso } = await import('../shared/cairoDate')
    const tomorrow = cairoAddDays(cairoTodayIso(), 1)
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl-day', 'CL-D2', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs-day', 'CS-06717', 'دعوى', 'cl-day', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-day-1', 'cs-day', ?, 'موضوع', 'upcoming', ?, ?)`
    ).run(tomorrow, ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-day-2', 'cs-day', ?, 'خبير', 'upcoming', ?, ?)`
    ).run(tomorrow, ts, ts)
    const { generateDailyNotifications } = await import('../electron/main/services/reminders')
    generateDailyNotifications()
    const rows = db
      .prepare(
        `SELECT id, related_id FROM notifications WHERE title = 'جلسة الغد' AND deleted_at IS NULL`
      )
      .all() as { id: string; related_id: string }[]
    expect(rows).toHaveLength(1)
  })

  it('does not throw when completing a missing hearing and dismisses the alert', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    const admin = db.prepare(`SELECT id, username, full_name FROM users WHERE username = 'admin'`).get() as {
      id: string
      username: string
      full_name: string
    }
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-miss', 'جلسة غير موجودة', 'hearing', 'hearing', 'missing-h', 0, ?, ?)`
    ).run(ts, ts)
    const { completeHearing } = await import('../electron/main/services/hearings')
    expect(() =>
      completeHearing(
        {
          id: admin.id,
          username: admin.username,
          fullName: admin.full_name,
          roleCode: 'admin',
          permissions: ['hearings.update']
        },
        'missing-h',
        'n-miss'
      )
    ).not.toThrow()
    const row = db.prepare(`SELECT deleted_at, is_read FROM notifications WHERE id = 'n-miss'`).get() as {
      deleted_at: string | null
      is_read: number
    }
    expect(row.deleted_at).toBeTruthy()
    expect(row.is_read).toBe(1)
  })

  it('marks sibling hearings of the same case and date as done', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    const admin = db.prepare(`SELECT id, username, full_name FROM users WHERE username = 'admin'`).get() as {
      id: string
      username: string
      full_name: string
    }
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl-sib', 'CL-S', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs-sib', '2', 'إتلاف', 'cl-sib', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-sib-1', 'cs-sib', '2099-02-01', 'إتلاف', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_type, status, created_at, updated_at)
       VALUES ('h-sib-2', 'cs-sib', '2099-02-01', 'إتلاف', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-sib-1', 'جلسة', 'hearing', 'hearing', 'h-sib-1', 0, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO notifications (id, title, type, related_type, related_id, is_read, created_at, updated_at)
       VALUES ('n-sib-2', 'جلسة', 'hearing', 'hearing', 'h-sib-2', 0, ?, ?)`
    ).run(ts, ts)
    const { completeHearing } = await import('../electron/main/services/hearings')
    completeHearing(
      {
        id: admin.id,
        username: admin.username,
        fullName: admin.full_name,
        roleCode: 'admin',
        permissions: ['hearings.update']
      },
      'h-sib-1',
      'n-sib-1'
    )
    const h1 = db.prepare(`SELECT status FROM hearings WHERE id = 'h-sib-1'`).get() as { status: string }
    const h2 = db.prepare(`SELECT status FROM hearings WHERE id = 'h-sib-2'`).get() as { status: string }
    expect(h1.status).toBe('done')
    expect(h2.status).toBe('done')
    const n1 = db.prepare(`SELECT deleted_at FROM notifications WHERE id = 'n-sib-1'`).get() as { deleted_at: string | null }
    const n2 = db.prepare(`SELECT deleted_at FROM notifications WHERE id = 'n-sib-2'`).get() as { deleted_at: string | null }
    expect(n1.deleted_at).toBeTruthy()
    expect(n2.deleted_at).toBeTruthy()
  })

  it('keeps the original client, contacts, links, and documents when copying to opponents', async () => {
    const db = await boot()
    const ts = new Date().toISOString()
    const admin = db.prepare(`SELECT id, username, full_name FROM users WHERE username = 'admin'`).get() as {
      id: string
      username: string
      full_name: string
    }
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, national_id, client_type, created_at, updated_at)
       VALUES ('cl-copy', 'CL-9', 'أحمد نسخة', '29001011234567', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO client_contacts (id, client_id, name, phone, created_at, updated_at)
       VALUES ('ct1', 'cl-copy', 'جهة اتصال', '01000000000', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs-copy', '100', 'قضية نسخ', 'cl-copy', 'open', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO case_clients (id, case_id, client_id, is_primary, created_at, updated_at)
       VALUES ('cc1', 'cs-copy', 'cl-copy', 1, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO documents (id, title, category, client_id, file_path, file_name, created_at, updated_at)
       VALUES ('d1', 'مستند', 'other', 'cl-copy', 'x.pdf', 'x.pdf', ?, ?)`
    ).run(ts, ts)
    const { copyClientToOpponent } = await import('../electron/main/services/people')
    const dest = copyClientToOpponent(
      {
        id: admin.id,
        username: admin.username,
        fullName: admin.full_name,
        roleCode: 'admin',
        permissions: ['opponents.manage']
      },
      'cl-copy'
    )
    expect(dest.id).toBeTruthy()
    expect(dest.id).not.toBe('cl-copy')
    const client = db.prepare(`SELECT deleted_at FROM clients WHERE id = 'cl-copy'`).get() as { deleted_at: string | null }
    expect(client.deleted_at).toBeNull()
    const contact = db.prepare(`SELECT deleted_at FROM client_contacts WHERE id = 'ct1'`).get() as {
      deleted_at: string | null
    }
    expect(contact.deleted_at).toBeNull()
    const link = db.prepare(`SELECT deleted_at FROM case_clients WHERE id = 'cc1'`).get() as { deleted_at: string | null }
    expect(link.deleted_at).toBeNull()
    const doc = db.prepare(`SELECT client_id, opponent_id, deleted_at FROM documents WHERE id = 'd1'`).get() as {
      client_id: string
      opponent_id: string | null
      deleted_at: string | null
    }
    expect(doc.client_id).toBe('cl-copy')
    expect(doc.opponent_id).toBeNull()
    expect(doc.deleted_at).toBeNull()
    const opponent = db.prepare(`SELECT deleted_at, full_name FROM opponents WHERE id = ?`).get(dest.id) as {
      deleted_at: string | null
      full_name: string
    }
    expect(opponent.deleted_at).toBeNull()
    expect(opponent.full_name).toBe('أحمد نسخة')
  })
})
