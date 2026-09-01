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
import { clampPageSize, pageKind, pickSort, sqlDir } from '../db/queryLimits'
import { ftsQuery } from '../db/fts'

function splitCourtQuery(raw: string): { number: string; year: string } {
  const t = String(raw ?? '').trim()
  const m = t.match(/^(\d+)\s*(?:\/|لسنة)\s*(\d{2,4})\s*ق?\.?$/i)
  if (m) return { number: m[1], year: m[2] }
  return { number: t, year: '' }
}

function tokens(raw: string): string[] {
  return String(raw || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^(ضد|vs\.?|و)$/i.test(s))
}

function parsePartyFilters(clientRaw: string, opponentRaw: string): { client: string[]; opponent: string[] } {
  let client = String(clientRaw || '').trim()
  let opponent = String(opponentRaw || '').trim()
  const vs = client.match(/^(.+?)\s+(?:ضد|vs\.?)\s+(.+)$/i)
  if (vs) {
    client = vs[1].trim()
    if (!opponent) opponent = vs[2].trim()
  }
  return { client: tokens(client), opponent: tokens(opponent) }
}

function applyNameAnd(
  where: string,
  params: unknown[],
  parts: string[],
  kind: 'client' | 'opponent'
): string {
  for (const tok of parts) {
    const like = `%${tok}%`
    if (kind === 'client') {
      where += ` AND (
        cl.full_name LIKE ? OR EXISTS (
          SELECT 1 FROM case_clients x JOIN clients cx ON cx.id = x.client_id
          WHERE x.case_id = c.id AND ${notDeleted('x')} AND ${notDeleted('cx')} AND cx.full_name LIKE ?
        )
      )`
      params.push(like, like)
    } else {
      where += ` AND (
        IFNULL(c.opponent_name,'') LIKE ? OR EXISTS (
          SELECT 1 FROM case_opponents xo JOIN opponents ox ON ox.id = xo.opponent_id
          WHERE xo.case_id = c.id AND ${notDeleted('xo')} AND ${notDeleted('ox')} AND ox.full_name LIKE ?
        )
      )`
      params.push(like, like)
    }
  }
  return where
}

export function listCases(query: ListQuery = {}, archived = 0) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = [archived]
  let where = `WHERE c.is_archived = ? AND ${notDeleted('c')} AND ${notDeleted('cl')}`
  const fts = ftsQuery(String(query.search || ''))
  if (query.search && fts) {
    where += ` AND c.rowid IN (SELECT rowid FROM cases_fts WHERE cases_fts MATCH ?)`
    params.push(fts)
  } else if (query.search) {
    where += ` AND (c.title LIKE ? OR c.case_number LIKE ? OR c.office_case_number LIKE ? OR c.case_year LIKE ? OR c.internal_file_number LIKE ? OR cl.full_name LIKE ? OR c.category LIKE ? OR c.opponent_name LIKE ?)`
    const s = `%${query.search}%`
    params.push(s, s, s, s, s, s, s, s)
  }
  const f = query.filters ?? {}
  const courtQ = splitCourtQuery(String(f.office_case_number ?? query.search ?? ''))
  if (f.office_case_number) {
    if (courtQ.year) {
      where += ' AND c.office_case_number LIKE ? AND c.case_year LIKE ?'
      params.push(`%${courtQ.number}%`, `%${courtQ.year}%`)
    } else {
      where += ' AND (c.office_case_number LIKE ? OR c.case_number LIKE ?)'
      const s = `%${courtQ.number}%`
      params.push(s, s)
    }
  } else if (query.search && courtQ.year) {
    where += ' AND c.office_case_number LIKE ? AND c.case_year LIKE ?'
    params.push(`%${courtQ.number}%`, `%${courtQ.year}%`)
  }
  if (f.program_code) {
    const raw = String(f.program_code).trim()
    const digits = raw.replace(/\D/g, '')
    where += ' AND (c.case_number LIKE ? OR c.internal_file_number LIKE ?'
    params.push(`%${raw}%`, `%${raw}%`)
    if (digits) {
      where += ' OR CAST(REPLACE(c.case_number, \'CS-\', \'\') AS INTEGER) = ?'
      params.push(Number(digits))
    }
    where += ')'
  }
  const parties = parsePartyFilters(String(f.client_name ?? ''), String(f.opponent_name ?? ''))
  where = applyNameAnd(where, params, parties.client, 'client')
  where = applyNameAnd(where, params, parties.opponent, 'opponent')
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
  const order = pickSort(query.sortBy, {
    case_number: 'c.case_number',
    office_case_number: 'c.office_case_number',
    title: 'c.title',
    status: 'c.status',
    client_name: 'cl.full_name',
    opponent_name: 'c.opponent_name',
    lawyer_name: 'l.full_name',
    case_type_name: 'ct.name_ar'
  }, 'IFNULL(c.filing_date, IFNULL(c.received_date, c.created_at)) ASC, c.created_at ASC')
  const dir = query.sortBy ? ` ${sqlDir(query.sortDir)}` : ''
  const rows = db
    .prepare(
      `SELECT c.id, c.case_number, c.office_case_number, c.case_year, c.title, c.category, c.status, c.court, c.circuit,
              c.filing_date, c.received_date, c.client_id, c.opponent_name, c.primary_lawyer_id, c.case_type_id,
              cl.full_name as client_name, cl.client_number, ct.name_ar as case_type_name, l.full_name as lawyer_name,
              (SELECT GROUP_CONCAT(clx.full_name, '، ') FROM case_clients x JOIN clients clx ON clx.id = x.client_id
                WHERE x.case_id = c.id AND IFNULL(x.is_primary,0) = 0 AND ${notDeleted('x')} AND ${notDeleted('clx')}) as extra_client_names,
              (SELECT GROUP_CONCAT(ox.full_name, '، ') FROM case_opponents xo JOIN opponents ox ON ox.id = xo.opponent_id
                WHERE xo.case_id = c.id AND ${notDeleted('xo')} AND ${notDeleted('ox')}) as opponent_names
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN case_types ct ON ct.id = c.case_type_id AND ${notDeleted('ct')}
       LEFT JOIN lawyers l ON l.id = c.primary_lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY ${order}${dir} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  const mapped = (rows as Record<string, unknown>[]).map((r) => {
    const extras = String(r.extra_client_names || '')
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    return { ...r, extra_client_count: extras.length }
  })
  return { rows: mapped, total, page, pageSize }
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
      `SELECT o.*, co.capacity_first as capacity_first, co.capacity_appeal as capacity_appeal,
              co.capacity_cassation as capacity_cassation, co.sort_order as sort_order
       FROM opponents o JOIN case_opponents co ON co.opponent_id = o.id
       WHERE co.case_id = ? AND ${notDeleted('o')} AND ${notDeleted('co')}
       ORDER BY IFNULL(co.sort_order, 0), o.full_name`
    )
    .all(id)
  const hearingsTotal = (
    db.prepare(`SELECT COUNT(*) as c FROM hearings WHERE case_id = ? AND ${notDeleted()}`).get(id) as { c: number }
  ).c
  const hearings = db
    .prepare(
      `SELECT id, hearing_date, hearing_type, previous_decision, court_decision, hall, floor, venue, notes, status, result
       FROM hearings WHERE case_id = ? AND ${notDeleted()} ORDER BY hearing_date DESC LIMIT 80`
    )
    .all(id)
  const rawCaseClients = db
    .prepare(
      `SELECT cc.*, cl.client_number, cl.full_name, cl.nickname, cl.trade_name, cl.national_id, cl.phone, cl.phone2,
              cl.whatsapp, cl.email, cl.address, cl.governorate, cl.district, cl.client_type, cl.profession,
              cl.birth_date, cl.commercial_register, cl.tax_id, cl.manager_name, cl.notes as client_notes
       FROM case_clients cc
       JOIN clients cl ON cl.id = cc.client_id
       WHERE cc.case_id = ? AND ${notDeleted('cc')} AND ${notDeleted('cl')} ORDER BY cc.is_primary DESC, cc.sort_order`
    )
    .all(id)
  const caseClients = maskClientContactFields(rawCaseClients, actor)
  const primaryParty = (caseClients as { is_primary?: number; capacity_first?: string; capacity_appeal?: string; capacity_cassation?: string }[]).find(
    (p) => Number(p.is_primary) === 1
  )
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
  syncCaseFeePaid(db, id)
  const fees = db.prepare(`SELECT * FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(id)
  return {
    ...(row as object),
    capacity_first: primaryParty?.capacity_first ?? (row as { capacity_first?: string }).capacity_first,
    capacity_appeal: primaryParty?.capacity_appeal,
    capacity_cassation: primaryParty?.capacity_cassation,
    links,
    opponents,
    fees,
    hearings,
    hearingsTotal,
    payments,
    documents,
    caseClients,
    tasks
  }
}

function syncCaseFeePaid(db: ReturnType<typeof getDb>, caseId: string) {
  const paidRow = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE case_id = ? AND ${notDeleted()}`).get(caseId) as {
    s: number
  }
  const fees = db.prepare(`SELECT id, total_fees FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(caseId) as
    | { id: string; total_fees: number }
    | undefined
  if (!fees) return
  const paid = Number(paidRow?.s || 0)
  db.prepare('UPDATE case_fees SET paid=?, remaining=?, updated_at=? WHERE id=?').run(
    paid,
    Math.max(0, Number(fees.total_fees) - paid),
    nowIso(),
    fees.id
  )
  recordLocalChange('case_fees', fees.id, 'UPDATE')
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
      `UPDATE case_fees SET total_fees=?, due_date=?, payment_method=?, installment_count=?, updated_at=? WHERE id=?`
    ).run(total, dueDate ?? null, paymentMethod ?? null, installmentCount ?? 1, ts, existing.id)
    recordLocalChange('case_fees', existing.id, 'UPDATE')
  } else {
    const fid = newId()
    db.prepare(
      `INSERT INTO case_fees (id, case_id, total_fees, paid, remaining, due_date, payment_method, installment_count, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(fid, caseId, total, total, dueDate ?? null, paymentMethod ?? null, installmentCount ?? 1, ts, ts)
    recordLocalChange('case_fees', fid, 'INSERT')
  }
  syncCaseFeePaid(db, caseId)
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
        extra_ref_type, extra_ref_number, extra_ref2_type, extra_ref2_number, extra_ref3_type, extra_ref3_number,
        session_place, previous_circuit, opponent_capacity_first, opponent_capacity_appeal, opponent_capacity_cassation,
        filing_date, received_date, status, case_value, opponent_name, opponent_lawyer, opponent_case_number,
        description, summary, notes, created_at, updated_at, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
    data.extra_ref2_type ?? null,
    data.extra_ref2_number ?? null,
    data.extra_ref3_type ?? null,
    data.extra_ref3_number ?? null,
    data.session_place ?? null,
    data.previous_circuit ?? null,
    data.opponent_capacity_first ?? null,
    data.opponent_capacity_appeal ?? null,
    data.opponent_capacity_cassation ?? null,
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
      cassation_number=?, cassation_year=?, extra_ref_type=?, extra_ref_number=?, extra_ref2_type=?, extra_ref2_number=?,
      extra_ref3_type=?, extra_ref3_number=?, session_place=?, previous_circuit=?,
      opponent_capacity_first=?, opponent_capacity_appeal=?, opponent_capacity_cassation=?,
      filing_date=?, received_date=?,
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
    data.extra_ref2_type ?? null,
    data.extra_ref2_number ?? null,
    data.extra_ref3_type ?? null,
    data.extra_ref3_number ?? null,
    data.session_place ?? null,
    data.previous_circuit ?? null,
    data.opponent_capacity_first ?? null,
    data.opponent_capacity_appeal ?? null,
    data.opponent_capacity_cassation ?? null,
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
  rememberLookup('extra_ref_type', data.extra_ref2_type)
  rememberLookup('extra_ref_type', data.extra_ref3_type)
  rememberLookup('capacity', data.capacity_first)
  rememberLookup('capacity', data.capacity_appeal)
  rememberLookup('capacity', data.capacity_cassation)
  rememberLookup('capacity', data.opponent_capacity_first)
  rememberLookup('capacity', data.opponent_capacity_appeal)
  rememberLookup('capacity', data.opponent_capacity_cassation)
}

function allocateCaseNumber(
  db: ReturnType<typeof getDb>,
  data: Record<string, unknown>,
  excludeId?: string
): { number: string; year: string | null; office: string | null } {
  const year = String(data.case_year ?? '').trim()
  let office = String(data.office_case_number ?? '').trim()
  if (year && office.endsWith(`/${year}`)) office = office.slice(0, -(year.length + 1)).trim()
  let number: string
  if (excludeId) {
    const old = db.prepare(`SELECT case_number FROM cases WHERE id = ?`).get(excludeId) as { case_number: string }
    number = old.case_number
  } else {
    number = nextNumber(db, 'case')
  }
  if (office) {
    const found = excludeId
      ? (db
          .prepare(
            `SELECT id FROM cases WHERE office_case_number = ? AND IFNULL(case_year,'') = ? AND id != ? AND ${notDeleted()}`
          )
          .get(office, year, excludeId) as { id: string } | undefined)
      : (db
          .prepare(`SELECT id FROM cases WHERE office_case_number = ? AND IFNULL(case_year,'') = ? AND ${notDeleted()}`)
          .get(office, year) as { id: string } | undefined)
    if (found) throw new Error('رقم القضية مستخدم بالفعل في هذه السنة')
  }
  return { number, year: year || null, office: office || null }
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
    (data.extra_opponents as {
      opponent_id?: string
      full_name?: string
      lawyer_name?: string
      lawyer_phone?: string
      capacity_first?: string
      capacity_appeal?: string
      capacity_cassation?: string
    }[]) || []
  const seenOpp = new Set<string>()
  const primaryOppId = asIdOrNull(data.opponent_id)
  const primaryName = String(data.opponent_name ?? '').trim()
  const hasOpp =
    Boolean(primaryOppId) ||
    Boolean(primaryName) ||
    extraOpps.some((o) => Boolean(asIdOrNull(o.opponent_id) || String(o.full_name ?? '').trim()))
  if (isCreate && !hasOpp) throw new Error('يجب إضافة خصم واحد على الأقل')

  if (primaryOppId) {
    seenOpp.add(primaryOppId)
    linkOpponentRowLocal(caseId, primaryOppId, 0, {
      capacity_first: data.opponent_capacity_first,
      capacity_appeal: data.opponent_capacity_appeal,
      capacity_cassation: data.opponent_capacity_cassation
    })
  } else if (primaryName) {
    const oid = findOrCreateOpponent(primaryName, data.opponent_lawyer, undefined)
    seenOpp.add(oid)
    linkOpponentRowLocal(caseId, oid, 0, {
      capacity_first: data.opponent_capacity_first,
      capacity_appeal: data.opponent_capacity_appeal,
      capacity_cassation: data.opponent_capacity_cassation
    })
  }
  extraOpps.forEach((opp, i) => {
    let oid = asIdOrNull(opp.opponent_id)
    const name = String(opp.full_name ?? '').trim()
    if (!oid && name) oid = findOrCreateOpponent(name, opp.lawyer_name, opp.lawyer_phone)
    if (!oid) return
    seenOpp.add(oid)
    linkOpponentRowLocal(caseId, oid, i + 1, opp)
    rememberLookup('capacity', opp.capacity_first)
    rememberLookup('capacity', opp.capacity_appeal)
    rememberLookup('capacity', opp.capacity_cassation)
  })
  if (!isCreate) {
    const oldOpps = db.prepare(`SELECT id, opponent_id FROM case_opponents WHERE case_id = ? AND ${notDeleted()}`).all(caseId) as {
      id: string
      opponent_id: string
    }[]
    for (const row of oldOpps) {
      if (!seenOpp.has(row.opponent_id)) softDelete('case_opponents', row.id)
    }
  }
}

function findOrCreateOpponent(fullName: string, lawyerName?: unknown, lawyerPhone?: unknown) {
  const db = getDb()
  const existing = db
    .prepare(`SELECT id FROM opponents WHERE full_name = ? AND ${notDeleted()} LIMIT 1`)
    .get(fullName) as { id: string } | undefined
  if (existing) return existing.id
  const oid = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO opponents (id, full_name, lawyer_name, lawyer_phone, created_at, updated_at) VALUES (?,?,?,?,?,?)`
  ).run(oid, fullName, lawyerName ?? null, lawyerPhone ?? null, ts, ts)
  recordLocalChange('opponents', oid, 'INSERT')
  return oid
}

function linkOpponentRowLocal(
  caseId: string,
  opponentId: string,
  sortOrder = 0,
  caps: { capacity_first?: unknown; capacity_appeal?: unknown; capacity_cassation?: unknown } = {}
) {
  const db = getDb()
  const existing = db
    .prepare('SELECT id, deleted_at FROM case_opponents WHERE case_id = ? AND opponent_id = ?')
    .get(caseId, opponentId) as { id: string; deleted_at: string | null } | undefined
  const ts = nowIso()
  if (existing) {
    db.prepare(
      `UPDATE case_opponents SET deleted_at = NULL, sort_order=?, capacity_first=?, capacity_appeal=?, capacity_cassation=?, updated_at = ? WHERE id = ?`
    ).run(sortOrder, caps.capacity_first ?? null, caps.capacity_appeal ?? null, caps.capacity_cassation ?? null, ts, existing.id)
    recordLocalChange('case_opponents', existing.id, 'UPDATE')
    return
  }
  const id = newId()
  db.prepare(
    `INSERT INTO case_opponents (id, case_id, opponent_id, capacity_first, capacity_appeal, capacity_cassation, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    caseId,
    opponentId,
    caps.capacity_first ?? null,
    caps.capacity_appeal ?? null,
    caps.capacity_cassation ?? null,
    sortOrder,
    ts,
    ts
  )
  recordLocalChange('case_opponents', id, 'INSERT')
}

