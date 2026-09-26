import { describe, expect, it } from 'vitest'
import { parseUniqueKey, uniqueKeyOf, fkFieldToTable } from '../electron/main/sync/uniqueKey'

describe('unique key parser', () => {
  it('reads a single Postgres Key pair', () => {
    expect(parseUniqueKey('duplicate key value violates unique constraint "case_types_name_ar_key" Key (name_ar)=(جنائي)')).toEqual({
      columns: ['name_ar'],
      values: ['جنائي']
    })
  })

  it('reads a composite Key pair', () => {
    expect(parseUniqueKey('Key (kind, value)=(court, شمال)')).toEqual({
      columns: ['kind', 'value'],
      values: ['court', 'شمال']
    })
  })

  it('falls back to the expanded natural key for case types', () => {
    expect(uniqueKeyOf('case_types', { name_ar: 'مدني' })).toEqual({
      columns: ['name_ar'],
      values: ['مدني']
    })
    expect(uniqueKeyOf('cashboxes', { name: 'خزينة المكتب' })).toEqual({
      columns: ['name'],
      values: ['خزينة المكتب']
    })
  })

  it('maps fk fields to parent tables', () => {
    expect(fkFieldToTable('role_id')).toBe('roles')
    expect(fkFieldToTable('case_type_id')).toBe('case_types')
  })
})
