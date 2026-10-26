import { describe, expect, it } from 'vitest'
import { mergePrintRows, uniqueVenues, venueSheetLabel } from '../src/lib/venuePrint'
import { hearingRollTableHtml } from '../src/lib/printKit'

describe('multi-venue print merge', () => {
  it('keeps up to three unique venues and labels them together', () => {
    expect(uniqueVenues(['الجيزة', ' الدقي ', 'الجيزة', 'إمبابة', 'بنها'])).toEqual([
      'الجيزة',
      'الدقي',
      'إمبابة'
    ])
    expect(venueSheetLabel(['الجيزة', 'الدقي'], '2026-10-01 — 2026-10-02')).toBe(
      'الجيزة — الدقي (2026-10-01 — 2026-10-02)'
    )
  })

  it('drops duplicate hearing ids when merging two venues', () => {
    const merged = mergePrintRows([
      [{ id: 'h1', venue: 'الجيزة' }, { id: 'h2', venue: 'الجيزة' }],
      [{ id: 'h1', venue: 'الدقي' }, { id: 'h3', venue: 'الدقي' }]
    ])
    expect(merged.map((r) => String(r.id))).toEqual(['h1', 'h2', 'h3'])
  })

  it('hides selected roll columns including previous decision', () => {
    const t = (k: string) => k
    const { html } = hearingRollTableHtml(
      [
        {
          hearing_date: '2026-10-05',
          court: 'جنوب الجيزة',
          client_name: 'موكل',
          opponent_name: 'خصم',
          previous_decision: 'حافظة',
          court_decision: 'تأجيل',
          system_code: '07001'
        }
      ],
      t,
      'ar',
      { hideCols: ['court', 'previous'] }
    )
    expect(html).not.toContain('printKit.courtAndCircuit')
    expect(html).not.toContain('<th>printKit.courtAndCircuit</th>')
    expect(html).not.toContain('حافظة')
    expect(html).toContain('تأجيل')
    expect(html).toContain('07001')
  })
})
