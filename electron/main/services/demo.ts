import bcrypt from 'bcryptjs'
import { getDb, nextNumber } from '../db/database'
import { nowIso, addDays } from '../utils/time'
import { getDocumentsDir } from '../paths'
import fs from 'fs'
import path from 'path'

export function seedDemoData(): { ok: true } {
  const db = getDb()
  const existing = db.prepare(`SELECT COUNT(*) as c FROM clients WHERE client_number LIKE 'CL-%'`).get() as { c: number }
  if (existing.c >= 10) return { ok: true }

  const ts = nowIso()
  const today = ts.slice(0, 10)
  const lawyerRole = db.prepare(`SELECT id FROM roles WHERE code='lawyer'`).get() as { id: number }
  const accRole = db.prepare(`SELECT id FROM roles WHERE code='accountant'`).get() as { id: number }
  const hash = bcrypt.hashSync('Demo@123', 10)

  const lawyerNames = ['أحمد عبد الرحمن', 'سارة محمود', 'محمد حسن', 'ليلى فتحي', 'خالد إبراهيم']
  const lawyerIds: number[] = []
  for (const name of lawyerNames) {
    const u = db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, role_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(name.split(' ')[0] + Math.floor(Math.random() * 90 + 10), hash, name, lawyerRole.id, ts, ts)
    const l = db
      .prepare(
        `INSERT INTO lawyers (user_id, full_name, bar_number, specialization, phone, hire_date, status, created_at)
         VALUES (?,?,?,?,?,?, 'active', ?)`
      )
      .run(Number(u.lastInsertRowid), name, 'BAR-' + Math.floor(10000 + Math.random() * 89999), 'مدني', '0100000000', today, ts)
    lawyerIds.push(Number(l.lastInsertRowid))
  }

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role_id, is_active, created_at, updated_at) VALUES (?,?,?,?,1,?,?)`
  ).run('accountant', hash, 'محمود المحاسب', accRole.id, ts, ts)

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
  const clientIds: number[] = []
  for (const c of clients) {
    const num = nextNumber(db, 'client')
    const info = db
      .prepare(
        `INSERT INTO clients (client_number, full_name, phone, national_id, client_type, governorate, address, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,'القاهرة','وسط البلد',?,?,1)`
      )
      .run(num, c.n, c.p, c.nid || null, c.t, ts, ts)
    clientIds.push(Number(info.lastInsertRowid))
    if (c.t === 'company') {
      db.prepare('INSERT INTO client_contacts (client_id, name, position, phone) VALUES (?,?,?,?)').run(
        Number(info.lastInsertRowid),
        'المدير التنفيذي',
        'مدير',
        c.p
      )
    }
  }

  const types = db.prepare('SELECT id, name_ar FROM case_types').all() as { id: number; name_ar: string }[]
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
  const caseIds: number[] = []
  titles.forEach((title, i) => {
    const num = nextNumber(db, 'case')
    const info = db
      .prepare(
        `INSERT INTO cases (case_number, internal_file_number, title, client_id, primary_lawyer_id, case_type_id, court, circuit, governorate, status, opponent_name, description, received_date, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`
      )
      .run(
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
        ts
      )
    const id = Number(info.lastInsertRowid)
    caseIds.push(id)
    db.prepare(
      `INSERT INTO case_fees (case_id, total_fees, paid, remaining, due_date, installment_count) VALUES (?,?,?,?,?,?)`
    ).run(id, 20000 + i * 1000, 5000, 15000 + i * 1000, addDays(today, 30).slice(0, 10), 3)
  })

  for (let i = 0; i < 10; i++) {
    db.prepare(
      `INSERT INTO hearings (case_id, hearing_date, hearing_time, hearing_type, lawyer_id, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      caseIds[i],
      i < 3 ? today : addDays(today, i).slice(0, 10),
      '10:00',
      'مرافعة',
      lawyerIds[i % lawyerIds.length],
      i === 0 ? 'upcoming' : 'upcoming',
      'جلسة تجريبية',
      ts,
      ts
    )
    db.prepare(
      `INSERT INTO tasks (title, description, assignee_id, case_id, client_id, due_date, priority, status, progress, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      'مهمة ' + (i + 1),
      'إعداد مذكرة للدفاع',
      1,
      caseIds[i],
      clientIds[i],
      addDays(today, i - 2).slice(0, 10),
      i % 3 === 0 ? 'high' : 'medium',
      i < 2 ? 'overdue' : 'new',
      0,
      ts,
      ts
    )
    db.prepare(
      `INSERT INTO appointments (title, appointment_type, client_id, lawyer_id, date, time, location, purpose, status, created_at)
       VALUES (?,?,?,?,?,?,?,?, 'scheduled', ?)`
    ).run('موعد مع عميل ' + (i + 1), 'client', clientIds[i], lawyerIds[i % lawyerIds.length], addDays(today, i).slice(0, 10), '12:00', 'المكتب', 'استشارة', ts)

    const dest = path.join(getDocumentsDir(), `demo-${i + 1}.txt`)
    fs.writeFileSync(dest, `مستند تجريبي رقم ${i + 1}`)
    db.prepare(
      `INSERT INTO documents (title, category, client_id, case_id, file_path, file_name, mime_type, file_size, current_version, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,1,1,?,?)`
    ).run('مستند ' + (i + 1), 'case_docs', clientIds[i], caseIds[i], dest, `demo-${i + 1}.txt`, 'text/plain', 40, ts, ts)

    const pnum = nextNumber(db, 'payment')
    db.prepare(
      `INSERT INTO payments (payment_number, client_id, case_id, amount, payment_type, payment_method, cashbox_id, payment_date, created_by, created_at)
       VALUES (?,?,?,?, 'fees', 'cash', 1, ?, 1, ?)`
    ).run(pnum, clientIds[i], caseIds[i], 1500 + i * 100, today, ts)
    db.prepare('UPDATE cashboxes SET current_balance = current_balance + ? WHERE id = 1').run(1500 + i * 100)
  }

  for (let i = 0; i < 5; i++) {
    db.prepare(
      `INSERT INTO opponents (full_name, phone, address, lawyer_name, created_at) VALUES (?,?,?,?,?)`
    ).run('خصم تجريبي ' + (i + 1), '0110000000' + i, 'الجيزة', 'محامي الخصم', ts)
  }

  return { ok: true }
}
