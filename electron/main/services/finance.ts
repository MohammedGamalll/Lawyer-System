import { getDb, nextNumber } from '../db/database'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { createReminder } from './reminders'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { paymentSchema, expenseSchema, invoiceSchema, parseSchema } from '@shared/schemas'

function touchCashbox(cashboxId: number, type: string, amount: number, relatedType: string, relatedId: number, desc: string, actorId: number) {
  const db = getDb()
  const sign = type === 'expense' || type === 'withdrawal' ? -1 : 1
  db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = ?').run(sign * amount, cashboxId)
  db.prepare(
    `INSERT INTO cashbox_transactions (cashbox_id, transaction_type, amount, related_type, related_id, description, transaction_date, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(cashboxId, type, amount, relatedType, relatedId, desc, nowIso().slice(0, 10), actorId, nowIso())
}

export function listPayments(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (q.search) {
    where += ' AND (p.payment_number LIKE ? OR cl.full_name LIKE ? OR cs.case_number LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s, s)
  }
  if (q.filters?.client_id) {
    where += ' AND p.client_id = ?'
    params.push(q.filters.client_id)
  }
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM payments p LEFT JOIN clients cl ON cl.id = p.client_id LEFT JOIN cases cs ON cs.id = p.case_id ${where}`
      )
      .get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, cs.case_number, cb.name as cashbox_name
       FROM payments p
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN cases cs ON cs.id = p.case_id
       LEFT JOIN cashboxes cb ON cb.id = p.cashbox_id
       ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`
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
  let clientId = data.client_id || null
  if (!clientId && data.case_id) {
    const cs = db.prepare('SELECT client_id FROM cases WHERE id = ?').get(data.case_id) as { client_id: number } | undefined
    clientId = cs?.client_id ?? null
  }
  const number = nextNumber(db, 'payment')
  const info = db
    .prepare(
      `INSERT INTO payments (payment_number, client_id, case_id, amount, payment_type, payment_method, cashbox_id, payment_date, due_date, notes, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      clientId,
      data.case_id || null,
      amount,
      data.payment_type ?? 'fees',
      data.payment_method ?? 'cash',
      data.cashbox_id || 1,
      data.payment_date ?? nowIso().slice(0, 10),
      data.due_date ?? null,
      data.notes ?? null,
      actor.id,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  const receiptNo = nextNumber(db, 'receipt')
  db.prepare(
    `INSERT INTO receipts (receipt_number, payment_id, client_id, amount, receipt_date, notes, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(receiptNo, id, clientId, amount, data.payment_date ?? nowIso().slice(0, 10), data.notes ?? null, nowIso())
  touchCashbox(Number(data.cashbox_id || 1), 'income', amount, 'payment', id, `دفعة ${number}`, actor.id)
  if (data.case_id) {
    const fees = db.prepare('SELECT * FROM case_fees WHERE case_id = ?').get(data.case_id) as
      | { total_fees: number; paid: number }
      | undefined
    if (fees) {
      const paid = fees.paid + amount
      db.prepare('UPDATE case_fees SET paid = ?, remaining = ? WHERE case_id = ?').run(
        paid,
        Math.max(0, fees.total_fees - paid),
        data.case_id
      )
    }
  }
  audit(actor, 'create', 'payments', id, `تم تسجيل دفعة ${number} بمبلغ ${amount}`)
  if (clientId) {
    const params: unknown[] = [clientId]
    let invSql = `SELECT id, total, paid FROM invoices WHERE status != 'paid' AND client_id = ?`
    if (data.case_id) {
      invSql += ' AND (case_id = ? OR case_id IS NULL)'
      params.push(data.case_id)
    }
    invSql += ' ORDER BY id'
    const openInvs = db.prepare(invSql).all(...params) as { id: number; total: number; paid: number }[]
    let left = amount
    for (const inv of openInvs) {
      if (left <= 0) break
      const need = Math.max(0, Number(inv.total) - Number(inv.paid || 0))
      if (need <= 0) continue
      const add = Math.min(need, left)
      const paid = Number(inv.paid || 0) + add
      const status = paid >= Number(inv.total) - 0.001 ? 'paid' : 'partial'
      db.prepare('UPDATE invoices SET paid = ?, status = ? WHERE id = ?').run(paid, status, inv.id)
      left -= add
    }
  }
  return { id, payment_number: number, receipt_number: receiptNo }
}

export function removePayment(actor: AuthedUser, id: number) {
  const db = getDb()
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as
    | { amount: number; cashbox_id: number; case_id: number | null; payment_number: string }
    | undefined
  if (!p) throw new Error('الدفعة غير موجودة')
  if (p.cashbox_id) touchCashbox(p.cashbox_id, 'withdrawal', p.amount, 'payment', id, `عكس دفعة ${p.payment_number}`, actor.id)
  if (p.case_id) {
    const fees = db.prepare('SELECT * FROM case_fees WHERE case_id = ?').get(p.case_id) as { paid: number; total_fees: number } | undefined
    if (fees) {
      const paid = Math.max(0, fees.paid - p.amount)
      db.prepare('UPDATE case_fees SET paid=?, remaining=? WHERE case_id=?').run(paid, fees.total_fees - paid, p.case_id)
    }
  }
  db.prepare('DELETE FROM receipts WHERE payment_id = ?').run(id)
  db.prepare('DELETE FROM payments WHERE id = ?').run(id)
  audit(actor, 'delete', 'payments', id, `تم حذف الدفعة ${p.payment_number}`)
}

export function paymentBalance(clientId?: number, caseId?: number) {
  const db = getDb()
  let cid = Number(clientId || 0)
  if (!cid && caseId) {
    const cs = db.prepare('SELECT client_id FROM cases WHERE id = ?').get(caseId) as { client_id: number } | undefined
    cid = cs?.client_id ?? 0
  }
  if (!cid) {
    return { client_id: null, total: 0, paid: 0, remaining: 0, invoiceDue: 0, cases: [] as object[] }
  }
  const feeParams: unknown[] = [cid]
  let feeWhere = 'c.client_id = ?'
  if (caseId) {
    feeWhere += ' AND cf.case_id = ?'
    feeParams.push(caseId)
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
     FROM cases c LEFT JOIN case_fees cf ON cf.case_id = c.id WHERE c.client_id = ? AND c.is_archived = 0`
  if (caseId) {
    caseSql += ' AND c.id = ?'
    caseParams.push(caseId)
  }
  caseSql += ' ORDER BY remaining DESC, c.id DESC'
  const cases = db.prepare(caseSql).all(...caseParams)
  const invParams: unknown[] = [cid]
  let invSql = `SELECT COALESCE(SUM(total - paid),0) as due FROM invoices WHERE client_id = ? AND status != 'paid'`
  if (caseId) {
    invSql += ' AND (case_id = ? OR case_id IS NULL)'
    invParams.push(caseId)
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
  let where = 'WHERE 1=1'
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
       LEFT JOIN expense_categories cat ON cat.id = e.category_id
       LEFT JOIN cashboxes cb ON cb.id = e.cashbox_id
       ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function createExpense(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(expenseSchema, data) as Record<string, unknown>
  const amount = Number(data.amount)
  if (!amount || amount <= 0) throw new Error('المبلغ غير صالح')
  const db = getDb()
  const number = nextNumber(db, 'expense')
  const info = db
    .prepare(
      `INSERT INTO expenses (expense_number, category_id, amount, cashbox_id, expense_date, client_id, case_id, description, notes, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      number,
      data.category_id || null,
      amount,
      data.cashbox_id || 1,
      data.expense_date ?? nowIso().slice(0, 10),
      data.client_id || null,
      data.case_id || null,
      data.description ?? null,
      data.notes ?? null,
      actor.id,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  const voucherNo = nextNumber(db, 'voucher')
  db.prepare(
    `INSERT INTO vouchers (voucher_number, voucher_type, amount, cashbox_id, related_id, voucher_date, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(voucherNo, 'expense', amount, data.cashbox_id || 1, id, data.expense_date ?? nowIso().slice(0, 10), data.description ?? null, nowIso())
  touchCashbox(Number(data.cashbox_id || 1), 'expense', amount, 'expense', id, `مصروف ${number}`, actor.id)
  audit(actor, 'create', 'expenses', id, `تم تسجيل مصروف ${number}`)
  return { id, expense_number: number, voucher_number: voucherNo }
}

export function removeExpense(actor: AuthedUser, id: number) {
  const db = getDb()
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as { amount: number; cashbox_id: number; expense_number: string } | undefined
  if (!e) throw new Error('المصروف غير موجود')
  touchCashbox(e.cashbox_id, 'deposit', e.amount, 'expense', id, `عكس مصروف ${e.expense_number}`, actor.id)
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
  audit(actor, 'delete', 'expenses', id, `تم حذف المصروف ${e.expense_number}`)
}

export function expenseCategories() {
  return getDb().prepare('SELECT * FROM expense_categories WHERE is_active = 1').all()
}

export function listInvoices(q: ListQuery = {}) {
  const db = getDb()
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (q.search) {
    where += ' AND (i.invoice_number LIKE ? OR cl.full_name LIKE ?)'
    const s = `%${q.search}%`
    params.push(s, s)
  }
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id ${where}`).get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `SELECT i.*, cl.full_name as client_name, cs.case_number
       FROM invoices i
       LEFT JOIN clients cl ON cl.id = i.client_id
       LEFT JOIN cases cs ON cs.id = i.case_id
       ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function getInvoice(id: number) {
  const invoice = getDb().prepare('SELECT i.*, cl.full_name as client_name FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id WHERE i.id = ?').get(id)
  if (!invoice) throw new Error('الفاتورة غير موجودة')
  const items = getDb().prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id)
  return { invoice, items }
}

export function createInvoice(actor: AuthedUser, data: Record<string, unknown>) {
  data = parseSchema(invoiceSchema, data) as Record<string, unknown>
  const db = getDb()
  let clientId = Number(data.client_id || 0)
  if (!clientId && data.case_id) {
    const cs = db.prepare('SELECT client_id FROM cases WHERE id = ?').get(data.case_id) as { client_id: number } | undefined
    clientId = cs?.client_id ?? 0
  }
  if (!clientId) throw new Error('يجب اختيار العميل')
  const items = (data.items as { description: string; quantity: number; unit_price: number }[]) ?? []
  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0)
  if (subtotal <= 0) throw new Error('أضف بنودًا بمبلغ أكبر من صفر')
  const tax = Number(data.tax ?? 0)
  const total = subtotal + tax
  const number = nextNumber(db, 'invoice')
  const info = db
    .prepare(
      `INSERT INTO invoices (invoice_number, client_id, case_id, invoice_date, due_date, subtotal, tax, total, paid, status, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`
    )
    .run(
      number,
      clientId,
      data.case_id || null,
      data.invoice_date ?? nowIso().slice(0, 10),
      data.due_date ?? null,
      subtotal,
      tax,
      total,
      'unpaid',
      data.notes ?? null,
      nowIso()
    )
  const id = Number(info.lastInsertRowid)
  const ins = db.prepare(
    'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?,?,?,?,?)'
  )
  for (const it of items) {
    const line = Number(it.quantity || 1) * Number(it.unit_price || 0)
    ins.run(id, it.description, it.quantity || 1, it.unit_price || 0, line)
  }
  if (data.due_date) {
    createReminder({
      reminder_type: 'payment_due',
      title: `استحقاق الفاتورة ${number}`,
      remind_at: `${data.due_date}T09:00:00`,
      client_id: clientId || (data.client_id as number) || null,
      related_type: 'invoice',
      related_id: id
    })
  }
  audit(actor, 'create', 'invoices', id, `تم إنشاء الفاتورة ${number}`)
  return { id, invoice_number: number }
}

export function updateInvoice(actor: AuthedUser, id: number, data: Record<string, unknown>) {
  getDb()
    .prepare(`UPDATE invoices SET status=?, notes=?, paid=? WHERE id=?`)
    .run(data.status ?? 'unpaid', data.notes ?? null, data.paid ?? 0, id)
  return { id }
}

export function removeInvoice(actor: AuthedUser, id: number) {
  getDb().prepare('DELETE FROM invoices WHERE id = ?').run(id)
  audit(actor, 'delete', 'invoices', id, `تم حذف فاتورة رقم ${id}`)
}

export function listCashboxes() {
  return getDb().prepare('SELECT * FROM cashboxes ORDER BY id').all()
}

export function createCashbox(actor: AuthedUser, data: Record<string, unknown>) {
  const info = getDb()
    .prepare('INSERT INTO cashboxes (name, type, current_balance, is_active) VALUES (?,?,?,1)')
    .run(data.name, data.type ?? 'office', data.current_balance ?? 0)
  audit(actor, 'create', 'cashboxes', Number(info.lastInsertRowid), `تم إنشاء خزينة ${data.name}`)
  return { id: Number(info.lastInsertRowid) }
}

export function updateCashbox(id: number, data: Record<string, unknown>) {
  getDb().prepare('UPDATE cashboxes SET name=?, type=?, is_active=? WHERE id=?').run(data.name, data.type, data.is_active ?? 1, id)
  return { id }
}

export function cashboxTransactions(cashboxId: number, q: ListQuery = {}) {
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 50
  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) as c FROM cashbox_transactions WHERE cashbox_id = ?').get(cashboxId) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT * FROM cashbox_transactions WHERE cashbox_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(cashboxId, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export function moveCash(actor: AuthedUser, data: { cashbox_id: number; type: 'deposit' | 'withdrawal'; amount: number; description?: string }) {
  const amount = Number(data.amount)
  if (!amount || amount <= 0) throw new Error('المبلغ غير صالح')
  const voucherNo = nextNumber(getDb(), 'voucher')
  getDb()
    .prepare(
      `INSERT INTO vouchers (voucher_number, voucher_type, amount, cashbox_id, voucher_date, notes, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(voucherNo, data.type, amount, data.cashbox_id, nowIso().slice(0, 10), data.description ?? null, nowIso())
  touchCashbox(data.cashbox_id, data.type, amount, 'voucher', 0, data.description ?? data.type, actor.id)
  audit(actor, 'create', 'cashboxes', data.cashbox_id, `${data.type === 'deposit' ? 'إيداع' : 'سحب'} ${amount}`)
  return { voucher_number: voucherNo }
}

export function receiptPrintPayload(paymentId: number) {
  const db = getDb()
  const p = db
    .prepare(
      `SELECT p.*, cl.full_name as client_name, r.receipt_number
       FROM payments p
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       WHERE p.id = ?`
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

export function voucherPrintPayload(expenseId: number) {
  const db = getDb()
  const e = db
    .prepare(
      `SELECT e.*, v.voucher_number, cat.name_ar as category_name
       FROM expenses e
       LEFT JOIN vouchers v ON v.related_id = e.id AND v.voucher_type = 'expense'
       LEFT JOIN expense_categories cat ON cat.id = e.category_id
       WHERE e.id = ?`
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
