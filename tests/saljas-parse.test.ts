import { describe, expect, it } from 'vitest'
import { parseCsv, parseHexRecno } from '../scripts/saljas-csv'

describe('saljas csv helpers', () => {
  it('maps hex pointer 3F6 to recno 1014', () => {
    expect(parseHexRecno('99     3F6')).toBe(1014)
    expect(parseHexRecno('1      7DF')).toBe(0x7df)
    expect(parseHexRecno('')).toBeNull()
  })

  it('parses utf-8 csv rows without dropping fields', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ a: '1', b: '2' })
  })
})
