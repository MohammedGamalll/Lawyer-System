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

  it('falls back to the stage number with the case year', () => {
    expect(
      formatCourtNumber({
        office_case_number: '',
        first_instance_number: '627',
        case_year: '1994'
      })
    ).toBe('\u200F627 / 1994\u200F')
    expect(
      formatCourtNumber({
        appeal_number: '16457',
        appeal_year: '113',
        case_year: '1994'
      })
    ).toBe('\u200F16457 / 1994\u200F')
    expect(
      formatCourtNumber({
        cassation_number: '88',
        cassation_year: '2020'
      })
    ).toBe('\u200F88 / 2020\u200F')
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
