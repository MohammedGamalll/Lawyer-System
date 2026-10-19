import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

describe.skipIf(!sqliteAvailable())('office feedback pack', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-office-feedback-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    const { initDatabase, closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    return initDatabase(path.join(dir, 't.db'))
  }

  const actor = {
    id: 'u1',
    username: 'admin',
    fullName: 'Admin',
    roleCode: 'admin',
    permissions: [] as string[]
  }

  it('stems dated admin lookups to the first two words and copies decision text to the next hearing', async () => {
    const db = await boot()
    const ts = '2026-10-10T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at)
       VALUES ('cs1', 'CS-00010', 'قضية', 'cl1', 'open', ?, ?),
              ('cs2', 'CS-00011', 'قضية تالية', 'cl1', 'open', ?, ?)`
    ).run(ts, ts, ts, ts)

    const { rememberLookup, listLookups } = await import('../electron/main/services/lookups')
    rememberLookup('admin_action', 'استلام إعلان لجلسة 5/9')
    rememberLookup('admin_action', 'استلام إعلان لجلسة 12/11')
    rememberLookup('execution_action', 'تصوير تقرير 1/2')
    const admin = listLookups('admin_action').map((r) => r.value)
    expect(admin.filter((v) => v === 'استلام إعلان')).toHaveLength(1)
    expect(listLookups('execution_action').some((r) => r.value === 'تصوير تقرير')).toBe(true)

    const { getAdjacentCase } = await import('../electron/main/services/cases')
    expect(getAdjacentCase('cs1', 1)).toEqual({ id: 'cs2' })
    expect(getAdjacentCase('cs1', -1)).toBeNull()

    const { createHearing, listHearings, getHearing } = await import('../electron/main/services/hearings')
    createHearing(actor, {
      case_id: 'cs1',
      hearing_date: '2026-10-10',
      court_decision: 'إعادة إعلان من جلسة 1/11',
      next_hearing_date: '2026-10-29',
      status: 'upcoming'
    })
    const next = db
      .prepare(`SELECT previous_decision, hearing_date FROM hearings WHERE case_id = 'cs1' AND hearing_date = '2026-10-29'`)
      .get() as { previous_decision?: string; hearing_date?: string } | undefined
    expect(next?.hearing_date).toBe('2026-10-29')
    expect(String(next?.previous_decision || '')).toContain('إعادة إعلان')
    expect(String(next?.previous_decision || '')).not.toMatch(/^29$/)
    expect(String(next?.previous_decision || '')).not.toContain('29/10')

    createHearing(actor, {
      case_id: 'cs2',
      hearing_date: '2026-10-10',
      court_decision: 'جلسة 29/10',
      next_hearing_date: '2026-10-29',
      status: 'upcoming'
    })
    const listed = listHearings({ page: 1, pageSize: 50, filters: { case_id: 'cs2' } })
    const shown = (listed.rows as { hearing_date?: string; previous_decision?: string }[]).find(
      (r) => r.hearing_date === '2026-10-29'
    )
    expect(String(shown?.previous_decision || '')).toBe('')
    const stored = db
      .prepare(`SELECT id FROM hearings WHERE case_id = 'cs2' AND hearing_date = '2026-10-29'`)
      .get() as { id: string }
    const got = getHearing(stored.id) as { previous_decision?: string }
    expect(String(got.previous_decision || '')).toBe('')
    expect(String(got.previous_decision || '')).not.toMatch(/29/)
  }, 20000)

  it('filters advanced search by venue and unfinished work, and alerts overdue tasks', async () => {
    const db = await boot()
    const ts = '2026-10-10T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, court, session_place, created_at, updated_at)
       VALUES ('cs-open', 'CS-00020', 'قضية مفتوحة', 'cl1', 'open', 'الجيزة', 'إمبابة', ?, ?),
              ('cs-old', 'CS-00021', 'قضية قديمة', 'cl1', 'open', 'العباسية', 'العباسية', ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO tasks (id, title, description, venue, case_id, due_date, status, work_kind, created_at, updated_at)
       VALUES ('t-open', 'عمل', 'استلام إعلان', 'إمبابة', 'cs-open', '2020-10-12', 'not_done', 'admin', ?, ?),
              ('t-done', 'عمل قديم', 'إيداع', 'العباسية', 'cs-old', '2020-01-01', 'completed', 'admin', ?, ?)`
    ).run(ts, ts, ts, ts)

    const { advancedSearch } = await import('../electron/main/services/reports')
    const openAdmin = advancedSearch({ scope: 'admin', action_status: 'open', venue: 'إمبابة' }) as { id: string }[]
    expect(openAdmin.some((r) => r.id === 't-open')).toBe(true)
    expect(openAdmin.some((r) => r.id === 't-done')).toBe(false)

    const openCases = advancedSearch({ scope: 'cases', action_status: 'open' }) as { id: string }[]
    expect(openCases.some((r) => r.id === 'cs-open')).toBe(true)
    expect(openCases.some((r) => r.id === 'cs-old')).toBe(false)

    const { generateDailyNotifications } = await import('../electron/main/services/reminders')
    generateDailyNotifications()
    const { listNotifications } = await import('../electron/main/services/schedule')
    const notes = listNotifications('anyone') as { related_id?: string; related_type?: string }[]
    expect(notes.some((n) => n.related_id === 't-open' && n.related_type === 'task')).toBe(true)
  }, 20000)
})
