import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { paymentSchema, expenseSchema, invoiceSchema, parseSchema } from '@shared/schemas'

function defaultCashboxId(): string {
  const row = getDb()
    .prepare(`SELECT id FROM cashboxes WHERE ${notDeleted()} AND is_active = 1 ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined
  if (!row) throw new Error('لا توجد خزينة')
  return row.id
}

function resolveCashboxId(id?: unknown): string {
  return asIdOrNull(id) || defaultCashboxId()
}

function touchCashbox(
  cashboxId: string,
  type: string,
  amount: number,
  relatedType: string,
  relatedId: string,
  desc: string,
  actorId: string
) {
  const db = getDb()
  const box = db.prepare(`SELECT id, name, current_balance FROM cashboxes WHERE id = ? AND ${notDeleted()}`).get(cashboxId) as
    | { id: string; name: string; current_balance: number }
    | undefined
  if (!box) throw new Error('الخزينة / طريقة الدفع غير موجودة')
  const sign = type === 'expense' || type === 'withdrawal' ? -1 : 1
  if (sign < 0 && Number(box.current_balance) < amount) {
    throw new Error(
      `لا يمكن إتمام العملية من «${box.name}»: الرصيد المتاح ${Number(box.current_balance).toLocaleString('ar-EG')} والمطلوب ${Number(amount).toLocaleString('ar-EG')}. لا يُسمح بأن يصبح الرصيد سالباً.`
    )
  }
  const ts = nowIso()
  db.prepare('UPDATE cashboxes SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?').run(
    sign * amount,
    ts,
    cashboxId
  )
  recordLocalChange('cashboxes', cashboxId, 'UPDATE')
  const tid = newId()
  db.prepare(
    `INSERT INTO cashbox_transactions (id, cashbox_id, transaction_type, amount, related_type, related_id, description, transaction_date, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(tid, cashboxId, type, amount, relatedType, relatedId, desc, ts.slice(0, 10), actorId, ts, ts)
  recordLocalChange('cashbox_transactions', tid, 'INSERT')
}

export function listPayments(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('p')}`
  if (q.search) {
    where += ' AND (p.payment_number LIKE ? OR cl.full_name LIKE ? OR cs.case_number LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  if (q.filters?.case_id) {
    where += ' AND p.case_id = ?'
    params.push(q.filters.case_id)
  }
  if (q.filters?.client_id) {
    where += ' AND p.client_id = ?'
    params.push(q.filters.client_id)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM payments p LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')} LEFT JOIN cases cs ON cs.id = p.case_id AND ${notDeleted('cs')} ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, cs.case_number, cb.name as cashbox_name
       FROM payments p
       LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
       LEFT JOIN cases cs ON cs.id = p.case_id AND ${notDeleted('cs')}
       LEFT JOIN cashboxes cb ON cb.id = p.cashbox_id AND ${notDeleted('cb')}
       ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createPayment(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(paymentSchema, data) as Record<string, unknown>
  if (!data.client_id && !data.case_id) throw new Error('لا يمكن تسجيل دفعة بدون عميل أو قضية')
  const amount = Number(data.amount)
  if (!amount || amount <= 0) throw new Error('المبلغ غير صالح')
  const db = getDb()
  let clientId = asIdOrNull(data.client_id)
  const caseId = asIdOrNull(data.case_id)
  if (!clientId && caseId) {
    const cs = db.prepare(`SELECT client_id FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId) as
      | { client_id: string }
      | undefined
    clientId = cs?.client_id ?? null
  }
  const cashboxId = resolveCashboxId(data.cashbox_id)
  const number = nextNumber(db, 'payment')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO payments (id, payment_number, client_id, case_id, amount, payment_type, payment_method, cashbox_id, payment_date, due_date, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    clientId,
    caseId,
    amount,
    data.payment_type ?? 'fees',
    data.payment_method ?? 'cash',
    cashboxId,
    data.payment_date ?? ts.slice(0, 10),
    data.due_date ?? null,
    data.notes ?? null,
    actor.id,
    ts,
    ts
  )
  recordLocalChange('payments', id, 'INSERT')
  const receiptNo = nextNumber(db, 'receipt')
  const rid = newId()
  db.prepare(
    `INSERT INTO receipts (id, receipt_number, payment_id, client_id, amount, receipt_date, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(rid, receiptNo, id, clientId, amount, data.payment_date ?? ts.slice(0, 10), data.notes ?? null, ts, ts)
  recordLocalChange('receipts', rid, 'INSERT')
  touchCashbox(cashboxId, 'income', amount, 'payment', id, `دفعة ${number}`, actor.id)
  if (caseId) {
    const fees = db.prepare(`SELECT * FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(caseId) as
      | { id: string; total_fees: number }
      | undefined
    if (fees) {
      const paidRow = db
        .prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE case_id = ? AND ${notDeleted()}`)
        .get(caseId) as { s: number }
      const paid = Number(paidRow.s)
      db.prepare('UPDATE case_fees SET paid = ?, remaining = ?, updated_at = ? WHERE id = ?').run(
        paid,
        Math.max(0, fees.total_fees - paid),
        nowIso(),
        fees.id
      )
      recordLocalChange('case_fees', fees.id, 'UPDATE')
    }
  }
  audit(actor, 'create', 'payments', id, `تم تسجيل دفعة ${number} بمبلغ ${amount}`)
  if (clientId) {
    const params: unknown[] = [clientId]
    let invSql = `SELECT id, total, paid FROM invoices WHERE status != 'paid' AND client_id = ? AND ${notDeleted()}`
    if (caseId) {
      invSql += ' AND (case_id = ? OR case_id IS NULL)'
      params.push(caseId)
    }
    invSql += ' ORDER BY created_at'
    const openInvs = db.prepare(invSql).all(...params) as { id: string; total: number; paid: number }[]
    let left = amount
    for (const inv of openInvs) {
      if (left <= 0) break
      const need = Math.max(0, Number(inv.total) - Number(inv.paid || 0))
      if (need <= 0) continue
      const add = Math.min(need, left)
      const paid = Number(inv.paid || 0) + add
      const status = paid >= Number(inv.total) - 0.001 ? 'paid' : 'partial'
      db.prepare('UPDATE invoices SET paid = ?, status = ?, updated_at = ? WHERE id = ?').run(paid, status, nowIso(), inv.id)
      recordLocalChange('invoices', inv.id, 'UPDATE')
      left -= add
    }
  }
  return { id, payment_number: number, receipt_number: receiptNo }
}

export function removePayment(actor: AuthedUser, id: string) {
  const db = getDb()
  const p = db.prepare(`SELECT * FROM payments WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { amount: number; cashbox_id: string; case_id: string | null; payment_number: string }
    | undefined
  if (!p) throw new Error('الدفعة غير موجودة')
  if (p.cashbox_id) touchCashbox(p.cashbox_id, 'withdrawal', p.amount, 'payment', id, `عكس دفعة ${p.payment_number}`, actor.id)
  if (p.case_id) {
    const fees = db.prepare(`SELECT * FROM case_fees WHERE case_id = ? AND ${notDeleted()}`).get(p.case_id) as
      | { id: string; paid: number; total_fees: number }
      | undefined
    if (fees) {
      const paidRow = db
        .prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE case_id = ? AND ${notDeleted()}`)
        .get(p.case_id) as { s: number }
      const paid = Number(paidRow.s)
      db.prepare('UPDATE case_fees SET paid=?, remaining=?, updated_at=? WHERE id=?').run(
        paid,
        Math.max(0, fees.total_fees - paid),
        nowIso(),
        fees.id
      )
      recordLocalChange('case_fees', fees.id, 'UPDATE')
    }
  }
  const receipts = db.prepare(`SELECT id FROM receipts WHERE payment_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const r of receipts) softDelete('receipts', r.id)
  softDelete('payments', id)
  audit(actor, 'delete', 'payments', id, `تم حذف الدفعة ${p.payment_number}`)
}

export function paymentBalance(clientId?: string, caseId?: string) {
  const db = getDb()
  let cid = asIdOrNull(clientId)
  const csId = asIdOrNull(caseId)
  if (!cid && csId) {
    const cs = db.prepare(`SELECT client_id FROM cases WHERE id = ? AND ${notDeleted()}`).get(csId) as
      | { client_id: string }
      | undefined
    cid = cs?.client_id ?? null
  }
  if (!cid) {
    return { client_id: null, total: 0, paid: 0, remaining: 0, invoiceDue: 0, cases: [] as object[] }
  }
  const feeParams: unknown[] = [cid]
  let feeWhere = `c.client_id = ? AND ${notDeleted('cf')} AND ${notDeleted('c')}`
  if (csId) {
    feeWhere += ' AND cf.case_id = ?'
    feeParams.push(csId)
  }
  const fees = db
    .prepare(
      `SELECT COALESCE(SUM(cf.total_fees),0) as total, COALESCE(SUM(cf.paid),0) as paid, COALESCE(SUM(cf.remaining),0) as remaining
       FROM case_fees cf JOIN cases c ON c.id = cf.case_id WHERE ${feeWhere}`
    )
    .get(...feeParams) as { total: number; paid: number; remaining: number }
  const caseParams: unknown[] = [cid]
  let caseSql = `SELECT c.id, c.case_number, c.title,
            COALESCE(cf.total_fees,0) as total_fees, COALESCE(cf.paid,0) as paid, COALESCE(cf.remaining,0) as remaining
     FROM cases c LEFT JOIN case_fees cf ON cf.case_id = c.id AND ${notDeleted('cf')}
     WHERE c.client_id = ? AND c.is_archived = 0 AND ${notDeleted('c')}`
  if (csId) {
    caseSql += ' AND c.id = ?'
    caseParams.push(csId)
  }
  caseSql += ' ORDER BY remaining DESC, c.created_at DESC'
  const cases = db.prepare(caseSql).all(...caseParams)
  const invParams: unknown[] = [cid]
  let invSql = `SELECT COALESCE(SUM(total - paid),0) as due FROM invoices WHERE client_id = ? AND status != 'paid' AND ${notDeleted()}`
  if (csId) {
    invSql += ' AND (case_id = ? OR case_id IS NULL)'
    invParams.push(csId)
  }
  const inv = db.prepare(invSql).get(...invParams) as { due: number }
  return {
    client_id: cid,
    total: Number(fees.total),
    paid: Number(fees.paid),
    remaining: Number(fees.remaining),
    invoiceDue: Number(inv.due),
    cases
  }
}

export function listExpenses(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('e')}`
  if (q.search) {
    where += ' AND (e.expense_number LIKE ? OR e.description LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM expenses e ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT e.*, cat.name_ar as category_name, cb.name as cashbox_name
       FROM expenses e
       LEFT JOIN expense_categories cat ON cat.id = e.category_id AND ${notDeleted('cat')}
       LEFT JOIN cashboxes cb ON cb.id = e.cashbox_id AND ${notDeleted('cb')}
       ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createExpense(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(expenseSchema, data) as Record<string, unknown>
  const amount = Number(data.amount)
  if (!amount || amount <= 0) throw new Error('المبلغ غير صالح')
  const db = getDb()
  const cashboxId = resolveCashboxId(data.cashbox_id)
  const number = nextNumber(db, 'expense')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO expenses (id, expense_number, category_id, amount, cashbox_id, expense_date, client_id, case_id, description, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    number,
    asIdOrNull(data.category_id),
    amount,
    cashboxId,
    data.expense_date ?? ts.slice(0, 10),
    asIdOrNull(data.client_id),
    asIdOrNull(data.case_id),
    data.description ?? null,
    data.notes ?? null,
    actor.id,
    ts,
    ts
  )
  recordLocalChange('expenses', id, 'INSERT')
  const voucherNo = nextNumber(db, 'voucher')
  const vid = newId()
  db.prepare(
    `INSERT INTO vouchers (id, voucher_number, voucher_type, amount, cashbox_id, related_id, voucher_date, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(vid, voucherNo, 'expense', amount, cashboxId, id, data.expense_date ?? ts.slice(0, 10), data.description ?? null, ts, ts)
  recordLocalChange('vouchers', vid, 'INSERT')
  touchCashbox(cashboxId, 'expense', amount, 'expense', id, `مصروف ${number}`, actor.id)
  audit(actor, 'create', 'expenses', id, `تم تسجيل مصروف ${number}`)
  return { id, expense_number: number, voucher_number: voucherNo }
}

export function removeExpense(actor: AuthedUser, id: string) {
  const db = getDb()
  const e = db.prepare(`SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { amount: number; cashbox_id: string; expense_number: string }
    | undefined
  if (!e) throw new Error('المصروف غير موجود')
  touchCashbox(e.cashbox_id, 'deposit', e.amount, 'expense', id, `عكس مصروف ${e.expense_number}`, actor.id)
  const vouchers = db
    .prepare(`SELECT id FROM vouchers WHERE related_id = ? AND voucher_type = 'expense' AND ${notDeleted()}`)
    .all(id) as { id: string }[]
  for (const v of vouchers) softDelete('vouchers', v.id)
  softDelete('expenses', id)
  audit(actor, 'delete', 'expenses', id, `تم حذف المصروف ${e.expense_number}`)
}

export function expenseCategories() {
  return getDb().prepare(`SELECT * FROM expense_categories WHERE is_active = 1 AND ${notDeleted()}`).all()
}

export function listInvoices(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('i')}`
  if (q.search) {
    where += ' AND (i.invoice_number LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id AND ${notDeleted('cl')} ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT i.*, cl.full_name as client_name, cs.case_number
       FROM invoices i
       LEFT JOIN clients cl ON cl.id = i.client_id AND ${notDeleted('cl')}
       LEFT JOIN cases cs ON cs.id = i.case_id AND ${notDeleted('cs')}
       ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getInvoice(id: string) {
  const invoice = getDb()
    .prepare(
      `SELECT i.*, cl.full_name as client_name FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id AND ${notDeleted('cl')} WHERE i.id = ? AND ${notDeleted('i')}`
    )
    .get(id)
  if (!invoice) throw new Error('الفاتورة غير موجودة')
  const items = getDb().prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND ${notDeleted()}`).all(id)
  return { invoice, items }
}

export function createInvoice(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(invoiceSchema, data) as Record<string, unknown>
  const db = getDb()
  let clientId = asIdOrNull(data.client_id)
  const caseId = asIdOrNull(data.case_id)
  if (!clientId && caseId) {
    const cs = db.prepare(`SELECT client_id FROM cases WHERE id = ? AND ${notDeleted()}`).get(caseId) as
      | { client_id: string }
      | undefined
    clientId = cs?.client_id ?? null
  }
  if (!clientId) throw new Error('يجب اختيار العميل')
  const items = (data.items as { description: string; quantity: number; unit_price: number }[]) ?? []
  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0)
  if (subtotal <= 0) throw new Error('أضف بنودًا بمبلغ أكبر من صفر')
  const tax = Number(data.tax ?? 0)
  const total = subtotal + tax
  const number = nextNumber(db, 'invoice')
  const id = newId()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO invoices (id, invoice_number, client_id, case_id, invoice_date, due_date, subtotal, tax, total, paid, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?)`
  ).run(
    id,
    number,
    clientId,
    caseId,
    data.invoice_date ?? ts.slice(0, 10),
    data.due_date ?? null,
    subtotal,
    tax,
    total,
    'unpaid',
    data.notes ?? null,
    ts,
    ts
  )
  recordLocalChange('invoices', id, 'INSERT')
  for (const it of items) {
    const line = Number(it.quantity || 1) * Number(it.unit_price || 0)
    const iid = newId()
    db.prepare(
      'INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(iid, id, it.description, it.quantity || 1, it.unit_price || 0, line, ts, ts)
    recordLocalChange('invoice_items', iid, 'INSERT')
  }
  if (data.due_date) {
    createReminder({
      reminder_type: 'payment_due',
      title: `استحقاق الفاتورة ${number}`,
      remind_at: `${data.due_date}T09:00:00`,
      client_id: clientId,
      related_type: 'invoice',
      related_id: id
    })
  }
  audit(actor, 'create', 'invoices', id, `تم إنشاء الفاتورة ${number}`)
  return { id, invoice_number: number }
}

export function updateInvoice(actor: AuthedUser, id: string, data: Record<string, unknown>) {
  getDb()
    .prepare(`UPDATE invoices SET status=?, notes=?, paid=?, updated_at=? WHERE id=?`)
    .run(data.status ?? 'unpaid', data.notes ?? null, data.paid ?? 0, nowIso(), id)
  recordLocalChange('invoices', id, 'UPDATE')
  return { id }
}

export function removeInvoice(actor: AuthedUser, id: string) {
  const db = getDb()
  const items = db.prepare(`SELECT id FROM invoice_items WHERE invoice_id = ? AND ${notDeleted()}`).all(id) as { id: string }[]
  for (const it of items) softDelete('invoice_items', it.id)
  softDelete('invoices', id)
  audit(actor, 'delete', 'invoices', id, `تم حذف فاتورة رقم ${id}`)
}

export function listCashboxes() {
  return getDb().prepare(`SELECT * FROM cashboxes WHERE ${notDeleted()} ORDER BY created_at`).all()
}

export function createCashbox(actor: AuthedUser, data: Record<string, unknown>) {
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare('INSERT INTO cashboxes (id, name, type, current_balance, is_active, created_at, updated_at) VALUES (?,?,?,?,1,?,?)')
    .run(id, data.name, data.type ?? 'office', data.current_balance ?? 0, ts, ts)
  recordLocalChange('cashboxes', id, 'INSERT')
  audit(actor, 'create', 'cashboxes', id, `تم إنشاء خزينة ${data.name}`)
  return { id }
}

export function updateCashbox(id: string, data: Record<string, unknown>) {
  getDb()
    .prepare('UPDATE cashboxes SET name=?, type=?, is_active=?, updated_at=? WHERE id=?')
    .run(data.name, data.type, data.is_active ?? 1, nowIso(), id)
  recordLocalChange('cashboxes', id, 'UPDATE')
  return { id }
}

export function cashboxTransactions(cashboxId: string, q: ListQuery = {}) {
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 50
  const db = getDb()
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM cashbox_transactions WHERE cashbox_id = ? AND ${notDeleted()}`).get(cashboxId) as {
      c: number
    }
  ).c
  const rows = db
    .prepare(
      `SELECT * FROM cashbox_transactions WHERE cashbox_id = ? AND ${notDeleted()} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(cashboxId, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function moveCash(
  actor: AuthedUser,
  data: { cashbox_id: string; type: 'deposit' | 'withdrawal'; amount: number; description?: string }
) {
  const amount = Number(data.amount)
  if (!amount || amount <= 0) throw new Error('المبلغ غير صالح')
  const cashboxId = asId(data.cashbox_id)
  if (!cashboxId) throw new Error('الخزينة مطلوبة')
  const voucherNo = nextNumber(getDb(), 'voucher')
  const vid = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO vouchers (id, voucher_number, voucher_type, amount, cashbox_id, related_id, voucher_date, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(vid, voucherNo, data.type, amount, cashboxId, vid, ts.slice(0, 10), data.description ?? null, ts, ts)
  recordLocalChange('vouchers', vid, 'INSERT')
  touchCashbox(cashboxId, data.type, amount, 'voucher', vid, data.description ?? data.type, actor.id)
  audit(actor, 'create', 'cashboxes', cashboxId, `${data.type === 'deposit' ? 'إيداع' : 'سحب'} ${amount}`)
  return { voucher_number: voucherNo }
}

export function receiptPrintPayload(paymentId: string) {
  const db = getDb()
  const p = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, r.receipt_number
       FROM payments p
       LEFT JOIN clients cl ON cl.id = p.client_id AND ${notDeleted('cl')}
       LEFT JOIN receipts r ON r.payment_id = p.id AND ${notDeleted('r')}
       WHERE p.id = ? AND ${notDeleted('p')}`
    )
    .get(paymentId) as
    | {
        payment_number: string
        receipt_number: string
        client_name: string
        amount: number
        payment_date: string
        payment_method: string
        notes: string
      }
    | undefined
  if (!p) throw new Error('الدفعة غير موجودة')
  const body = `<p>إيصال قبض رقم <b>${p.receipt_number || p.payment_number}</b></p>
    <p>استلمنا من: <b>${p.client_name || '—'}</b></p>
    <p>مبلغاً وقدره: <b>${Number(p.amount).toLocaleString('ar-EG')}</b></p>
    <p>طريقة الدفع: ${p.payment_method || 'نقدي'} — التاريخ: ${p.payment_date || ''}</p>
    <p>${p.notes || ''}</p>
    <p class="total">المبلغ: ${Number(p.amount).toLocaleString('ar-EG')}</p>`
  return { title: 'إيصال قبض', body, kind: 'receipt' as const, name: `receipt-${p.receipt_number || paymentId}.pdf` }
}

export function voucherPrintPayload(expenseId: string) {
  const db = getDb()
  const e = db
    .prepare(
      `SELECT e.*, v.voucher_number, cat.name_ar as category_name
       FROM expenses e
       LEFT JOIN vouchers v ON v.related_id = e.id AND v.voucher_type = 'expense' AND ${notDeleted('v')}
       LEFT JOIN expense_categories cat ON cat.id = e.category_id AND ${notDeleted('cat')}
       WHERE e.id = ? AND ${notDeleted('e')}`
    )
    .get(expenseId) as
    | {
        expense_number: string
        voucher_number: string
        amount: number
        expense_date: string
        description: string
        category_name: string
      }
    | undefined
  if (!e) throw new Error('المصروف غير موجود')
  const body = `<p>سند صرف رقم <b>${e.voucher_number || e.expense_number}</b></p>
    <p>البند: <b>${e.category_name || '—'}</b></p>
    <p>البيان: ${e.description || '—'}</p>
    <p>التاريخ: ${e.expense_date || ''}</p>
    <p class="total">المبلغ: ${Number(e.amount).toLocaleString('ar-EG')}</p>`
  return { title: 'سند صرف', body, kind: 'voucher' as const, name: `voucher-${e.voucher_number || expenseId}.pdf` }
}
