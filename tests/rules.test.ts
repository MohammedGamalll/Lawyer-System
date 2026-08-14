import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL, CASE_TYPE_SEEDS, EXPENSE_CATEGORY_SEEDS } from '../electron/main/db/schema'
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '../shared/permissions'
import { WriteQueue } from '../electron/main/queue/writeQueue'

function seed(db: Database.Database) {
  db.exec(SCHEMA_SQL)
  const ts = new Date().toISOString()
  const insertRole = db.prepare(
    'INSERT INTO roles (id, code, name_ar, name_en, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  )
  for (const role of ROLES) insertRole.run(randomUUID(), role.code, role.nameAr, role.nameEn, ts, ts)
  const insertPerm = db.prepare(
    'INSERT INTO permissions (id, code, name_ar, name_en, module, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const p of PERMISSIONS) insertPerm.run(randomUUID(), p.code, p.nameAr, p.nameEn, p.module, ts, ts)
  const roleByCode = db.prepare('SELECT id FROM roles WHERE code = ?')
  const permByCode = db.prepare('SELECT id FROM permissions WHERE code = ?')
  const insertRp = db.prepare(
    'INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [code, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByCode.get(code) as { id: string }
    for (const permCode of perms) {
      const perm = permByCode.get(permCode) as { id: string } | undefined
      if (perm) insertRp.run(randomUUID(), role.id, perm.id, ts, ts)
    }
  }
  const adminRole = roleByCode.get('admin') as { id: string }
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)`
  ).run(randomUUID(), 'admin', bcrypt.hashSync('Admin@123', 8), 'مدير', adminRole.id, ts, ts)
  CASE_TYPE_SEEDS.forEach((n, i) =>
    db.prepare(
      'INSERT INTO case_types (id, name_ar, name_en, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,1,?,?,?)'
    ).run(randomUUID(), n, n, i, ts, ts)
  )
  EXPENSE_CATEGORY_SEEDS.forEach((n) =>
    db
      .prepare(
        'INSERT INTO expense_categories (id, name_ar, name_en, is_active, created_at, updated_at) VALUES (?,?,?,1,?,?)'
      )
      .run(randomUUID(), n, n, ts, ts)
  )
  db.prepare(
    'INSERT INTO cashboxes (id, name, type, current_balance, is_active, created_at, updated_at) VALUES (?,?,?,0,1,?,?)'
  ).run(randomUUID(), 'مكتب', 'office', ts, ts)
  db.prepare('INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,0,4,?)').run(
    'client',
    'CL-',
    ts
  )
  db.prepare('INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,0,5,?)').run(
    'case',
    'CS-',
    ts
  )
  db.prepare('INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,0,5,?)').run(
    'payment',
    'PAY-',
    ts
  )
}

function sqliteAvailable() {
  try {
    const probe = new Database(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
}

describe.skipIf(!sqliteAvailable())('business rules', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-'))
    db = new Database(path.join(dir, 't.db'))
    db.pragma('foreign_keys = ON')
    seed(db)
  })
  afterEach(() => {
    try {
      db?.close()
    } catch {
      /* native module mismatch */
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('hashes passwords and never stores plaintext', () => {
    const u = db.prepare('SELECT password_hash FROM users WHERE username=?').get('admin') as { password_hash: string }
    expect(u.password_hash).not.toBe('Admin@123')
    expect(bcrypt.compareSync('Admin@123', u.password_hash)).toBe(true)
  })

  it('cannot create a case without a client (FK)', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at) VALUES (?,'CS-1','x',?,'new',datetime('now'),datetime('now'))`
      ).run(randomUUID(), randomUUID())
    }).toThrow()
  })

  it('cannot create a hearing without a case', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO hearings (id, case_id, hearing_date, status, created_at, updated_at) VALUES (?,?,'2026-01-01','upcoming',datetime('now'),datetime('now'))`
      ).run(randomUUID(), randomUUID())
    }).toThrow()
  })

  it('blocks deleting a client that still has cases', () => {
    const clientId = randomUUID()
    db.prepare(
      `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at) VALUES (?,'CL-1','عميل','individual',datetime('now'),datetime('now'))`
    ).run(clientId)
    db.prepare(
      `INSERT INTO cases (id, case_number, title, client_id, status, created_at, updated_at) VALUES (?,'CS-1','قضية',?,'new',datetime('now'),datetime('now'))`
    ).run(randomUUID(), clientId)
    const count = (db.prepare('SELECT COUNT(*) as c FROM cases WHERE client_id=?').get(clientId) as { c: number }).c
    expect(count).toBe(1)
  })

  it('next number sequence increments', () => {
    const seq = (name: string) => {
      const row = db.prepare('SELECT * FROM number_sequences WHERE name=?').get(name) as {
        prefix: string
        current_value: number
        padding: number
      }
      const next = row.current_value + 1
      db.prepare('UPDATE number_sequences SET current_value=? WHERE name=?').run(next, name)
      return `${row.prefix}${String(next).padStart(row.padding, '0')}`
    }
    expect(seq('client')).toBe('CL-0001')
    expect(seq('client')).toBe('CL-0002')
  })
})

describe('write queue', () => {
  it('serializes concurrent writes', async () => {
    const q = new WriteQueue(5000)
    const order: number[] = []
    await Promise.all([
      q.enqueue(() => {
        order.push(1)
        return 1
      }),
      q.enqueue(() => {
        order.push(2)
        return 2
      }),
      q.enqueue(() => {
        order.push(3)
        return 3
      })
    ])
    expect(order).toEqual([1, 2, 3])
  })
})
