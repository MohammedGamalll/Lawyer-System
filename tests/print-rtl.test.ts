import { describe, expect, it } from 'vitest'
import { buildPrintHtml } from '../electron/main/services/printHtml'

describe('print RTL / Arabic shaping template', () => {
  it('emits RTL html with IBM Plex Sans Arabic and Arabic text for invoices', () => {
    const html = buildPrintHtml({
      title: 'فاتورة',
      body: '<p>استلمنا من: <b>أحمد علي</b> مبلغاً وقدره <b>١٬٠٠٠</b></p><table><tr><th>البيان</th><td>أتعاب محاماة</td></tr></table>',
      kind: 'invoice',
      office: 'مكتب المحاماة',
      fontFace: "@font-face { font-family: 'IBM Plex Sans Arabic'; src: url(data:font/woff2;base64,AA==) format('woff2'); }",
      printedAt: '2026-08-13 22:00'
    })
    expect(html).toContain('lang="ar"')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain("font-family: 'IBM Plex Sans Arabic'")
    expect(html).toContain('direction: rtl')
    expect(html).toContain('padding:')
    expect(html).toContain('@page')
    expect(html).toContain('text-align: right')
    expect(html).toContain('أحمد علي')
    expect(html).toContain('@font-face')
  })

  it('uses thermal width for receipts and vouchers', () => {
    const receipt = buildPrintHtml({
      title: 'إيصال قبض',
      body: '<p class="total">المبلغ: 250</p>',
      kind: 'receipt',
      office: 'مكتب'
    })
    const voucher = buildPrintHtml({
      title: 'سند صرف',
      body: '<p class="total">المبلغ: 80</p>',
      kind: 'voucher',
      office: 'مكتب'
    })
    expect(receipt).toContain('72mm')
    expect(voucher).toContain('72mm')
    expect(receipt).toContain('إيصال قبض')
    expect(voucher).toContain('سند صرف')
    expect(receipt).not.toContain('A4 landscape')
  })

  it('uses A4 portrait by default and A4 landscape when requested', () => {
    const portrait = buildPrintHtml({
      title: 'شيت',
      body: '<p>جلسات</p>',
      kind: 'report',
      office: 'مكتب',
      landscape: false
    })
    const landscape = buildPrintHtml({
      title: 'شيت',
      body: '<p>جلسات</p>',
      kind: 'report',
      office: 'مكتب',
      landscape: true
    })
    expect(portrait).toContain('size: A4 portrait')
    expect(landscape).toContain('size: A4 landscape')
  })
})
