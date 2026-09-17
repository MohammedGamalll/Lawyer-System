import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import { createReminder, reminderBeforeExpiry } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { clampPageSize, pageKind } from '../db/queryLimits'
import { rememberLookup } from './lookups'
import { arabicLike, foldedLikeTerm } from '@shared/arabic'

export function listPoa(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = clampPageSize(q.pageSize, pageKind(q))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('p')}`
  if (q.search) {
    where += ` AND (p.poa_number LIKE ? OR ${arabicLike('cl.full_name')} OR ${arabicLike('p.poa_office')})`
    const s = foldedLikeTerm(q.search)
    params.push(s, s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM power_of_attorney p LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')} ${where}`).get(
      ...params
    ) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, l.full_name as lawyer_name,
              COALESCE(
                NULLIF(p.document_id, ''),
                (
                  SELECT d.id FROM documents d
                  WHERE d.client_id = p.client_id AND ${notDeleted('d')}
                    AND lower(IFNULL(d.category,'')) IN ('poa','توكيل')
                  ORDER BY d.created_at DESC LIMIT 1
                )
              ) as document_id
       FROM power_of_attorney p
       LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = p.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createPoa(actor: AuthedUser, data: Record<string, unknown>) {
  const db = getDb()
  const number = (data.poa_number as string) || nextNumber(db, 'poa')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO power_of_attorney (id, poa_number, poa_type, client_id, lawyer_id, issuing_authority, poa_year, poa_letter, poa_office, issue_date, expiry_date, status, document_id, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    data.poa_type ?? null,
    asIdOrNull(data.client_id),
    asIdOrNull(data.lawyer_id),
    data.issuing_authority ?? data.poa_office ?? null,
    data.poa_year ?? null,
    data.poa_letter ?? null,
    data.poa_office ?? null,
    data.issue_date ?? null,
    data.expiry_date ?? null,
    data.status ?? 'active',
    asIdOrNull(data.document_id),
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('power_of_attorney', id, 'INSERT')
  rememberLookup('poa_office', data.poa_office)
  rememberLookup('poa_status', data.status)
  if (data.expiry_date) {
    createReminder({
      reminder_type: 'poa_expiry',
      title: `انتهاء التوكيل ${number}`,
      remind_at: reminderBeforeExpiry(String(data.expiry_date), 14),
      client_id: asIdOrNull(data.client_id),
      related_type: 'poa',
      related_id: id,
      notify_before_minutes: 0
    })
  }
  audit(actor, 'create', 'poa', id, `تم إنشاء التوكيل ${number}`)
  return { id, poa_number: number }
}

export function updatePoa(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE power_of_attorney SET poa_type=?, client_id=?, lawyer_id=?, issuing_authority=?, poa_year=?, poa_letter=?, poa_office=?, issue_date=?, expiry_date=?, status=?, document_id=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      data.poa_type ?? null,
      asIdOrNull(data.client_id),
      asIdOrNull(data.lawyer_id),
      data.issuing_authority ?? data.poa_office ?? null,
      data.poa_year ?? null,
      data.poa_letter ?? null,
      data.poa_office ?? null,
      data.issue_date ?? null,
      data.expiry_date ?? null,
      data.status ?? 'active',
      asIdOrNull(data.document_id),
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('power_of_attorney', id, 'UPDATE')
  rememberLookup('poa_office', data.poa_office)
  rememberLookup('poa_status', data.status)
  audit(actor, 'update', 'poa', id, `تم تعديل التوكيل`)
  return { id }
}

export function removePoa(actor: AuthedUser, id: string) {
  softDelete('power_of_attorney', id)
  audit(actor, 'delete', 'poa', id, `تم حذف توكيل رقم ${id}`)
}

export function upsertClientPoa(actor: AuthedUser, clientId: string, data: Record<string, unknown>) {
  const number = String(data.poa_number ?? '').trim()
  if (!number) return null
  const db = getDb()
  const existing = db
    .prepare(`SELECT id FROM power_of_attorney WHERE poa_number = ? AND ${notDeleted()}`)
    .get(number) as { id: string } | undefined
  const payload = {
    ...data,
    poa_number: number,
    client_id: clientId,
    issuing_authority: data.poa_office || data.issuing_authority
  }
  if (existing) {
    updatePoa(actor, existing.id, payload)
    return { id: existing.id, poa_number: number }
  }
  return createPoa(actor, payload)
}

export function listContracts(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = clampPageSize(q.pageSize, pageKind(q))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('c')}`
  if (q.search) {
    where += ' AND (c.title LIKE ? OR c.contract_number LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM contracts c LEFT JOIN clients cl ON cl.id = c.client_id AND ${notDeleted('cl')} ${where}`).get(
      ...params
    ) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM contracts c
       LEFT JOIN clients cl ON cl.id = c.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = c.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createContract(actor: AuthedUser, data: Record<string, unknown>) {
  if (!data.title) throw new Error('اسم العقد مطلوب')
  const db = getDb()
  const number = (data.contract_number as string) || nextNumber(db, 'contract')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO contracts (id, contract_number, title, client_id, contract_type, start_date, end_date, value, status, lawyer_id, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    data.title,
    asIdOrNull(data.client_id),
    data.contract_type ?? null,
    data.start_date ?? null,
    data.end_date ?? null,
    data.value ?? null,
    data.status ?? 'active',
    asIdOrNull(data.lawyer_id),
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('contracts', id, 'INSERT')
  rememberLookup('contract_status', data.status)
  if (data.end_date) {
    createReminder({
      reminder_type: 'contract_renewal',
      title: `انتهاء العقد ${data.title}`,
      remind_at: reminderBeforeExpiry(String(data.end_date), 14),
      client_id: asIdOrNull(data.client_id),
      related_type: 'contract',
      related_id: id,
      notify_before_minutes: 0
    })
  }
  audit(actor, 'create', 'contracts', id, `تم إنشاء العقد ${number}`)
  return { id, contract_number: number }
}

export function updateContract(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE contracts SET title=?, client_id=?, contract_type=?, start_date=?, end_date=?, value=?, status=?, lawyer_id=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      data.title,
      asIdOrNull(data.client_id),
      data.contract_type ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.value ?? null,
      data.status ?? 'active',
      asIdOrNull(data.lawyer_id),
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('contracts', id, 'UPDATE')
  rememberLookup('contract_status', data.status)
  audit(actor, 'update', 'contracts', id, 'تم تعديل العقد')
  return { id }
}

export function removeContract(actor: AuthedUser, id: string) {
  softDelete('contracts', id)
  audit(actor, 'delete', 'contracts', id, `تم حذف عقد رقم ${id}`)
}

export function listConsultations(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = clampPageSize(q.pageSize, pageKind(q))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('c')}`
  if (q.search) {
    where += ' AND (c.subject LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM consultations c LEFT JOIN clients cl ON cl.id = c.client_id AND ${notDeleted('cl')} ${where}`).get(
      ...params
    ) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM consultations c
       LEFT JOIN clients cl ON cl.id = c.client_id AND ${notDeleted('cl')}
       LEFT JOIN lawyers l ON l.id = c.lawyer_id AND ${notDeleted('l')}
       ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createConsultation(actor: AuthedUser, data: Record<string, unknown>) {
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO consultations (id, client_id, lawyer_id, consultation_date, consultation_type, subject, details, recommendations, fees, payment_status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id,
      asIdOrNull(data.client_id),
      asIdOrNull(data.lawyer_id),
      data.consultation_date ?? null,
      data.consultation_type ?? null,
      data.subject ?? null,
      data.details ?? null,
      data.recommendations ?? null,
      data.fees ?? null,
      data.payment_status ?? 'unpaid',
      data.notes ?? null,
      ts,
      ts
    )
  recordLocalChange('consultations', id, 'INSERT')
  audit(actor, 'create', 'consultations', id, `تم تسجيل استشارة`)
  return { id }
}

export function updateConsultation(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE consultations SET client_id=?, lawyer_id=?, consultation_date=?, consultation_type=?, subject=?, details=?, recommendations=?, fees=?, payment_status=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      asIdOrNull(data.client_id),
      asIdOrNull(data.lawyer_id),
      data.consultation_date ?? null,
      data.consultation_type ?? null,
      data.subject ?? null,
      data.details ?? null,
      data.recommendations ?? null,
      data.fees ?? null,
      data.payment_status ?? 'unpaid',
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('consultations', id, 'UPDATE')
  return { id }
}

export function removeConsultation(actor: AuthedUser, id: string) {
  softDelete('consultations', id)
}

export function listCorrespondence(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = clampPageSize(q.pageSize, pageKind(q))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('c')}`
  if (q.search) {
    where += ' AND (c.subject LIKE ? OR c.party LIKE ? OR c.correspondence_number LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  if (q.filters?.direction) {
    where += ' AND c.direction = ?'
    params.push(q.filters.direction)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM correspondence c ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT c.*, u.full_name as responsible_name FROM correspondence c
       LEFT JOIN users u ON u.id = c.responsible_user_id AND ${notDeleted('u')}
       ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createCorrespondence(actor: AuthedUser, data: Record<string, unknown>) {
  const db = getDb()
  const number = nextNumber(db, 'correspondence')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO correspondence (id, correspondence_number, direction, correspondence_type, date, party, subject, responsible_user_id, case_id, client_id, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    data.direction ?? 'outgoing',
    data.correspondence_type ?? 'letter',
    data.date ?? nowIso().slice(0, 10),
    data.party ?? null,
    data.subject ?? null,
    asIdOrNull(data.responsible_user_id) || actor.id,
    asIdOrNull(data.case_id),
    asIdOrNull(data.client_id),
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('correspondence', id, 'INSERT')
  audit(actor, 'create', 'correspondence', id, `تم تسجيل مراسلة ${number}`)
  return { id, correspondence_number: number }
}

export function updateCorrespondence(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE correspondence SET direction=?, correspondence_type=?, date=?, party=?, subject=?, responsible_user_id=?, case_id=?, client_id=?, notes=?, updated_at=? WHERE id=?`
    )
    .run(
      data.direction,
      data.correspondence_type,
      data.date,
      data.party ?? null,
      data.subject ?? null,
      asIdOrNull(data.responsible_user_id),
      asIdOrNull(data.case_id),
      asIdOrNull(data.client_id),
      data.notes ?? null,
      nowIso(),
      id
    )
  recordLocalChange('correspondence', id, 'UPDATE')
  return { id }
}

export function removeCorrespondence(actor: AuthedUser, id: string) {
  softDelete('correspondence', id)
}
