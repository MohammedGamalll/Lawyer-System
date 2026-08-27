import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { caseSchema, parseSchema } from '@shared/schemas'
import { rememberLookup } from './lookups'
import { maskClientContactFields } from './clients'

export function listCases(query: ListQuery = {}, archived = 0) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = [archived]
  let where = `WHERE c.is_archived = ? AND ${notDeleted('c')} AND ${notDeleted('cl')}`
  if (query.search) {
    where += ` AND (c.title LIKE ? OR c.case_number LIKE ? OR c.office_case_number LIKE ? OR c.case_year LIKE ? OR c.internal_file_number LIKE ? OR cl.full_name LIKE ? OR c.category LIKE ?)`
    const s = `%${query.search}%`
    params.push(s, s, s, s, s, s, s)
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

export function getCase(id: string, actor?: AuthedUser | null) {
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
  const hearingsTotal = (
    db.prepare(`SELECT COUNT(*) as c FROM hearings WHERE case_id = ? AND ${notDeleted()}`).get(id) as { c: number }
  ).c
  const hearings = db
    .prepare(
      `SELECT id, hearing_date, hearing_type, previous_decision, hall, floor, venue, notes, status, result
       FROM hearings WHERE case_id = ? AND ${notDeleted()} ORDER BY hearing_date DESC LIMIT 80`
    )
    .all(id)
  const rawCaseClients = db
    .prepare(
      `SELECT cc.*, cl.full_name, cl.phone, cl.national_id FROM case_clients cc
       JOIN clients cl ON cl.id = cc.client_id
       WHERE cc.case_id = ? AND ${notDeleted('cc')} AND ${notDeleted('cl')} ORDER BY cc.is_primary DESC, cc.sort_order`
    )
    .all(id)
  const caseClients = maskClientContactFields(rawCaseClients, actor)
  const tasks = db
    .prepare(
      `SELECT id, title, venue, case_subject, due_date, status FROM tasks WHERE case_id = ? AND ${notDeleted()} ORDER BY due_date IS NULL, due_date LIMIT 80`
    )
    .all(id)
  const payments = db
    .prepare(
      `SELECT id, payment_number, amount, payment_date, payment_method FROM payments WHERE case_id = ? AND ${notDeleted()} ORDER BY payment_date DESC, created_at DESC LIMIT 80`
    )
    .all(id)
  const documents = db
    .prepare(
      `SELECT id, title, category, file_name, current_version FROM documents WHERE case_id = ? AND ${notDeleted()} ORDER BY created_at DESC LIMIT 80`
    )
    .all(id)
  return { ...(row as object), links, opponents, fees, hearings, hearingsTotal, payments, documents, caseClients, tasks }
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
  const allocated = allocateCaseNumber(db, data)
  const number = allocated.number
  const id = newId()
  db.prepare(
    `INSERT INTO cases (
        id, case_number, office_case_number, case_year, internal_file_number, title, client_id, primary_lawyer_id, assistant_lawyer_id,
        case_type_id, category, court, circuit, governorate, court_address, circuit_number, litigation_degree,
        first_instance_number, first_instance_year, appeal_number, appeal_year, cassation_number, cassation_year,
        extra_ref_type, extra_ref_number, filing_date, received_date, status, case_value, opponent_name, opponent_lawyer, opponent_case_number,
        description, summary, notes, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    allocated.office,
    allocated.year,
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
    data.first_instance_number ?? null,
    data.first_instance_year ?? null,
    data.appeal_number ?? null,
    data.appeal_year ?? null,
    data.cassation_number ?? null,
    data.cassation_year ?? null,
    data.extra_ref_type ?? null,
    data.extra_ref_number ?? null,
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
  rememberCaseLookups(data)
  syncCaseParties(id, data, true)
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
  const allocated = allocateCaseNumber(db, data, id)
  const closedAt = data.status === 'closed' && old.status !== 'closed' ? nowIso() : null
  db.prepare(
    `UPDATE cases SET case_number=?, office_case_number=?, case_year=?, internal_file_number=?, title=?, client_id=?, primary_lawyer_id=?, assistant_lawyer_id=?,
      case_type_id=?, category=?, court=?, circuit=?, governorate=?, court_address=?, circuit_number=?,
      litigation_degree=?, first_instance_number=?, first_instance_year=?, appeal_number=?, appeal_year=?,
      cassation_number=?, cassation_year=?, extra_ref_type=?, extra_ref_number=?, filing_date=?, received_date=?,
      status=?, case_value=?, opponent_name=?,
      opponent_lawyer=?, opponent_case_number=?, description=?, summary=?, notes=?, closed_at=COALESCE(?, closed_at),
      updated_at=? WHERE id=?`
  ).run(
    allocated.number,
    allocated.office,
    allocated.year,
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
    data.first_instance_number ?? null,
    data.first_instance_year ?? null,
    data.appeal_number ?? null,
    data.appeal_year ?? null,
    data.cassation_number ?? null,
    data.cassation_year ?? null,
    data.extra_ref_type ?? null,
    data.extra_ref_number ?? null,
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
  rememberCaseLookups(data)
  syncCaseParties(id, data, false)
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
  const parties = db.prepare(`SELECT id FROM case_clients WHERE case_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const p of parties) softDelete('case_clients', p.id)
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

function rememberCaseLookups(data: Record<string, unknown>) {
  rememberLookup('case_title', data.title)
  rememberLookup('court', data.court)
  rememberLookup('case_subject', data.category)
  rememberLookup('extra_ref_type', data.extra_ref_type)
  rememberLookup('capacity', data.capacity_first)
  rememberLookup('capacity', data.capacity_appeal)
  rememberLookup('capacity', data.capacity_cassation)
}

function currentYear() {
  return String(new Date().getFullYear())
}

function allocateCaseNumber(
  db: ReturnType<typeof getDb>,
  data: Record<string, unknown>,
  excludeId?: string
): { number: string; year: string; office: string | null } {
  const year = String(data.case_year ?? '').trim() || currentYear()
  let office = String(data.office_case_number ?? '').trim()
  if (office.endsWith(`/${year}`)) office = office.slice(0, -(year.length + 1)).trim()
  let number: string
  if (office) {
    number = `${office}/${year}`
  } else if (excludeId) {
    const old = db.prepare(`SELECT case_number FROM cases WHERE id = ?`).get(excludeId) as { case_number: string }
    number = old.case_number
  } else {
    number = nextNumber(db, 'case')
  }
  const found = excludeId
    ? (db
        .prepare(`SELECT id FROM cases WHERE case_number = ? AND id != ? AND ${notDeleted()}`)
        .get(number, excludeId) as { id: string } | undefined)
    : (db.prepare(`SELECT id FROM cases WHERE case_number = ? AND ${notDeleted()}`).get(number) as
        | { id: string }
        | undefined)
  if (found) throw new Error('رقم القضية مستخدم بالفعل في هذه السنة')
  return { number, year, office: office || null }
}

function upsertCaseClient(
  caseId: string,
  clientId: string,
  isPrimary: number,
  sortOrder: number,
  caps: { capacity_first?: unknown; capacity_appeal?: unknown; capacity_cassation?: unknown }
) {
  const db = getDb()
  const ts = nowIso()
  const existing = db
    .prepare('SELECT id, deleted_at FROM case_clients WHERE case_id = ? AND client_id = ?')
    .get(caseId, clientId) as { id: string; deleted_at: string | null } | undefined
  if (existing) {
    db.prepare(
      `UPDATE case_clients SET is_primary=?, sort_order=?, capacity_first=?, capacity_appeal=?, capacity_cassation=?,
        deleted_at=NULL, updated_at=? WHERE id=?`
    ).run(
      isPrimary,
      sortOrder,
      caps.capacity_first ?? null,
      caps.capacity_appeal ?? null,
      caps.capacity_cassation ?? null,
      ts,
      existing.id
    )
    recordLocalChange('case_clients', existing.id, 'UPDATE')
    return
  }
  const id = newId()
  db.prepare(
    `INSERT INTO case_clients (id, case_id, client_id, is_primary, capacity_first, capacity_appeal, capacity_cassation, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    caseId,
    clientId,
    isPrimary,
    caps.capacity_first ?? null,
    caps.capacity_appeal ?? null,
    caps.capacity_cassation ?? null,
    sortOrder,
    ts,
    ts
  )
  recordLocalChange('case_clients', id, 'INSERT')
}

function syncCaseParties(caseId: string, data: Record<string, unknown>, isCreate: boolean) {
  const db = getDb()
  const primaryId = asId(data.client_id)
  if (!primaryId) return
  const seen = new Set<string>([primaryId])
  upsertCaseClient(caseId, primaryId, 1, 0, data)
  const extras = (data.extra_clients as { client_id?: string; capacity_first?: string; capacity_appeal?: string; capacity_cassation?: string }[]) || []
  extras.forEach((row, i) => {
    const cid = asId(row.client_id)
    if (!cid || seen.has(cid)) return
    seen.add(cid)
    upsertCaseClient(caseId, cid, 0, i + 1, row)
    rememberLookup('capacity', row.capacity_first)
    rememberLookup('capacity', row.capacity_appeal)
    rememberLookup('capacity', row.capacity_cassation)
  })
  if (!isCreate) {
    const old = db.prepare(`SELECT id, client_id FROM case_clients WHERE case_id = ? AND ${notDeleted()}`).all(caseId) as {
      id: string
      client_id: string
    }[]
    for (const row of old) {
      if (!seen.has(row.client_id)) softDelete('case_clients', row.id)
    }
  }

  const extraOpps =
    (data.extra_opponents as { opponent_id?: string; full_name?: string; lawyer_name?: string; lawyer_phone?: string }[]) || []
  if (isCreate) {
    const hasOpp =
      Boolean(String(data.opponent_name ?? '').trim()) ||
      extraOpps.some((o) => Boolean(asIdOrNull(o.opponent_id) || String(o.full_name ?? '').trim()))
    if (!hasOpp) throw new Error('يجب إضافة خصم واحد على الأقل')
  }
  for (const opp of extraOpps) {
    let oid = asIdOrNull(opp.opponent_id)
    if (!oid && opp.full_name) {
      oid = newId()
      const ts = nowIso()
      db.prepare(
        `INSERT INTO opponents (id, full_name, lawyer_name, lawyer_phone, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).run(oid, opp.full_name, opp.lawyer_name ?? null, opp.lawyer_phone ?? null, ts, ts)
      recordLocalChange('opponents', oid, 'INSERT')
    }
    if (oid) linkOpponentRowLocal(caseId, oid)
  }
  if (data.opponent_name && extraOpps.length === 0 && isCreate) {
    const oid = newId()
    const ts = nowIso()
    db.prepare(
      `INSERT INTO opponents (id, full_name, lawyer_name, created_at, updated_at) VALUES (?,?,?,?,?)`
    ).run(oid, data.opponent_name, data.opponent_lawyer ?? null, ts, ts)
    recordLocalChange('opponents', oid, 'INSERT')
    linkOpponentRowLocal(caseId, oid)
  }
}

function linkOpponentRowLocal(caseId: string, opponentId: string) {
  const db = getDb()
  const existing = db
    .prepare('SELECT id, deleted_at FROM case_opponents WHERE case_id = ? AND opponent_id = ?')
    .get(caseId, opponentId) as { id: string; deleted_at: string | null } | undefined
  const ts = nowIso()
  if (existing && !existing.deleted_at) return
  if (existing) {
    db.prepare('UPDATE case_opponents SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(ts, existing.id)
    recordLocalChange('case_opponents', existing.id, 'UPDATE')
    return
  }
  const id = newId()
  db.prepare(
    'INSERT INTO case_opponents (id, case_id, opponent_id, created_at, updated_at) VALUES (?,?,?,?,?)'
  ).run(id, caseId, opponentId, ts, ts)
  recordLocalChange('case_opponents', id, 'INSERT')
}

