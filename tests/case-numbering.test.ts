import { describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '../electron/main/db/schema'
import { allocateCaseNumber, programCodeKey } from '../electron/main/services/cases'
import { hydrateCaseForm } from '../src/lib/caseForm'

describe('programCodeKey', () => {
  it('treats CS-padded numbers as the same program code', () => {
    expect(programCodeKey('CS-00245')).toBe('245')
    expect(programCodeKey('245')).toBe('245')
    expect(programCodeKey('CS-245')).toBe('245')
    expect(programCodeKey('ARC-12')).toBe('arc-12')
  })
})

describe('hydrateCaseForm numbering', () => {
  it('does not copy program code into the court number field', () => {
    const next = hydrateCaseForm({ case_number: '245' }, { caseClients: [], opponents: [] })
    expect(next.office_case_number).toBeUndefined()
    expect(next.numbering_mode).toBe('manual')
    const auto = hydrateCaseForm({ case_number: 'CS-00010', office_case_number: '6720' }, { caseClients: [], opponents: [] })
    expect(auto.office_case_number).toBe('6720')
    expect(auto.numbering_mode).toBe('auto')
  })
})


describe('programCodeKey', () => {
  it('treats CS-padded numbers as the same program code', () => {
    expect(programCodeKey('CS-00245')).toBe('245')
    expect(programCodeKey('245')).toBe('245')
    expect(programCodeKey('CS-245')).toBe('245')
    expect(programCodeKey('ARC-12')).toBe('arc-12')
  })
})


function sqliteAvailable() {
  try {
    const probe = new Database(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
}

function seed() {
  const db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  const ts = new Date().toISOString()
  db.prepare('INSERT INTO number_sequences (name, prefix, current_value, padding, updated_at) VALUES (?,?,0,5,?)').run(
    'case',
    'CS-',
    ts
  )
  db.prepare(
    `INSERT INTO clients (id, client_number, full_name, client_type, created_at, updated_at)
     VALUES (?, ?, ?, 'individual', ?, ?)`
  ).run('cl1', 'CL-0001', 'موكل', ts, ts)
  return db
}

function insertCase(db: Database.Database, id: string, caseNumber: string, office?: string, year?: string) {
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO cases (id, case_number, office_case_number, case_year, title, client_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'قضية', 'cl1', 'open', ?, ?)`
  ).run(id, caseNumber, office ?? null, year ?? null, ts, ts)
}

describe.skipIf(!sqliteAvailable())('allocateCaseNumber', () => {
  it('auto-generates the CS sequence and does not copy it to the court number', () => {
    const db = seed()
    const allocated = allocateCaseNumber(db, { numbering_mode: 'auto', office_case_number: '6720', case_year: '2026' })
    expect(allocated.number).toMatch(/^CS-/)
    expect(allocated.office).toBe('6720')
    expect(allocated.year).toBe('2026')
    expect(allocated.number).not.toBe('6720')
    db.close()
  })

  it('stores the typed program code in manual mode', () => {
    const db = seed()
    const allocated = allocateCaseNumber(db, {
      numbering_mode: 'manual',
      case_number: '245',
      office_case_number: '9001',
      case_year: '2024'
    })
    expect(allocated.number).toBe('245')
    expect(allocated.office).toBe('9001')
    expect(allocated.number).not.toMatch(/^[0-9a-f-]{36}$/i)
    db.close()
  })

  it('rejects a duplicate program code including CS- prefix variants', () => {
    const db = seed()
    insertCase(db, randomUUID(), 'CS-00245')
    expect(() =>
      allocateCaseNumber(db, { numbering_mode: 'manual', case_number: '245' })
    ).toThrow('هذا الكود مستخدم من قبل، يرجى إدخال كود غير مكرر')
    expect(() =>
      allocateCaseNumber(db, { numbering_mode: 'manual', case_number: 'CS-00245' })
    ).toThrow('هذا الكود مستخدم من قبل، يرجى إدخال كود غير مكرر')
    db.close()
  })

  it('keeps the existing code on auto update and allows a unique manual change', () => {
    const db = seed()
    const id = randomUUID()
    insertCase(db, id, 'CS-00010')
    const kept = allocateCaseNumber(db, { numbering_mode: 'auto', case_number: '999' }, id)
    expect(kept.number).toBe('CS-00010')
    const changed = allocateCaseNumber(db, { numbering_mode: 'manual', case_number: 'ARC-12' }, id)
    expect(changed.number).toBe('ARC-12')
    db.close()
  })

  it('bumps the CS counter when a matching manual code is higher', () => {
    const db = seed()
    allocateCaseNumber(db, { numbering_mode: 'manual', case_number: 'CS-50' })
    const next = allocateCaseNumber(db, { numbering_mode: 'auto' })
    expect(next.number).toBe('CS-00051')
    db.close()
  })
})
