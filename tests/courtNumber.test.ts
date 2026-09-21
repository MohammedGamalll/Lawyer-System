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

  it('isolates a pair with RLM', () => {
    expect(rtlIsolatedPair('4523', '2025')).toBe('\u200F4523 / 2025\u200F')
  })
})
