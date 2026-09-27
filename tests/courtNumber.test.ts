import { describe, expect, it } from 'vitest'
import { courtParts, formatCourtNumber } from '../src/lib/courtNumber'
import { formattedCourtNumber } from '../shared/printLabels'
import { rtlIsolatedPair } from '../shared/rtlBidi'

describe('court number order', () => {
  it('keeps number then year with RLM marks', () => {
    expect(formatCourtNumber({ office_case_number: '4523', case_year: '2025' })).toBe(
      '\u200F4523 / 2025\u200F'
    )
  })

  it('swaps if year was stored in the number field', () => {
    expect(formatCourtNumber({ office_case_number: '2025', case_year: '4523' })).toBe(
      '\u200F4523 / 2025\u200F'
    )
  })

  it('print label keeps number then year', () => {
    expect(formattedCourtNumber({ office_case_number: '4523', case_year: '2025' })).toBe(
      '\u200F4523 / 2025\u200F'
    )
  })

  it('splits a combined court string', () => {
    expect(courtParts({ office_case_number: '2025 / 4523' })).toEqual({ office: '4523', year: '2025' })
  })

  it('uses first-instance number and year only on a case row', () => {
    expect(
      formatCourtNumber({
        id: 'c1',
        case_number: '0001',
        office_case_number: '1',
        case_year: '2026',
        first_instance_number: '627',
        first_instance_year: '1994'
      })
    ).toBe('\u200F627 / 1994\u200F')
    expect(
      formatCourtNumber({
        id: 'c2',
        case_number: '2',
        office_case_number: '2',
        case_year: '2026'
      })
    ).toBe('\u200F2 / 2026\u200F')
    expect(
      formatCourtNumber({
        first_instance_number: '6464',
        first_instance_year: '1993',
        case_year: '2026'
      })
    ).toBe('\u200F6464 / 1993\u200F')
  })

  it('still formats a parsed court pair without first-instance fields', () => {
    expect(
      formattedCourtNumber({
        first_instance_number: '627',
        case_year: '1994'
      })
    ).toBe('\u200F627 / 1994\u200F')
  })

  it('isolates a pair with RLM', () => {
    expect(rtlIsolatedPair('4523', '2025')).toBe('\u200F4523 / 2025\u200F')
  })
})
