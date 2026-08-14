import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { caseSchema, parseSchema } from '@shared/schemas'

export function listCases(query: ListQuery = {}, archived = 0) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = [archived]
  let where = `WHERE c.is_archived = ? AND ${notDeleted('c')} AND ${notDeleted('cl')}`
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
       LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
       LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getCase(id: string) {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, ct.name_ar as case_type_name, l.full_name as lawyer_name,
              al.full_name as assistant_lawyer_name
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
       LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
       LEFT JOIN lawyers al ON al.id = c.assistant_lawyer_id AND ${notDeleted('al')}
       WHERE c.id = ? AND ${notDeleted('c')}`
    )
    .get(id)
  if (!row) throw new Error('القضية غير موجودة')
  const links = db
    .prepare(
      `SELECT cln.*, cs.case_number, cs.title FROM case_links cln JOIN cases cs ON cs.id = cln.related_case_id
       WHERE cln.case_id = ? AND ${notDeleted('cln')} AND ${notDeleted('cs')}`
    )
    .all(id)
  const opponents = db
    .prepare(
      `SELECT o.* FROM opponents o JOIN case_opponents co ON co.opponent_id = o.id
       WHERE co.case_id = ? AND ${notDeleted('o')} AND ${notDeleted('co')}`
    )
    .all(id)
  const fees = db.prepare(`SELECT * FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(id)
  const hearings = db.prepare(`SELECT * FROM hearings WHERE case_id = ? AND ${notDeleted()} ORDER BY hearing_date DESC`).all(id)
  const payments = db
    .prepare(`SELECT * FROM payments WHERE case_id = ? AND ${notDeleted()} ORDER BY payment_date DESC, created_at DESC`)
    .all(id)
  const documents = db
    .prepare(
      `SELECT id, title, category, file_name, current_version FROM documents WHERE case_id = ? AND ${notDeleted()} ORDER BY created_at DESC`
    )
    .all(id)
  return { ...(row as object), links, opponents, fees, hearings, payments, documents }
}

function upsertCaseFees(
  db: ReturnType<typeof getDb>,
  caseId: string,
  total: number,
  dueDate: unknown,
  paymentMethod: unknown,
  installmentCount: unknown
) {
  const ts = nowIso()
  const existing = db.prepare(`SELECT id, paid FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(caseId) as
    | { id: string; paid: number }
    | undefined
  if (existing) {
    db.prepare(
      `UPDATE case_fees SET total_fees=?, remaining=?, due_date=?, payment_method=?, installment_count=?, updated_at=? WHERE id=?`
    ).run(total, total - existing.paid, dueDate ?? null, paymentMethod ?? null, installmentCount ?? 1, ts, existing.id)
    recordLocalChange('case_fees', existing.id, 'UPDATE')
  } else {
    const fid = newId()
    db.prepare(
      `INSERT INTO case_fees (id, case_id, total_fees, paid, remaining, due_date, payment_method, installment_count, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(fid, caseId, total, total, dueDate ?? null, paymentMethod ?? null, installmentCount ?? 1, ts, ts)
    recordLocalChange('case_fees', fid, 'INSERT')
  }
}

export function createCase(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(caseSchema, data) as Record<string, unknown>
  const clientId = asId(data.client_id)
  if (!clientId) throw new Error('لا يمكن إنشاء قضية بدون عميل')
  const title = String(data.title ?? '').trim()
  if (!title) throw new Error('اسم القضية مطلوب')
  const db = getDb()
  const client = db.prepare(`SELECT id, full_name FROM clients WHERE id = ? AND ${notDeleted()}`).get(clientId)
  if (!client) throw new Error('العميل غير موجود')
  const ts = nowIso()
  const number = nextNumber(db, 'case')
  const id = newId()
  db.prepare(
    `INSERT INTO cases (
        id, case_number, internal_file_number, title, client_id, primary_lawyer_id, assistant_lawyer_id,
        case_type_id, category, court, circuit, governorate, court_address, circuit_number, litigation_degree,
        filing_date, received_date, status, case_value, opponent_name, opponent_lawyer, opponent_case_number,
        description, summary, notes, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    data.internal_file_number ?? null,
    title,
    clientId,
    asIdOrNull(data.primary_lawyer_id),
    asIdOrNull(data.assistant_lawyer_id),
    asIdOrNull(data.case_type_id),
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
  recordLocalChange('cases', id, 'INSERT')
  if (data.total_fees) {
    upsertCaseFees(db, id, Number(data.total_fees), data.fees_due_date, data.payment_method, data.installment_count)
  }
  const relatedId = asIdOrNull(data.related_case_id)
  if (relatedId && data.link_type) {
    const lid = newId()
    db.prepare(
      'INSERT INTO case_links (id, case_id, related_case_id, link_type, created_at, updated_at) VALUES (?,?,?,?,?,?)'
    ).run(lid, id, relatedId, data.link_type, ts, ts)
    recordLocalChange('case_links', lid, 'INSERT')
  }
  audit(actor, 'create', 'cases', id, `تم إنشاء القضية ${number} — ${title}`)
  return { id, case_number: number }
}

export function updateCase(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  data = parseSchema(caseSchema, data) as Record<string, unknown>
  const db = getDb()
  const old = db.prepare(`SELECT * FROM cases WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { case_number: string; status: string }
    | undefined
  if (!old) throw new Error('القضية غير موجودة')
  const clientId = asId(data.client_id)
  if (!clientId) throw new Error('لا يمكن حفظ قضية بدون عميل')
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
    clientId,
    asIdOrNull(data.primary_lawyer_id),
    asIdOrNull(data.assistant_lawyer_id),
    asIdOrNull(data.case_type_id),
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
  recordLocalChange('cases', id, 'UPDATE')
  if (data.total_fees != null) {
    upsertCaseFees(db, id, Number(data.total_fees), data.fees_due_date, data.payment_method, data.installment_count)
  }
  audit(actor, 'update', 'cases', id, `قام المستخدم ${actor.username} بتعديل بيانات القضية رقم ${old.case_number}`, old, data)
  return { id }
}

export function removeCase(actor: AuthedUser, id: string) {
  const db = getDb()
  const old = db.prepare(`SELECT case_number FROM cases WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { case_number: string }
    | undefined
  if (!old) throw new Error('القضية غير موجودة')
  const links = db.prepare(`SELECT id FROM case_links WHERE (case_id = ? OR related_case_id = ?) AND ${notDeleted()}`).all(id, id) as {
    id: string
  }[]
  for (const l of links) softDelete('case_links', l.id)
  const opponents = db.prepare(`SELECT id FROM case_opponents WHERE case_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const o of opponents) softDelete('case_opponents', o.id)
  const fees = db.prepare(`SELECT id FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const f of fees) softDelete('case_fees', f.id)
  softDelete('cases', id)
  audit(actor, 'delete', 'cases', id, `تم حذف القضية ${old.case_number}`)
}

export function linkCases(actor: AuthedUser, caseId: string, relatedId: string, linkType: string) {
  caseId = asId(caseId)
  relatedId = asId(relatedId)
  if (!caseId || !relatedId) {
    throw new Error('اختر قضية مختلفة من القائمة ثم احفظ')
  }
  if (caseId === relatedId) throw new Error('لا يمكن ربط القضية بنفسها. اختر قضية أخرى (مثلاً قضية الاستئناف)')
  const db = getDb()
  const related = db.prepare(`SELECT id FROM cases WHERE id = ? AND ${notDeleted()}`).get(relatedId) as { id: string } | undefined
  if (!related) throw new Error('القضية المختارة غير موجودة')
  const exists = db
    .prepare(`SELECT id FROM case_links WHERE case_id = ? AND related_case_id = ? AND ${notDeleted()}`)
    .get(caseId, relatedId) as { id: string } | undefined
  if (exists) throw new Error('هذه القضية مربوطة بالفعل')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    'INSERT INTO case_links (id, case_id, related_case_id, link_type, created_at, updated_at) VALUES (?,?,?,?,?,?)'
  ).run(id, caseId, relatedId, linkType || 'appeal', ts, ts)
  recordLocalChange('case_links', id, 'INSERT')
  audit(actor, 'update', 'cases', caseId, `تم ربط القضية بقضية أخرى (${linkType})`)
}

export function archiveCase(actor: AuthedUser, id: string, archive = true) {
  const db = getDb()
  db.prepare('UPDATE cases SET is_archived = ?, updated_at = ? WHERE id = ?').run(archive ? 1 : 0, nowIso(), id)
  recordLocalChange('cases', id, 'UPDATE')
  audit(actor, archive ? 'archive' : 'restore', 'cases', id, archive ? 'تم أرشفة القضية' : 'تم استرجاع القضية من الأرشيف')
}

export function listCaseTypes() {
  return getDb().prepare(`SELECT * FROM case_types WHERE ${notDeleted()} ORDER BY sort_order, created_at`).all()
}

export function createCaseType(actor: AuthedUser, nameAr: string, nameEn?: string) {
  if (!nameAr.trim()) throw new Error('اسم النوع مطلوب')
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare('INSERT INTO case_types (id, name_ar, name_en, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 99, ?, ?)')
    .run(id, nameAr.trim(), nameEn ?? nameAr.trim(), ts, ts)
  recordLocalChange('case_types', id, 'INSERT')
  audit(actor, 'create', 'case_types', id, `تمت إضافة نوع قضية: ${nameAr}`)
  return { id }
}

export function updateCaseType(id: string, data: Record<string, unknown>) {
  getDb()
    .prepare('UPDATE case_types SET name_ar=?, name_en=?, is_active=?, updated_at=? WHERE id=?')
    .run(data.name_ar, data.name_en ?? data.name_ar, data.is_active ?? 1, nowIso(), id)
  recordLocalChange('case_types', id, 'UPDATE')
}

export function removeCaseType(id: string) {
  const used = getDb().prepare(`SELECT COUNT(*) as c FROM cases WHERE case_type_id = ? AND ${notDeleted()}`).get(id) as {
    c: number
  }
  if (used.c > 0) throw new Error('لا يمكن حذف نوع مرتبط بقضايا')
  softDelete('case_types', id)
}
