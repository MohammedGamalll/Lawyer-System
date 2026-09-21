import { describe, expect, it } from 'vitest'
import { cairoAddDays, cairoDateTimeStamp, cairoTodayIso } from '../shared/cairoDate'

describe('cairo dates', () => {
  it('formats YYYY-MM-DD in Africa/Cairo', () => {
    const iso = cairoTodayIso(new Date('2026-09-20T22:30:00Z'))
    expect(iso).toBe('2026-09-21')
  })

  it('adds calendar days without UTC slice jumps', () => {
    expect(cairoAddDays('2026-09-20', 1)).toBe('2026-09-21')
    expect(cairoAddDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('stamps Cairo date and time', () => {
    const stamp = cairoDateTimeStamp(new Date('2026-09-20T22:30:00Z'))
    expect(stamp.startsWith('2026-09-21 ')).toBe(true)
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
