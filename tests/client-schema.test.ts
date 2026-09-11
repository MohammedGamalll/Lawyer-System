import { describe, expect, it } from 'vitest'
import { clientSchema, phoneSchema } from '../shared/schemas'
import { defaultWidthCh } from '../src/lib/fieldWidth'

describe('clientSchema', () => {
  it('rejects a short national id', () => {
    const r = clientSchema.safeParse({
      full_name: 'أحمد علي',
      national_id: '123456789',
      id_kind: 'national_id'
    })
    expect(r.success).toBe(false)
  })

  it('accepts a 14-digit national id', () => {
    const r = clientSchema.safeParse({
      full_name: 'أحمد علي',
      national_id: '29001011234567',
      id_kind: 'national_id'
    })
    expect(r.success).toBe(true)
  })

  it('accepts arabic-indic 14-digit national id', () => {
    const r = clientSchema.safeParse({
      full_name: 'أحمد علي',
      national_id: '٢٩٠٠١٠١١٢٣٤٥٦٧',
      id_kind: 'national_id'
    })
    expect(r.success).toBe(true)
  })

  it('rejects a passport with arabic letters', () => {
    const r = clientSchema.safeParse({
      full_name: 'John Smith',
      national_id: 'أ1234',
      id_kind: 'passport'
    })
    expect(r.success).toBe(false)
  })

  it('allows a passport number that is not 14 digits', () => {
    const r = clientSchema.safeParse({
      full_name: 'John Smith',
      national_id: 'A1234567',
      id_kind: 'passport',
      passport_country: 'UK'
    })
    expect(r.success).toBe(true)
  })

  it('accepts home and work phones plus a second address', () => {
    const r = clientSchema.safeParse({
      full_name: 'سارة محمد',
      whatsapp: '01001234567',
      phone: '01234567890',
      phone_home: '0223456789',
      phone_work: '+201001234567',
      address: 'القاهرة',
      address2: 'الجيزة'
    })
    expect(r.success).toBe(true)
  })
})

describe('phoneSchema', () => {
  it('accepts an international number up to 16 digits', () => {
    expect(phoneSchema.safeParse('+201001234567').success).toBe(true)
    expect(phoneSchema.safeParse('1234567890123456').success).toBe(true)
  })
})

describe('defaultWidthCh', () => {
  it('keeps dates and numbers compact and phones near 16ch', () => {
    expect(defaultWidthCh({ type: 'date' })).toBe(14)
    expect(defaultWidthCh({ type: 'number' })).toBe(12)
    expect(defaultWidthCh({ name: 'phone' })).toBe(16)
    expect(defaultWidthCh({ name: 'full_name' })).toBe(28)
    expect(defaultWidthCh({ lookup: 'clients' })).toBe(22)
  })
})
