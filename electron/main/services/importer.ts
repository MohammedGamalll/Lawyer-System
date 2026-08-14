import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { createClient } from './clients'
import { createCase } from './cases'
import type { AuthedUser } from '../ipc/helpers'
import { audit } from './audit'

export async function buildTemplate(kind: 'clients' | 'cases'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(kind === 'clients' ? 'العملاء' : 'القضايا')
  if (kind === 'clients') {
    ws.addRow(['الاسم الكامل*', 'الاسم التجاري', 'الرقم القومي', 'الهاتف', 'واتساب', 'البريد', 'العنوان', 'المحافظة', 'نوع العميل', 'المهنة', 'ملاحظات'])
  } else {
    ws.addRow(['اسم القضية*', 'رقم العميل أو الاسم*', 'نوع القضية', 'المحكمة', 'الحالة', 'تاريخ الاستلام', 'الخصم', 'الوصف'])
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export async function previewImport(kind: 'clients' | 'cases', buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  const rows: { index: number; data: Record<string, string>; errors: string[] }[] = []
  ws.eachRow((row, i) => {
    if (i === 1) return
    const values = row.values as unknown[]
    const errors: string[] = []
    if (kind === 'clients') {
      const data = {
        full_name: String(values[1] ?? '').trim(),
        trade_name: String(values[2] ?? '').trim(),
        national_id: String(values[3] ?? '').trim(),
        phone: String(values[4] ?? '').trim(),
        whatsapp: String(values[5] ?? '').trim(),
        email: String(values[6] ?? '').trim(),
        address: String(values[7] ?? '').trim(),
        governorate: String(values[8] ?? '').trim(),
        client_type: mapClientType(String(values[9] ?? '')),
        profession: String(values[10] ?? '').trim(),
        notes: String(values[11] ?? '').trim()
      }
      if (!data.full_name) errors.push('الاسم مطلوب')
      rows.push({ index: i, data, errors })
    } else {
      const data = {
        title: String(values[1] ?? '').trim(),
        client_ref: String(values[2] ?? '').trim(),
        case_type: String(values[3] ?? '').trim(),
        court: String(values[4] ?? '').trim(),
        status: mapStatus(String(values[5] ?? '')),
        received_date: String(values[6] ?? '').trim(),
        opponent_name: String(values[7] ?? '').trim(),
        description: String(values[8] ?? '').trim()
      }
      if (!data.title) errors.push('اسم القضية مطلوب')
      if (!data.client_ref) errors.push('العميل مطلوب')
      rows.push({ index: i, data, errors })
    }
  })
  return { rows, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length }
}

export async function commitImport(
  actor: AuthedUser,
  kind: 'clients' | 'cases',
  buffer: Buffer,
  updateOnDuplicate = false
) {
  const preview = await previewImport(kind, buffer)
  const db = getDb()
  const run = db.transaction(() => {
    let created = 0
    let updated = 0
    let skipped = 0
    for (const row of preview.rows) {
      if (row.errors.length) {
        skipped++
        continue
      }
      if (kind === 'clients') {
        const existing = db
          .prepare('SELECT id FROM clients WHERE full_name = ? AND (phone = ? OR national_id = ?)')
          .get(row.data.full_name, row.data.phone || '---', row.data.national_id || '---') as { id: number } | undefined
        if (existing && updateOnDuplicate) {
          db.prepare('UPDATE clients SET phone=?, address=?, notes=? WHERE id=?').run(
            row.data.phone || null,
            row.data.address || null,
            row.data.notes || null,
            existing.id
          )
          updated++
        } else if (existing) {
          skipped++
        } else {
          createClient(actor, row.data)
          created++
        }
      } else {
        const client = db
          .prepare('SELECT id FROM clients WHERE client_number = ? OR full_name = ?')
          .get(row.data.client_ref, row.data.client_ref) as { id: number } | undefined
        if (!client) {
          skipped++
          continue
        }
        const type = db.prepare('SELECT id FROM case_types WHERE name_ar = ?').get(row.data.case_type) as { id: number } | undefined
        createCase(actor, {
          title: row.data.title,
          client_id: client.id,
          case_type_id: type?.id,
          court: row.data.court,
          status: row.data.status || 'new',
          received_date: row.data.received_date,
          opponent_name: row.data.opponent_name,
          description: row.data.description
        })
        created++
      }
    }
    return { created, updated, skipped }
  })
  const result = run()
  audit(actor, 'import', kind, null, `استيراد ${kind}: إنشاء ${result.created} / تحديث ${result.updated} / تخطي ${result.skipped}`)
  return result
}

function mapClientType(v: string) {
  const t = v.trim()
  if (t.includes('شرك')) return 'company'
  if (t.includes('مؤسس')) return 'institution'
  if (t.includes('حكوم')) return 'government'
  if (['company', 'institution', 'government', 'other', 'individual'].includes(t)) return t
  return 'individual'
}

function mapStatus(v: string) {
  const map: Record<string, string> = {
    جديدة: 'new',
    'قيد الدراسة': 'under_review',
    مرفوعة: 'filed',
    'قيد المحاكمة': 'in_trial',
    مؤجلة: 'postponed',
    مغلقة: 'closed'
  }
  return map[v.trim()] || v.trim() || 'new'
}
