import { escapeHtml } from '@shared/printTemplate'

export type PrintKind = 'invoice' | 'receipt' | 'voucher' | 'report' | 'a4'

export function stripPrintCodes(html: string): string {
  return String(html || '').replace(/data:[^"'>\s]+|\b(?:CS|CL)-/gi, (chunk) =>
    chunk.startsWith('data:') ? chunk : ''
  )
}

export function buildPrintHtml(opts: {
  title: string
  body: string
  kind: PrintKind
  office: string
  phone?: string
  address?: string
  fontFace?: string
  logo?: string
  printedAt?: string
  recipientLine?: string
}): string {
  const isTicket = opts.kind === 'receipt' || opts.kind === 'voucher'
  const isReport = opts.kind === 'report'
  const isA4 = opts.kind === 'a4'
  const width = isTicket ? '72mm' : '190mm'
  const fontSize = isTicket ? '13px' : isA4 ? '15px' : '11px'
  const tableFont = isTicket ? 'inherit' : isA4 ? '13px' : '9.5px'
  const thFont = isTicket ? 'inherit' : isA4 ? '14px' : '10.5px'
  const pageMargin = isTicket ? '5mm 6mm' : isA4 ? '12mm 12mm' : '10mm 10mm'
  const bodyPad = isTicket ? '6mm 7mm' : isA4 ? '12px 10px' : '8px 8px'
  const leftBox = isReport
    ? `<div class="print-date"><div class="recipient">${escapeHtml(opts.recipientLine || '')}</div><div>${escapeHtml(opts.printedAt || '')}</div></div>`
    : `<div class="print-date">${escapeHtml(opts.printedAt || '')}</div>`
  return stripPrintCodes(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';"/>
<style>
  ${opts.fontFace || ''}
  * { box-sizing: border-box; }
  @page { size: ${isTicket ? '72mm auto' : 'A4 portrait'}; margin: ${pageMargin}; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans Arabic', Tahoma, sans-serif; direction: rtl; text-align: right; width: ${width}; max-width: 100%; padding: ${bodyPad}; color: #122f4d; font-size: ${fontSize}; unicode-bidi: isolate; }
  h1 { font-size: ${isA4 ? '18px' : isReport ? '14px' : '16px'}; margin: 0 0 2px; }
  h2 { font-size: ${isA4 ? '16px' : '13px'}; margin: 10px 0 4px; font-weight: 800; }
  h3.print-sub, .print-sub { font-size: ${isA4 ? '14px' : '12px'}; margin: 0 0 6px; color: #122f4d; font-weight: 800; }
  .muted { color: #5b6b7c; font-size: ${isA4 ? '12px' : '10px'}; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  table.compact { table-layout: fixed; }
  th, td { border: 1px solid #cfd8e3; padding: ${isA4 ? '6px 7px' : '3px 4px'}; text-align: right; vertical-align: top; overflow-wrap: anywhere; word-break: normal; white-space: normal; line-height: 1.35; }
  td { font-size: ${tableFont}; font-weight: 400; }
  th { background: #122f4d; color: #fff; font-weight: 800; font-size: ${thFont}; }
  thead th { font-weight: 800; }
  .head { position: relative; min-height: ${isA4 ? '96px' : '56px'}; border-bottom: 3px solid #c9a227; padding: 2px 0 8px; margin-bottom: 8px; }
  .print-date { position: absolute; top: 0; left: 0; color: #5b6b7c; font-size: 10px; text-align: left; line-height: 1.35; }
  .print-date .recipient { color: #122f4d; font-weight: 800; font-size: 11px; }
  .head-logo { position: absolute; top: 0; left: 50%; transform: translateX(-50%); }
  .head img.logo, .logo { height: ${isA4 ? '96px' : '52px'}; width: auto; max-width: ${isA4 ? '96px' : '52px'}; object-fit: contain; display: block; margin: 0; border-radius: 50%; }
  .head-office { text-align: right; padding-left: 110px; }
  .gold { color: #c9a227; font-weight: 800; margin-top: 2px; }
  .total { font-weight: 800; font-size: 16px; margin-top: 12px; }
  .kv { margin: 0 0 5px; line-height: 1.45; }
  .block-title { font-weight: 800; border-bottom: 1px solid #c9a227; margin: 10px 0 6px; padding-bottom: 2px; font-size: ${isA4 ? '16px' : '13px'}; }
  .program-code { font-size: ${isA4 ? '26px' : '18px'}; font-weight: 800; text-align: center; color: #b91c1c; margin: 0 0 10px; letter-spacing: 0.03em; }
  .print-card-block {
    border-bottom: 2px dashed #bbb;
    margin-bottom: 20px;
    padding-bottom: 15px;
    page-break-inside: avoid;
    break-inside: avoid;
    font-size: ${isA4 ? '14px' : '12px'};
    line-height: 1.45;
  }
  .print-card-block .pc-row {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: flex-start;
    margin: 0 0 8px;
    width: 100%;
  }
  .print-card-block .pc-row-parties { gap: 40px; }
  .print-card-block .pc-row-action { gap: 20px; }
  .print-card-block .pc-pair { flex: 0 1 auto; max-width: 100%; }
  .print-card-block .pc-pair strong, .print-card-block .pc-pair b { font-weight: 800; margin-inline-end: 4px; }
  .print-card-block .pc-notes { margin-top: 8px; }
  .print-card-block .pc-dots { letter-spacing: 1px; color: #5b6b7c; }
  .pc-empty { color: #5b6b7c; padding: 8px 0; }
</style>
</head>
<body>
  <div class="head">
    ${leftBox}
    <div class="head-logo">${opts.logo || ''}</div>
    <div class="head-office">
      <h1>${escapeHtml(opts.office)}</h1>
      <div class="muted">${escapeHtml(opts.address || '')}${opts.address && opts.phone ? ' — ' : ''}${escapeHtml(opts.phone || '')}</div>
      <div class="gold">${escapeHtml(opts.title)}</div>
    </div>
  </div>
  ${opts.body}
</body>
</html>`)
}
