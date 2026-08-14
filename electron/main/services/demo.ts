import bcrypt from 'bcryptjs'
import { getDb, nextNumber } from '../db/database'
import { nowIso, addDays } from '../utils/time'
import { getDocumentsDir } from '../paths'
import { newId, notDeleted } from '../db/ids'
import { recordLocalChange } from '../sync/queue'
import fs from 'fs'
import path from 'path'
export { wipeBusinessData } from './wipe'

export function seedDemoData(): { ok: true } {
  const db = getDb()
  const existing = db.prepare(`SELECT COUNT(*) as c FROM clients WHERE client_number LIKE 'CL-%' AND ${notDeleted()}`).get() as {
    c: number
  }
  if (existing.c >= 10) return { ok: true }

  const ts = nowIso()
  const today = ts.slice(0, 10)
  const lawyerRole = db.prepare(`SELECT id FROM roles WHERE code='lawyer' AND ${notDeleted()}`).get() as { id: string }
  const accRole = db.prepare(`SELECT id FROM roles WHERE code='accountant' AND ${notDeleted()}`).get() as { id: string }
  const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin' AND ${notDeleted()}`).get() as { id: string }
  const cashbox = db.prepare(`SELECT id FROM cashboxes WHERE ${notDeleted()} ORDER BY created_at ASC LIMIT 1`).get() as {
    id: string
  }
  const hash = bcrypt.hashSync('Demo@123', 10)

  const uniqueUser = (base: string) => {
    let u = base
    let n = 1
    while (db.prepare(`SELECT id FROM users WHERE username = ? AND ${notDeleted()}`).get(u)) {
      u = `${base}${n++}`
    }
    return u
  }

  const lawyerNames = ['أحمد عبد الرحمن', 'سارة محمود', 'محمد حسن', 'ليلى فتحي', 'خالد إبراهيم']
  const lawyerIds: string[] = []
  const lawyerUserIds: string[] = []
  for (const name of lawyerNames) {
    const username = uniqueUser(name.split(' ')[0] + 'Law')
    const userId = newId()
    db.prepare(
      `INSERT INTO users (id, username, password_hash, full_name, role_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(userId, username, hash, name, lawyerRole.id, ts, ts)
    recordLocalChange('users', userId, 'INSERT')
    lawyerUserIds.push(userId)
    const lawyerId = newId()
    db.prepare(
      `INSERT INTO lawyers (id, user_id, full_name, bar_number, specialization, phone, hire_date, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?, 'active', ?, ?)`
    ).run(lawyerId, userId, name, 'BAR-' + Math.floor(10000 + Math.random() * 89999), 'مدني', '0100000000', today, ts, ts)
    recordLocalChange('lawyers', lawyerId, 'INSERT')
    lawyerIds.push(lawyerId)
  }

  const accId = newId()
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)`
  ).run(accId, uniqueUser('accountant'), hash, 'محمود المحاسب', accRole.id, ts, ts)
  recordLocalChange('users', accId, 'INSERT')

  const clients = [
    { n: 'يوسف علي', t: 'individual', p: '01011112222', nid: '29001011234567' },
    { n: 'نادية سالم', t: 'individual', p: '01022223333', nid: '28503021234567' },
    { n: 'شركة النور للتجارة', t: 'company', p: '0223456789', nid: '' },
    { n: 'مؤسسة الأمل', t: 'institution', p: '01033334444', nid: '' },
    { n: 'حسام الدين كمال', t: 'individual', p: '01044445555', nid: '28807011234567' },
    { n: 'منى عبد العزيز', t: 'individual', p: '01055556666', nid: '29211011234567' },
    { n: 'شركة وادي النيل', t: 'company', p: '0233344455', nid: '' },
    { n: 'الهيئة العامة للمطارات', t: 'government', p: '0222223333', nid: '' },
    { n: 'طارق جابر', t: 'individual', p: '01066667777', nid: '27904011234567' },
    { n: 'فاطمة الزهراء', t: 'individual', p: '01077778888', nid: '29508011234567' }
  ]
  const clientIds: string[] = []
  for (const c of clients) {
    const num = nextNumber(db, 'client')
    const id = newId()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, phone, national_id, client_type, governorate, address, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,'القاهرة','وسط البلد',?,?,?)`
    ).run(id, num, c.n, c.p, c.nid || null, c.t, ts, ts, admin.id)
    recordLocalChange('clients', id, 'INSERT')
    clientIds.push(id)
    if (c.t === 'company') {
      const cid = newId()
      db.prepare(
        'INSERT INTO client_contacts (id, client_id, name, position, phone, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
      ).run(cid, id, 'المدير التنفيذي', 'مدير', c.p, ts, ts)
      recordLocalChange('client_contacts', cid, 'INSERT')
    }
  }

  const types = db.prepare(`SELECT id, name_ar FROM case_types WHERE ${notDeleted()}`).all() as { id: string; name_ar: string }[]
  const statuses = ['new', 'under_review', 'filed', 'in_trial', 'postponed', 'for_judgment', 'judged', 'appeal', 'execution', 'closed']
  const titles = [
    'دعوى تعويض عن حادث',
    'نزاع إيجار شقة',
    'قضية شيك بدون رصيد',
    'خلاف عمالي',
    'دعوى أحوال شخصية',
    'نزاع تجاري توريدات',
    'قضية نصب',
    'طعن إداري',
    'تنفيذ حكم مدني',
    'دعوى ملكية فكرية'
  ]
  const caseIds: string[] = []
  titles.forEach((title, i) => {
    const num = nextNumber(db, 'case')
    const id = newId()
    db.prepare(
      `INSERT INTO cases (id, case_number, internal_file_number, title, client_id, primary_lawyer_id, case_type_id, court, circuit, governorate, status, opponent_name, description, received_date, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      num,
      'F-' + (100 + i),
      title,
      clientIds[i],
      lawyerIds[i % lawyerIds.length],
      types[i % types.length].id,
      'محكمة جنوب القاهرة',
      'دائرة ' + (i + 1),
      'القاهرة',
      statuses[i],
      'الخصم ' + (i + 1),
      'ملخص تجريبي للقضية: ' + title,
      today,
      ts,
      ts,
      admin.id
    )
    recordLocalChange('cases', id, 'INSERT')
    caseIds.push(id)
    const fid = newId()
    db.prepare(
      `INSERT INTO case_fees (id, case_id, total_fees, paid, remaining, due_date, installment_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(fid, id, 20000 + i * 1000, 5000, 15000 + i * 1000, addDays(today, 30).slice(0, 10), 3, ts, ts)
    recordLocalChange('case_fees', fid, 'INSERT')
  })

  for (let i = 0; i < 10; i++) {
    const hid = newId()
    db.prepare(
      `INSERT INTO hearings (id, case_id, hearing_date, hearing_time, hearing_type, lawyer_id, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      hid,
      caseIds[i],
      i < 3 ? today : addDays(today, i).slice(0, 10),
      '10:00',
      'مرافعة',
      lawyerIds[i % lawyerIds.length],
      'upcoming',
      'جلسة تجريبية',
      ts,
      ts
    )
    recordLocalChange('hearings', hid, 'INSERT')

    const tid = newId()
    db.prepare(
      `INSERT INTO tasks (id, title, description, assignee_id, case_id, client_id, due_date, priority, status, progress, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      tid,
      'مهمة ' + (i + 1),
      'إعداد مذكرة للدفاع',
      lawyerUserIds[i % lawyerUserIds.length] || admin.id,
      caseIds[i],
      clientIds[i],
      addDays(today, i - 2).slice(0, 10),
      i % 3 === 0 ? 'high' : 'medium',
      i < 2 ? 'overdue' : 'new',
      0,
      ts,
      ts
    )
    recordLocalChange('tasks', tid, 'INSERT')

    const aid = newId()
    db.prepare(
      `INSERT INTO appointments (id, title, appointment_type, client_id, lawyer_id, date, time, location, purpose, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'scheduled', ?, ?)`
    ).run(
      aid,
      'موعد مع عميل ' + (i + 1),
      'client',
      clientIds[i],
      lawyerIds[i % lawyerIds.length],
      addDays(today, i).slice(0, 10),
      '12:00',
      'المكتب',
      'استشارة',
      ts,
      ts
    )
    recordLocalChange('appointments', aid, 'INSERT')

    const dest = path.join(getDocumentsDir(), `demo-${i + 1}.txt`)
    fs.writeFileSync(dest, `مستند تجريبي رقم ${i + 1}`)
    const did = newId()
    db.prepare(
      `INSERT INTO documents (id, title, category, client_id, case_id, file_path, file_name, mime_type, file_size, current_version, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`
    ).run(did, 'مستند ' + (i + 1), 'case_docs', clientIds[i], caseIds[i], dest, `demo-${i + 1}.txt`, 'text/plain', 40, admin.id, ts, ts)
    recordLocalChange('documents', did, 'INSERT')

    const pnum = nextNumber(db, 'payment')
    const pid = newId()
    db.prepare(
      `INSERT INTO payments (id, payment_number, client_id, case_id, amount, payment_type, payment_method, cashbox_id, payment_date, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?, 'fees', 'cash', ?, ?, ?, ?, ?)`
    ).run(pid, pnum, clientIds[i], caseIds[i], 1500 + i * 100, cashbox.id, today, admin.id, ts, ts)
    recordLocalChange('payments', pid, 'INSERT')
    db.prepare('UPDATE cashboxes SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?').run(
      1500 + i * 100,
      ts,
      cashbox.id
    )
    recordLocalChange('cashboxes', cashbox.id, 'UPDATE')
  }

  for (let i = 0; i < 5; i++) {
    const oid = newId()
    db.prepare(
      `INSERT INTO opponents (id, full_name, phone, address, lawyer_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(oid, 'خصم تجريبي ' + (i + 1), '0110000000' + i, 'الجيزة', 'محامي الخصم', ts, ts)
    recordLocalChange('opponents', oid, 'INSERT')
  }

  return { ok: true }
}
