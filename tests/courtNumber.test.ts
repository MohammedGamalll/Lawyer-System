import { describe, expect, it } from 'vitest'
import { courtParts, formatCourtNumber, formatProgramCode, degreeNumberLines, padProgramDigits } from '../src/lib/courtNumber'
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

  it('stacks first, appeal, and cassation numbers when present', () => {
    const lines = degreeNumberLines({
      first_instance_number: '627',
      first_instance_year: '1994',
      appeal_number: '80',
      appeal_year: '1995',
      cassation_number: '12',
      cassation_year: '1996'
    })
    expect(lines.map((l) => l.key)).toEqual(['degree_first', 'degree_appeal', 'degree_cassation'])
    expect(lines[0].value).toContain('627')
    expect(lines[1].value).toContain('80')
    expect(lines[2].value).toContain('12')
  })

  it('falls back to appeal then cassation when first instance is empty', () => {
    expect(
      formatCourtNumber({
        appeal_number: '80',
        appeal_year: '1995',
        cassation_number: '12',
        cassation_year: '1996'
      })
    ).toBe('\u200F80 / 1995\u200F')
    expect(
      formatCourtNumber({
        cassation_number: '12',
        cassation_year: '1996'
      })
    ).toBe('\u200F12 / 1996\u200F')
  })

  it('pads program codes to 5 digits without rewriting CS- storage', () => {
    expect(formatProgramCode({ case_number: '2' })).toBe('00002')
    expect(formatProgramCode({ case_number: '0001' })).toBe('00001')
    expect(formatProgramCode({ case_number: 'CS-2' })).toBe('00002')
    expect(formatProgramCode({ case_number: 'CS-02334' })).toBe('02334')
    expect(padProgramDigits('10')).toBe('00010')
  })
})
