import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { caseSchema, parseSchema } from '@shared/schemas'

export function listCases(query: ListQuery = {}, archived = 0) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = [archived]
  let where = 'WHERE c.is_archived = ?'
  if (query.search) {
    where += ` AND (c.title LIKE ? OR c.case_number LIKE ? OR c.internal_file_number LIKE ? OR cl.full_name LIKE ?)`
    const s = `%${query.search}%`
    params.push(s, s, s, s)
  }
  const f = query.filters ?? {}
  if (f.status) {
    where += ' AND c.status = ?'
    params.push(f.status)
  }
  if (f.case_type_id) {
    where += ' AND c.case_type_id = ?'
    params.push(f.case_type_id)
  }
  if (f.primary_lawyer_id) {
    where += ' AND c.primary_lawyer_id = ?'
    params.push(f.primary_lawyer_id)
  }
  if (f.client_id) {
    where += ' AND c.client_id = ?'
    params.push(f.client_id)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM cases c JOIN clients cl ON cl.id = c.client_id ${where}`).get(...params) as {
      c: number
    }
  ).c
  const rows = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, cl.client_number, ct.name_ar as case_type_name,
              l.full_name as lawyer_name
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN case_types ct ON ct.id = c.case_type_id
       LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id
       ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getCase(id: number) {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, ct.name_ar as case_type_name, l.full_name as lawyer_name,
              al.full_name as assistant_lawyer_name
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN case_types ct ON ct.id = c.case_type_id
       LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id
       LEFT JOIN lawyers al ON al.id = c.assistant_lawyer_id
       WHERE c.id = ?`
    )
    .get(id)
  if (!row) throw new Error('القضية غير موجودة')
  const links = db
    .prepare(
      `SELECT cln.*, cs.case_number, cs.title FROM case_links cln JOIN cases cs ON cs.id = cln.related_case_id WHERE cln.case_id = ?`
    )
    .all(id)
  const opponents = db
    .prepare(
      `SELECT o.* FROM opponents o JOIN case_opponents co ON co.opponent_id = o.id WHERE co.case_id = ?`
    )
    .all(id)
  const fees = db.prepare('SELECT * FROM case_fees WHERE case_id = ?').get(id)
  const hearings = db.prepare('SELECT * FROM hearings WHERE case_id = ? ORDER BY hearing_date DESC').all(id)
  const payments = db.prepare('SELECT * FROM payments WHERE case_id = ? ORDER BY payment_date DESC, id DESC').all(id)
  const documents = db.prepare('SELECT id, title, category, file_name, current_version FROM documents WHERE case_id = ? ORDER BY id DESC').all(id)
  return { ...(row as object), links, opponents, fees, hearings, payments, documents }
}

export function createCase(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(caseSchema, data) as Record<string, unknown>
  const clientId = Number(data.client_id)
  if (!clientId) throw new Error('لا يمكن إنشاء قضية بدون عميل')
  const title = String(data.title ?? '').trim()
  if (!title) throw new Error('اسم القضية مطلوب')
  const db = getDb()
  const client = db.prepare('SELECT id, full_name FROM clients WHERE id = ?').get(clientId)
  if (!client) throw new Error('العميل غير موجود')
  const ts = nowIso()
  const number = nextNumber(db, 'case')
  const info = db
    .prepare(
      `INSERT INTO cases (
        case_number, internal_file_number, title, client_id, primary_lawyer_id, assistant_lawyer_id,
        case_type_id, category, court, circuit, governorate, court_address, circuit_number, litigation_degree,
        filing_date, received_date, status, case_value, opponent_name, opponent_lawyer, opponent_case_number,
        description, summary, notes, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      data.internal_file_number ?? null,
      title,
      clientId,
      data.primary_lawyer_id || null,
      data.assistant_lawyer_id || null,
      data.case_type_id || null,
      data.category ?? null,
      data.court ?? null,
      data.circuit ?? null,
      data.governorate ?? null,
      data.court_address ?? null,
      data.circuit_number ?? null,
      data.litigation_degree ?? null,
      data.filing_date ?? null,
      data.received_date ?? null,
      data.status ?? 'new',
      data.case_value ?? null,
      data.opponent_name ?? null,
      data.opponent_lawyer ?? null,
      data.opponent_case_number ?? null,
      data.description ?? null,
      data.summary ?? null,
      data.notes ?? null,
      ts,
      ts,
      actor.id
    )
  const id = Number(info.lastInsertRowid)
  if (data.total_fees) {
    const total = Number(data.total_fees)
    db.prepare(
      `INSERT INTO case_fees (case_id, total_fees, paid, remaining, due_date, payment_method, installment_count)
       VALUES (?, ?, 0, ?, ?, ?, ?)`
    ).run(id, total, total, data.fees_due_date ?? null, data.payment_method ?? null, data.installment_count ?? 1)
  }
  if (data.related_case_id && data.link_type) {
    db.prepare('INSERT INTO case_links (case_id, related_case_id, link_type) VALUES (?,?,?)').run(
      id,
      data.related_case_id,
      data.link_type
    )
  }
  audit(actor, 'create', 'cases', id, `تم إنشاء القضية ${number} — ${title}`)
  return { id, case_number: number }
}

export function updateCase(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  data = parseSchema(caseSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as { case_number: string; status: string } | undefined
  if (!old) throw new Error('القضية غير موجودة')
  if (!data.client_id) throw new Error('لا يمكن حفظ قضية بدون عميل')
  const closedAt = data.status === 'closed' && old.status !== 'closed' ? nowIso() : null
  db.prepare(
    `UPDATE cases SET internal_file_number=?, title=?, client_id=?, primary_lawyer_id=?, assistant_lawyer_id=?,
      case_type_id=?, category=?, court=?, circuit=?, governorate=?, court_address=?, circuit_number=?,
      litigation_degree=?, filing_date=?, received_date=?, status=?, case_value=?, opponent_name=?,
      opponent_lawyer=?, opponent_case_number=?, description=?, summary=?, notes=?, closed_at=COALESCE(?, closed_at),
      updated_at=? WHERE id=?`
  ).run(
    data.internal_file_number ?? null,
    data.title,
    data.client_id,
    data.primary_lawyer_id || null,
    data.assistant_lawyer_id || null,
    data.case_type_id || null,
    data.category ?? null,
    data.court ?? null,
    data.circuit ?? null,
    data.governorate ?? null,
    data.court_address ?? null,
    data.circuit_number ?? null,
    data.litigation_degree ?? null,
    data.filing_date ?? null,
    data.received_date ?? null,
    data.status ?? 'new',
    data.case_value ?? null,
    data.opponent_name ?? null,
    data.opponent_lawyer ?? null,
    data.opponent_case_number ?? null,
    data.description ?? null,
    data.summary ?? null,
    data.notes ?? null,
    closedAt,
    nowIso(),
    id
  )
  if (data.total_fees != null) {
    const total = Number(data.total_fees)
    const paidRow = db.prepare('SELECT paid FROM case_fees WHERE case_id = ?').get(id) as { paid: number } | undefined
    const paid = paidRow?.paid ?? 0
    db.prepare(
      `INSERT INTO case_fees (case_id, total_fees, paid, remaining, due_date, payment_method, installment_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(case_id) DO UPDATE SET total_fees=excluded.total_fees, remaining=excluded.total_fees-case_fees.paid,
         due_date=excluded.due_date, payment_method=excluded.payment_method, installment_count=excluded.installment_count`
    ).run(
      id,
      total,
      paid,
      total - paid,
      data.fees_due_date ?? null,
      data.payment_method ?? null,
      data.installment_count ?? 1
    )
  }
  audit(actor, 'update', 'cases', id, `قام المستخدم ${actor.username} بتعديل بيانات القضية رقم ${old.case_number}`, old, data)
  return { id }
}

export function removeCase(actor: AuthedUser, id: number) {
  const db = getDb()
  const old = db.prepare('SELECT case_number FROM cases WHERE id = ?').get(id) as { case_number: string } | undefined
  if (!old) throw new Error('القضية غير موجودة')
  db.prepare('DELETE FROM cases WHERE id = ?').run(id)
  audit(actor, 'delete', 'cases', id, `تم حذف القضية ${old.case_number}`)
}

export function linkCases(actor: AuthedUser, caseId: number, relatedId: number, linkType: string) {
  if (caseId === relatedId) throw new Error('لا يمكن ربط القضية بنفسها')
  getDb().prepare('INSERT INTO case_links (case_id, related_case_id, link_type) VALUES (?,?,?)').run(caseId, relatedId, linkType)
  audit(actor, 'update', 'cases', caseId, `تم ربط القضية بقضية أخرى (${linkType})`)
}

export function archiveCase(actor: AuthedUser, id: number, archive = true) {
  const db = getDb()
  db.prepare('UPDATE cases SET is_archived = ?, updated_at = ? WHERE id = ?').run(archive ? 1 : 0, nowIso(), id)
  audit(actor, archive ? 'archive' : 'restore', 'cases', id, archive ? 'تم أرشفة القضية' : 'تم استرجاع القضية من الأرشيف')
}

export function listCaseTypes() {
  return getDb().prepare('SELECT * FROM case_types ORDER BY sort_order, id').all()
}

export function createCaseType(actor: AuthedUser, nameAr: string, nameEn?: string) {
  if (!nameAr.trim()) throw new Error('اسم النوع مطلوب')
  const info = getDb()
    .prepare('INSERT INTO case_types (name_ar, name_en, is_active, sort_order) VALUES (?, ?, 1, 99)')
    .run(nameAr.trim(), nameEn ?? nameAr.trim())
  audit(actor, 'create', 'case_types', Number(info.lastInsertRowid), `تمت إضافة نوع قضية: ${nameAr}`)
  return { id: Number(info.lastInsertRowid) }
}

export function updateCaseType(id: number, data: Record<string, unknown>) {
  getDb()
    .prepare('UPDATE case_types SET name_ar=?, name_en=?, is_active=? WHERE id=?')
    .run(data.name_ar, data.name_en ?? data.name_ar, data.is_active ?? 1, id)
}

export function removeCaseType(id: number) {
  const used = getDb().prepare('SELECT COUNT(*) as c FROM cases WHERE case_type_id = ?').get(id) as { c: number }
  if (used.c > 0) throw new Error('لا يمكن حذف نوع مرتبط بقضايا')
  getDb().prepare('DELETE FROM case_types WHERE id = ?').run(id)
}
