import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { createReminder, reminderBeforeExpiry } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'

function listJoined(
  sqlFrom: string,
  searchSql: string,
  query: ListQuery
) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (query.search) {
    where += ` AND (${searchSql})`
    const s = `%${query.search}%`
    const n = (searchSql.match(/\?/g) || []).length
    for (let i = 0; i < n; i++) params.push(s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM ${sqlFrom} ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(`SELECT * FROM ${sqlFrom} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function listPoa(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (q.search) {
    where += ' AND (p.poa_number LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM power_of_attorney p LEFT JOIN clients cl ON cl.id = p.client_id ${where}`).get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM power_of_attorney p
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN lawyers l ON l.id = p.lawyer_id
       ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createPoa(actor: AuthedUser, data: Record<string, unknown>) {
  const db = getDb()
  const number = (data.poa_number as string) || nextNumber(db, 'poa')
  const info = db
    .prepare(
      `INSERT INTO power_of_attorney (poa_number, poa_type, client_id, lawyer_id, issuing_authority, issue_date, expiry_date, status, document_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      data.poa_type ?? null,
      data.client_id || null,
      data.lawyer_id || null,
      data.issuing_authority ?? null,
      data.issue_date ?? null,
      data.expiry_date ?? null,
      data.status ?? 'active',
      data.document_id || null,
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  if (data.expiry_date) {
    createReminder({
      reminder_type: 'poa_expiry',
      title: `انتهاء التوكيل ${number}`,
      remind_at: reminderBeforeExpiry(String(data.expiry_date), 14),
      client_id: (data.client_id as number) || null,
      related_type: 'poa',
      related_id: id,
      notify_before_minutes: 0
    })
  }
  audit(actor, 'create', 'poa', id, `تم إنشاء التوكيل ${number}`)
  return { id, poa_number: number }
}

export function updatePoa(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE power_of_attorney SET poa_type=?, client_id=?, lawyer_id=?, issuing_authority=?, issue_date=?, expiry_date=?, status=?, notes=? WHERE id=?`
    )
    .run(
      data.poa_type ?? null,
      data.client_id || null,
      data.lawyer_id || null,
      data.issuing_authority ?? null,
      data.issue_date ?? null,
      data.expiry_date ?? null,
      data.status ?? 'active',
      data.notes ?? null,
      id
    )
  audit(actor, 'update', 'poa', id, `تم تعديل التوكيل`)
  return { id }
}

export function removePoa(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM power_of_attorney WHERE id = ?').run(id)
  audit(actor, 'delete', 'poa', id, `تم حذف توكيل رقم ${id}`)
}

export function listContracts(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (q.search) {
    where += ' AND (c.title LIKE ? OR c.contract_number LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM contracts c LEFT JOIN clients cl ON cl.id = c.client_id ${where}`).get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM contracts c
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN lawyers l ON l.id = c.lawyer_id
       ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createContract(actor: AuthedUser, data: Record<string, unknown>) {
  if (!data.title) throw new Error('اسم العقد مطلوب')
  const db = getDb()
  const number = (data.contract_number as string) || nextNumber(db, 'contract')
  const info = db
    .prepare(
      `INSERT INTO contracts (contract_number, title, client_id, contract_type, start_date, end_date, value, status, lawyer_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      data.title,
      data.client_id || null,
      data.contract_type ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.value ?? null,
      data.status ?? 'active',
      data.lawyer_id || null,
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  if (data.end_date) {
    createReminder({
      reminder_type: 'contract_renewal',
      title: `انتهاء العقد ${data.title}`,
      remind_at: reminderBeforeExpiry(String(data.end_date), 14),
      client_id: (data.client_id as number) || null,
      related_type: 'contract',
      related_id: id,
      notify_before_minutes: 0
    })
  }
  audit(actor, 'create', 'contracts', id, `تم إنشاء العقد ${number}`)
  return { id, contract_number: number }
}

export function updateContract(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE contracts SET title=?, client_id=?, contract_type=?, start_date=?, end_date=?, value=?, status=?, lawyer_id=?, notes=? WHERE id=?`
    )
    .run(
      data.title,
      data.client_id || null,
      data.contract_type ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.value ?? null,
      data.status ?? 'active',
      data.lawyer_id || null,
      data.notes ?? null,
      id
    )
  return { id }
}

export function removeContract(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM contracts WHERE id = ?').run(id)
  audit(actor, 'delete', 'contracts', id, `تم حذف عقد رقم ${id}`)
}

export function listConsultations(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (q.search) {
    where += ' AND (c.subject LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM consultations c LEFT JOIN clients cl ON cl.id = c.client_id ${where}`).get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT c.*, cl.full_name as client_name, l.full_name as lawyer_name
       FROM consultations c
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN lawyers l ON l.id = c.lawyer_id
       ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createConsultation(actor: AuthedUser, data: Record<string, unknown>) {
  const info = getDb()
    .prepare(
      `INSERT INTO consultations (client_id, lawyer_id, consultation_date, consultation_type, subject, details, recommendations, fees, payment_status, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.client_id || null,
      data.lawyer_id || null,
      data.consultation_date ?? null,
      data.consultation_type ?? null,
      data.subject ?? null,
      data.details ?? null,
      data.recommendations ?? null,
      data.fees ?? null,
      data.payment_status ?? 'unpaid',
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  audit(actor, 'create', 'consultations', id, `تم تسجيل استشارة`)
  return { id }
}

export function updateConsultation(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE consultations SET client_id=?, lawyer_id=?, consultation_date=?, consultation_type=?, subject=?, details=?, recommendations=?, fees=?, payment_status=?, notes=? WHERE id=?`
    )
    .run(
      data.client_id || null,
      data.lawyer_id || null,
      data.consultation_date ?? null,
      data.consultation_type ?? null,
      data.subject ?? null,
      data.details ?? null,
      data.recommendations ?? null,
      data.fees ?? null,
      data.payment_status ?? 'unpaid',
      data.notes ?? null,
      id
    )
  return { id }
}

export function removeConsultation(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM consultations WHERE id = ?').run(id)
}

export function listCorrespondence(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
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
       LEFT JOIN users u ON u.id = c.responsible_user_id
       ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createCorrespondence(actor: AuthedUser, data: Record<string, unknown>) {
  const db = getDb()
  const number = nextNumber(db, 'correspondence')
  const info = db
    .prepare(
      `INSERT INTO correspondence (correspondence_number, direction, correspondence_type, date, party, subject, responsible_user_id, case_id, client_id, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      data.direction ?? 'outgoing',
      data.correspondence_type ?? 'letter',
      data.date ?? nowIso().slice(0, 10),
      data.party ?? null,
      data.subject ?? null,
      data.responsible_user_id || actor.id,
      data.case_id || null,
      data.client_id || null,
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  audit(actor, 'create', 'correspondence', id, `تم تسجيل مراسلة ${number}`)
  return { id, correspondence_number: number }
}

export function updateCorrespondence(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(
      `UPDATE correspondence SET direction=?, correspondence_type=?, date=?, party=?, subject=?, responsible_user_id=?, case_id=?, client_id=?, notes=? WHERE id=?`
    )
    .run(
      data.direction,
      data.correspondence_type,
      data.date,
      data.party ?? null,
      data.subject ?? null,
      data.responsible_user_id || null,
      data.case_id || null,
      data.client_id || null,
      data.notes ?? null,
      id
    )
  return { id }
}

export function removeCorrespondence(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM correspondence WHERE id = ?').run(id)
}

void listJoined
