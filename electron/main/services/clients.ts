import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { clientSchema, parseSchema } from '@shared/schemas'

export function listClients(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE is_archived = 0'
  if (query.search) {
    where += ` AND (full_name LIKE ? OR client_number LIKE ? OR phone LIKE ? OR national_id LIKE ? OR trade_name LIKE ?)`
    const s = `%${query.search}%`
    params.push(s, s, s, s, s)
  }
  if (query.filters?.client_type) {
    where += ' AND client_type = ?'
    params.push(query.filters.client_type)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM clients ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(`SELECT * FROM clients ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function searchClients(term: string) {
  const db = getDb()
  const s = `%${term}%`
  return db
    .prepare(
      `SELECT DISTINCT c.* FROM clients c
       LEFT JOIN cases cs ON cs.client_id = c.id
       WHERE c.full_name LIKE ? OR c.client_number LIKE ? OR c.phone LIKE ? OR c.national_id LIKE ?
          OR cs.case_number LIKE ?
       LIMIT 50`
    )
    .all(s, s, s, s, s)
}

export function getClient(id: number) {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  if (!client) throw new Error('العميل غير موجود')
  const contacts = db.prepare('SELECT * FROM client_contacts WHERE client_id = ?').all(id)
  return { ...(client as object), contacts }
}

export function clientProfile(id: number) {
  const db = getDb()
  const client = getClient(id)
  const cases = db
    .prepare(
      `SELECT c.*, COALESCE(cf.total_fees,0) as total_fees, COALESCE(cf.paid,0) as paid, COALESCE(cf.remaining,0) as remaining
       FROM cases c LEFT JOIN case_fees cf ON cf.case_id = c.id
       WHERE c.client_id = ? ORDER BY remaining DESC, c.id DESC`
    )
    .all(id)
  const hearings = db
    .prepare(
      `SELECT h.*, cs.title as case_title, cs.case_number FROM hearings h
       JOIN cases cs ON cs.id = h.case_id WHERE cs.client_id = ? ORDER BY h.hearing_date DESC`
    )
    .all(id)
  const documents = db.prepare('SELECT * FROM documents WHERE client_id = ? ORDER BY id DESC').all(id)
  const contracts = db.prepare('SELECT * FROM contracts WHERE client_id = ? ORDER BY id DESC').all(id)
  const payments = db.prepare('SELECT * FROM payments WHERE client_id = ? ORDER BY id DESC').all(id)
  const expenses = db.prepare('SELECT * FROM expenses WHERE client_id = ? ORDER BY id DESC').all(id)
  const appointments = db.prepare('SELECT * FROM appointments WHERE client_id = ? ORDER BY date DESC').all(id)
  const tasks = db.prepare('SELECT * FROM tasks WHERE client_id = ? ORDER BY id DESC').all(id)
  const due = db
    .prepare(
      `SELECT COALESCE(SUM(remaining),0) as due FROM case_fees cf
       JOIN cases c ON c.id = cf.case_id WHERE c.client_id = ?`
    )
    .get(id) as { due: number }
  return { client, cases, hearings, documents, contracts, payments, expenses, appointments, tasks, due: due.due }
}

export function createClient(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(clientSchema, data) as Record<string, unknown>
  const fullName = String(data.full_name ?? '').trim()
  if (!fullName) throw new Error('اسم العميل مطلوب')
  const db = getDb()
  const ts = nowIso()
  const number = nextNumber(db, 'client')
  const info = db
    .prepare(
      `INSERT INTO clients (
        client_number, full_name, trade_name, national_id, phone, phone2, whatsapp, email, address,
        governorate, district, client_type, profession, birth_date, extra_data, notes,
        commercial_register, tax_id, manager_name, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      fullName,
      data.trade_name ?? null,
      data.national_id ?? null,
      data.phone ?? null,
      data.phone2 ?? null,
      data.whatsapp ?? null,
      data.email ?? null,
      data.address ?? null,
      data.governorate ?? null,
      data.district ?? null,
      data.client_type ?? 'individual',
      data.profession ?? null,
      data.birth_date ?? null,
      data.extra_data ?? null,
      data.notes ?? null,
      data.commercial_register ?? null,
      data.tax_id ?? null,
      data.manager_name ?? null,
      ts,
      ts,
      actor.id
    )
  const id = Number(info.lastInsertRowid)
  const contacts = (data.contacts as { name: string; position?: string; phone?: string; email?: string }[]) ?? []
  const insC = db.prepare(
    'INSERT INTO client_contacts (client_id, name, position, phone, email) VALUES (?,?,?,?,?)'
  )
  for (const c of contacts) {
    if (c.name) insC.run(id, c.name, c.position ?? null, c.phone ?? null, c.email ?? null)
  }
  audit(actor, 'create', 'clients', id, `تم إنشاء العميل ${fullName} برقم ${number}`)
  return { id, client_number: number }
}

export function updateClient(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  data = parseSchema(clientSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  if (!old) throw new Error('العميل غير موجود')
  db.prepare(
    `UPDATE clients SET full_name=?, trade_name=?, national_id=?, phone=?, phone2=?, whatsapp=?, email=?,
      address=?, governorate=?, district=?, client_type=?, profession=?, birth_date=?, extra_data=?, notes=?,
      commercial_register=?, tax_id=?, manager_name=?, updated_at=? WHERE id=?`
  ).run(
    data.full_name,
    data.trade_name ?? null,
    data.national_id ?? null,
    data.phone ?? null,
    data.phone2 ?? null,
    data.whatsapp ?? null,
    data.email ?? null,
    data.address ?? null,
    data.governorate ?? null,
    data.district ?? null,
    data.client_type ?? 'individual',
    data.profession ?? null,
    data.birth_date ?? null,
    data.extra_data ?? null,
    data.notes ?? null,
    data.commercial_register ?? null,
    data.tax_id ?? null,
    data.manager_name ?? null,
    nowIso(),
    id
  )
  if (Array.isArray(data.contacts)) {
    db.prepare('DELETE FROM client_contacts WHERE client_id = ?').run(id)
    const insC = db.prepare(
      'INSERT INTO client_contacts (client_id, name, position, phone, email) VALUES (?,?,?,?,?)'
    )
    for (const c of data.contacts as { name: string; position?: string; phone?: string; email?: string }[]) {
      if (c.name) insC.run(id, c.name, c.position ?? null, c.phone ?? null, c.email ?? null)
    }
  }
  audit(actor, 'update', 'clients', id, `تم تعديل بيانات العميل ${data.full_name}`, old, data)
  return { id }
}

export function removeClient(actor: AuthedUser, id: number) {
  const db = getDb()
  const old = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as { full_name: string } | undefined
  if (!old) throw new Error('العميل غير موجود')
  const cases = db.prepare('SELECT COUNT(*) as c FROM cases WHERE client_id = ?').get(id) as { c: number }
  if (cases.c > 0) {
    throw new Error('لا يمكن حذف عميل لديه قضايا. قم بمعالجة القضايا المرتبطة أولاً أو أرشفة العميل')
  }
  db.prepare('DELETE FROM clients WHERE id = ?').run(id)
  audit(actor, 'delete', 'clients', id, `تم حذف العميل ${old.full_name}`)
}
