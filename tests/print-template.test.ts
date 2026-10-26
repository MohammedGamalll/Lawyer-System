import { describe, expect, it } from 'vitest'
import { renderLayoutHtml, sanitizeLayout } from '../shared/printTemplate'

describe('print template blocks', () => {
  it('keeps bold and color through sanitizeLayout', () => {
    const layout = sanitizeLayout({
      page: 'A4',
      blocks: [
        {
          id: 't1',
          kind: 'field',
          x: 10,
          y: 10,
          w: 40,
          h: 12,
          bind: 'case.title',
          title: 'الموضوع',
          fontSize: 14,
          align: 'right',
          bold: true,
          color: 'gold'
        }
      ]
    })
    expect(layout.blocks[0].bold).toBe(true)
    expect(layout.blocks[0].color).toBe('gold')
    const html = renderLayoutHtml(layout, { 'case.title': 'مطالبة' })
    expect(html).toContain('font-weight:800')
    expect(html).toContain('color:#c9a227')
  })

  it('floors the program code at 18pt bold', () => {
    const layout = sanitizeLayout({
      page: 'A4',
      blocks: [
        {
          id: 'cn',
          kind: 'field',
          x: 10,
          y: 10,
          w: 40,
          h: 12,
          bind: 'case.case_number',
          title: 'كود',
          fontSize: 12,
          align: 'right'
        }
      ]
    })
    const html = renderLayoutHtml(layout, { 'case.case_number': '00512' })
    expect(html).toContain('font-size:18pt')
    expect(html).toContain('font-weight:800')
    expect(html).toContain('program-code-field')
  })
})
