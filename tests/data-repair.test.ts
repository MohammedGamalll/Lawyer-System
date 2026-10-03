import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { archiveCaseRecnoFromHex } from '../shared/archiveMigrate'
import { extractHexFromPayload } from '../electron/main/services/dataRepair'
import { IPC } from '../shared/ipc'

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

describe('extractHexFromPayload', () => {
  it('exposes clients:merge for the Clients page action', () => {
    expect(IPC.clients.merge).toBe('clients:merge')
  })

  it('prefers a Hex column and decodes the case recno', () => {
    expect(extractHexFromPayload({ Hex: '99     5F5', 'نوع الجلسة': 'موضوع' })).toBe('99     5F5')
    expect(archiveCaseRecnoFromHex('5F5', 1)).toBe(512)
  })
})

describe.skipIf(!sqliteAvailable())('orphan hearing relink and client merge', () => {
  let dir: string

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  async function boot() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-data-repair-'))
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

  it('relinks an orphan hearing using the correct Hex recno', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('cl1', 'CL-1', 'موكل', 'individual', ?, ?),
              ('cl-orphan', 'CL-9', 'أرشيف غير مربوط — Mas002', 'individual', ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, created_at, updated_at)
       VALUES ('cs-real', 'CS-00512', 'قضية حقيقية', 'cl1', 'open', 0, ?, ?),
              ('cs-orphan', 'CS-00999', 'قضية غير مربوطة — أرشيف Mas002', 'cl-orphan', 'closed', 1, ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at)
       VALUES ('h1', 'cs-orphan', '2020-01-01', 'upcoming', ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO legacy_import_rows
        (id, batch_id, source_file, source_row, entity_hint, payload_json, mapped_table, mapped_id, link_status, created_at)
       VALUES
        ('r-case', 'b1', 'Mas002_CASES1_MAS.csv', 512, 'case', '{}', 'cases', 'cs-real', 'linked', ?),
        ('r-h', 'b1', 'Mas002_Cases2_mas.csv', 1, 'hearing', ?, 'hearings', 'h1', 'orphan', ?)`
    ).run(ts, JSON.stringify({ Hex: '5F5', 'نوع الجلسة': 'موضوع' }), ts)

    const { auditOfficeData, relinkOrphanHearings } = await import('../electron/main/services/dataRepair')
    const dry = relinkOrphanHearings(false)
    expect(dry.wouldRelink).toBe(1)
    expect((db.prepare(`SELECT case_id FROM hearings WHERE id='h1'`).get() as { case_id: string }).case_id).toBe(
      'cs-orphan'
    )

    const applied = relinkOrphanHearings(true)
    expect(applied.relinked).toBe(1)
    expect((db.prepare(`SELECT case_id FROM hearings WHERE id='h1'`).get() as { case_id: string }).case_id).toBe(
      'cs-real'
    )

    const audit = auditOfficeData()
    expect(audit.case512.some((c) => c.id === 'cs-real')).toBe(true)
    expect(audit.orphanTitleHearings).toBe(0)
  })

  it('merges a chosen duplicate client into the kept record', async () => {
    const db = await boot()
    const ts = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
       VALUES ('keep', 'CL-1', 'سوريا', 'individual', ?, ?),
              ('dup', 'CL-2', 'سوريه', 'individual', ?, ?)`
    ).run(ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, is_archived, created_at, updated_at)
       VALUES ('cs1', 'CS-00001', 'قضية', 'dup', 'open', 0, ?, ?)`
    ).run(ts, ts)
    db.prepare(
      `INSERT INTO case_clients (id, case_id, client_id, is_primary, sort_order, created_at, updated_at)
       VALUES ('cc1', 'cs1', 'dup', 1, 0, ?, ?)`
    ).run(ts, ts)

    const { mergeClientsByChoice } = await import('../electron/main/services/dataRepair')
    mergeClientsByChoice(actor, 'keep', 'dup')
    expect((db.prepare(`SELECT client_id FROM cases WHERE id='cs1'`).get() as { client_id: string }).client_id).toBe(
      'keep'
    )
    expect((db.prepare(`SELECT deleted_at FROM clients WHERE id='dup'`).get() as { deleted_at: string | null }).deleted_at).toBeTruthy()
    const primary = db
      .prepare(`SELECT client_id FROM case_clients WHERE case_id='cs1' AND is_primary=1 AND deleted_at IS NULL`)
      .get() as { client_id: string }
    expect(primary.client_id).toBe('keep')
  })
})
