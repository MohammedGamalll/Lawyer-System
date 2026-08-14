import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import ExcelJS from 'exceljs'
import { previewImport } from '../electron/main/services/importer'

async function xlsxClients(rows: string[][]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('العملاء')
  ws.addRow(['الاسم الكامل*', 'الاسم التجاري', 'الرقم القومي', 'الهاتف', 'واتساب', 'البريد', 'العنوان', 'المحافظة', 'نوع العميل', 'المهنة', 'ملاحظات'])
  for (const r of rows) ws.addRow(r)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function sqliteAvailable() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

describe('excel import preview', () => {
  it('previews valid and invalid client rows', async () => {
    const buf = await xlsxClients([
      ['أحمد علي', '', '29801011234567', '01012345678', '', '', 'القاهرة', 'القاهرة', 'فرد', 'محام', ''],
      ['', '', '', '', '', '', '', '', '', '', '']
    ])
    const preview = await previewImport('clients', buf)
    expect(preview.valid).toBe(1)
    expect(preview.invalid).toBe(1)
  })
})

describe.skipIf(!sqliteAvailable())('excel import commit and orphan file GC', () => {
  let dir: string
  const actor = {
    id: 'admin-test',
    username: 'admin',
    fullName: 'مدير',
    roleCode: 'admin',
    permissions: ['clients.create']
  }

  beforeEach(async () => {
    const { initDatabase } = await import('../electron/main/db/database')
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-imp-'))
    process.env.LAW_DATA_ROOT = dir
    process.env.LAW_DB_DRIVER = 'sqlite'
    initDatabase(path.join(dir, 't.db'))
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../electron/main/db/database')
    closeDatabase()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.LAW_DATA_ROOT
  })

  it('commits valid clients into sqlite', async () => {
    const { commitImport } = await import('../electron/main/services/importer')
    const { getDb } = await import('../electron/main/db/database')
    const buf = await xlsxClients([
      ['سارة محمد', 'شركة النور', '', '01123456789', '', 'sara@test.com', 'الجيزة', 'الجيزة', 'شركة', '', '']
    ])
    const result = await commitImport(actor, 'clients', buf, false)
    expect(result.created).toBe(1)
    const row = getDb().prepare('SELECT full_name, client_type FROM clients WHERE full_name=?').get('سارة محمد') as {
      full_name: string
      client_type: string
    }
    expect(row.client_type).toBe('company')
  })

  it('deletes orphan files not referenced by documents', async () => {
    const { garbageCollectOrphans } = await import('../electron/main/services/documents')
    const { getDocumentsDir } = await import('../electron/main/paths')
    const docs = getDocumentsDir()
    const orphan = path.join(docs, 'orphan-file.bin')
    fs.writeFileSync(orphan, 'x')
    const r = garbageCollectOrphans(actor)
    expect(r.deleted).toBeGreaterThanOrEqual(1)
    expect(fs.existsSync(orphan)).toBe(false)
  })
})
