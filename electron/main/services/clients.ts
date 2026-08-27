import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { shouldMaskClientContact } from '@shared/permissions'
import { clientSchema, parseSchema } from '@shared/schemas'
import { rememberLookup } from './lookups'

export function listClients(query: ListQuery = {}, actor?: AuthedUser | null) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE is_archived = 0 AND ${notDeleted()}`
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
    .prepare(`SELECT * FROM clients ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows: maskClientRows(rows, actor), total, page, pageSize }
}

export function searchClients(term: string, actor?: AuthedUser | null) {
  const db = getDb()
  const s = `%${term}%`
  const rows = db
    .prepare(
      `SELECT DISTINCT c.* FROM clients c
       LEFT JOIN cases cs ON cs.client_id = c.id AND ${notDeleted('cs')}
       WHERE ${notDeleted('c')} AND (c.full_name LIKE ? OR c.client_number LIKE ? OR c.phone LIKE ? OR c.national_id LIKE ?
          OR cs.case_number LIKE ?)
       LIMIT 50`
    )
    .all(s, s, s, s, s)
  return maskClientRows(rows, actor)
}

export function getClient(id: string, actor?: AuthedUser | null) {
  const db = getDb()
  const client = db.prepare(`SELECT * FROM clients WHERE id = ? AND ${notDeleted()}`).get(id)
  if (!client) throw new Error('العميل غير موجود')
  const contacts = db.prepare(`SELECT * FROM client_contacts WHERE client_id = ? AND ${notDeleted()}`).all(id)
  const masked = maskClientRows([client], actor)[0] as Record<string, unknown>
  return { ...masked, contacts: shouldMask(actor) ? maskContacts(contacts) : contacts }
}

export function clientProfile(id: string, actor?: AuthedUser | null) {
  const db = getDb()
  const client = getClient(id, actor)
  const cases = db
    .prepare(
      `SELECT c.*, COALESCE(cf.total_fees,0) as total_fees, COALESCE(cf.paid,0) as paid, COALESCE(cf.remaining,0) as remaining
       FROM cases c LEFT JOIN case_fees cf ON cf.case_id = c.id AND ${notDeleted('cf')}
       WHERE c.client_id = ? AND ${notDeleted('c')} ORDER BY remaining DESC, c.created_at DESC`
    )
    .all(id)
  const hearings = db
    .prepare(
      `SELECT h.*, cs.title as case_title, cs.case_number FROM hearings h
       JOIN cases cs ON cs.id = h.case_id WHERE cs.client_id = ? AND ${notDeleted('h')} AND ${notDeleted('cs')}
       ORDER BY h.hearing_date DESC`
    )
    .all(id)
  const documents = db.prepare(`SELECT * FROM documents WHERE client_id = ? AND ${notDeleted()} ORDER BY created_at DESC`).all(id)
  const contracts = db.prepare(`SELECT * FROM contracts WHERE client_id = ? AND ${notDeleted()} ORDER BY created_at DESC`).all(id)
  const payments = db.prepare(`SELECT * FROM payments WHERE client_id = ? AND ${notDeleted()} ORDER BY created_at DESC`).all(id)
  const expenses = db.prepare(`SELECT * FROM expenses WHERE client_id = ? AND ${notDeleted()} ORDER BY created_at DESC`).all(id)
  const appointments = db.prepare(`SELECT * FROM appointments WHERE client_id = ? AND ${notDeleted()} ORDER BY date DESC`).all(id)
  const tasks = db.prepare(`SELECT * FROM tasks WHERE client_id = ? AND ${notDeleted()} ORDER BY created_at DESC`).all(id)
  const due = db
    .prepare(
      `SELECT COALESCE(SUM(remaining),0) as due FROM case_fees cf
       JOIN cases c ON c.id = cf.case_id WHERE c.client_id = ? AND ${notDeleted('cf')} AND ${notDeleted('c')}`
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
  const id = newId()
  db.prepare(
    `INSERT INTO clients (
        id, client_number, full_name, trade_name, national_id, phone, phone2, whatsapp, email, address,
        governorate, district, client_type, profession, birth_date, extra_data, notes,
        commercial_register, tax_id, manager_name, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
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
  recordLocalChange('clients', id, 'INSERT')
  rememberClientLookups(data)
  const contacts = (data.contacts as { name: string; position?: string; phone?: string; email?: string }[]) ?? []
  for (const c of contacts) {
    if (!c.name) continue
    const cid = newId()
    db.prepare(
      'INSERT INTO client_contacts (id, client_id, name, position, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(cid, id, c.name, c.position ?? null, c.phone ?? null, c.email ?? null, ts, ts)
    recordLocalChange('client_contacts', cid, 'INSERT')
  }
  audit(actor, 'create', 'clients', id, `تم إنشاء العميل ${fullName} برقم ${number}`)
  return { id, client_number: number }
}

export function updateClient(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(clientSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT * FROM clients WHERE id = ? AND ${notDeleted()}`).get(id) as Record<string, unknown> | undefined
  if (!old) throw new Error('العميل غير موجود')
  const keepContact = shouldMask(actor)
  db.prepare(
    `UPDATE clients SET full_name=?, trade_name=?, national_id=?, phone=?, phone2=?, whatsapp=?, email=?,
      address=?, governorate=?, district=?, client_type=?, profession=?, birth_date=?, extra_data=?, notes=?,
      commercial_register=?, tax_id=?, manager_name=?, updated_at=? WHERE id=?`
  ).run(
    data.full_name,
    data.trade_name ?? null,
    data.national_id ?? null,
    keepContact ? old.phone : data.phone ?? null,
    keepContact ? old.phone2 : data.phone2 ?? null,
    keepContact ? old.whatsapp : data.whatsapp ?? null,
    keepContact ? old.email : data.email ?? null,
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
  recordLocalChange('clients', id, 'UPDATE')
  rememberClientLookups(data)
  if (Array.isArray(data.contacts)) {
    const oldContacts = db
      .prepare(`SELECT id FROM client_contacts WHERE client_id = ? AND ${notDeleted()}`)
      .all(id) as { id: string }[]
    for (const c of oldContacts) softDelete('client_contacts', c.id)
    const ts = nowIso()
    for (const c of data.contacts as { name: string; position?: string; phone?: string; email?: string }[]) {
      if (!c.name) continue
      const cid = newId()
      db.prepare(
        'INSERT INTO client_contacts (id, client_id, name, position, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(cid, id, c.name, c.position ?? null, c.phone ?? null, c.email ?? null, ts, ts)
      recordLocalChange('client_contacts', cid, 'INSERT')
    }
  }
  audit(actor, 'update', 'clients', id, `تم تعديل بيانات العميل ${data.full_name}`, old, data)
  return { id }
}

export function removeClient(actor: AuthedUser, id: string) {
  const db = getDb()
  const old = db.prepare(`SELECT * FROM clients WHERE id = ? AND ${notDeleted()}`).get(id) as { full_name: string } | undefined
  if (!old) throw new Error('العميل غير موجود')
  const cases = db.prepare(`SELECT COUNT(*) as c FROM cases WHERE client_id = ? AND ${notDeleted()}`).get(id) as { c: number }
  if (cases.c > 0) {
    throw new Error('لا يمكن حذف عميل لديه قضايا. قم بمعالجة القضايا المرتبطة أولاً أو أرشفة العميل')
  }
  const contacts = db.prepare(`SELECT id FROM client_contacts WHERE client_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const c of contacts) softDelete('client_contacts', c.id)
  softDelete('clients', id)
  audit(actor, 'delete', 'clients', id, `تم حذف العميل ${old.full_name}`)
}

function rememberClientLookups(data: Record<string, unknown>) {
  rememberLookup('capacity', data.trade_name)
  rememberLookup('governorate', data.governorate)
  rememberLookup('district', data.district)
  rememberLookup('profession', data.profession)
}

function shouldMask(user?: AuthedUser | null) {
  if (!user) return false
  return shouldMaskClientContact(user.roleCode, user.permissions)
}

function maskPhone(v: unknown) {
  const s = String(v ?? '')
  if (!s) return s
  if (s.length <= 4) return '****'
  return `${s.slice(0, 3)}****${s.slice(-2)}`
}

function maskEmail(v: unknown) {
  const s = String(v ?? '')
  const at = s.indexOf('@')
  if (!s) return s
  if (at < 1) return '****'
  return `${s[0]}***${s.slice(at)}`
}

export function maskClientContactFields(rows: unknown[], actor?: AuthedUser | null) {
  if (!shouldMask(actor)) return rows
  return (rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    phone: maskPhone(r.phone),
    phone2: maskPhone(r.phone2),
    whatsapp: maskPhone(r.whatsapp),
    email: maskEmail(r.email)
  }))
}

function maskClientRows(rows: unknown[], actor?: AuthedUser | null) {
  return maskClientContactFields(rows, actor)
}

function maskContacts(rows: unknown[]) {
  return (rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    phone: maskPhone(r.phone),
    email: maskEmail(r.email)
  }))
}

