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
  layout?: string
  landscape?: boolean
}): string {
  const isTicket = opts.kind === 'receipt' || opts.kind === 'voucher'
  const isReport = opts.kind === 'report'
  const isA4 = opts.kind === 'a4'
  const hearingsRoll = opts.layout === 'hearingsRoll'
  const landscape = Boolean(opts.landscape) && !isTicket
  const width = isTicket ? '72mm' : landscape ? '277mm' : '190mm'
  const fontSize = isTicket ? '13px' : isA4 ? '15px' : '11px'
  const tableFont = isTicket ? 'inherit' : isA4 ? '13px' : '9.5px'
  const thFont = isTicket ? 'inherit' : isA4 ? '14px' : '10.5px'
  const pageMargin = isTicket ? '5mm 6mm' : isA4 ? '12mm 12mm' : hearingsRoll ? '8mm 8mm' : '10mm 10mm'
  const bodyPad = isTicket ? '6mm 7mm' : isA4 ? '12px 10px' : hearingsRoll ? '6px 4px' : '8px 8px'
  const phones = escapeHtml(opts.phone || '')
  const address = escapeHtml(opts.address || '')
  const leftBox = `<div class="print-date">${
    isReport && !hearingsRoll && opts.recipientLine
      ? `<div class="recipient">${escapeHtml(opts.recipientLine)}</div>`
      : ''
  }<div>${escapeHtml(opts.printedAt || '')}</div></div>`
  const officeMeta = `<div class="muted">${phones}</div>${
    address ? `<div class="muted">${address}</div>` : ''
  }<div class="gold">${escapeHtml(opts.title)}</div>`
  return stripPrintCodes(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';"/>
<style>
  ${opts.fontFace || ''}
  * { box-sizing: border-box; }
  @page { size: ${isTicket ? '72mm auto' : landscape ? 'A4 landscape' : 'A4 portrait'}; margin: ${pageMargin}; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans Arabic', Tahoma, sans-serif; direction: rtl; text-align: right; width: ${width}; max-width: 100%; padding: ${bodyPad}; color: #122f4d; font-size: ${fontSize}; unicode-bidi: isolate; }
  [dir="ltr"] { unicode-bidi: isolate; direction: ltr; }
  h1 { font-size: ${isA4 ? '18px' : isReport ? '14px' : '16px'}; margin: 0 0 2px; }
  h2 { font-size: ${isA4 ? '16px' : '13px'}; margin: 10px 0 4px; font-weight: 800; }
  h3.print-sub, .print-sub, h3.hr-group { font-size: ${isA4 ? '14px' : '12px'}; margin: 0 0 6px; color: #122f4d; font-weight: 800; }
  .muted { color: #5b6b7c; font-size: ${isA4 ? '12px' : '10px'}; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  table.compact { table-layout: fixed; }
  th, td { border: 1px solid #cfd8e3; padding: ${isA4 ? '6px 7px' : '3px 4px'}; text-align: right; vertical-align: top; overflow-wrap: anywhere; word-break: normal; white-space: normal; line-height: 1.35; }
  td { font-size: ${tableFont}; font-weight: 400; }
  th { background: #122f4d; color: #fff; font-weight: 800; font-size: ${thFont}; }
  thead th { font-weight: 800; }
  .head { position: relative; display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; gap: 12px; min-height: ${isA4 ? '96px' : '56px'}; border-bottom: 3px solid #c9a227; padding: 2px 0 8px; margin-bottom: 8px; }
  .print-date { color: #5b6b7c; font-size: 10px; text-align: left; line-height: 1.35; flex: 1 1 0; min-width: 0; padding-inline-end: ${isA4 ? '84px' : '56px'}; }
  .print-date .recipient { color: #122f4d; font-weight: 800; font-size: 11px; }
  .head-logo { position: absolute; left: 50%; top: 2px; transform: translateX(-50%); z-index: 2; }
  .head img.logo, .logo { height: ${isA4 ? '72px' : '48px'}; width: auto; max-width: ${isA4 ? '72px' : '48px'}; object-fit: contain; display: block; margin: 0; border-radius: 50%; }
  .head-office { text-align: right; padding-inline-end: ${isA4 ? '84px' : '56px'}; flex: 1 1 0; min-width: 0; }
  .gold { color: #c9a227; font-weight: 800; margin-top: 2px; }
  .court-number { unicode-bidi: isolate; }
  .total { font-weight: 800; font-size: 16px; margin-top: 12px; }
  .kv { margin: 0 0 5px; line-height: 1.45; }
  .block-title { font-weight: 800; border-bottom: 1px solid #c9a227; margin: 10px 0 6px; padding-bottom: 2px; font-size: ${isA4 ? '16px' : '13px'}; }
  .program-code { font-size: ${isA4 ? '26px' : '18px'}; font-weight: 800; text-align: center; color: #122f4d; margin: 0 0 10px; letter-spacing: 0.03em; }
  .program-code.manual, .program-code-manual { color: #b91c1c; }
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
  body.hearings-roll-page .head.hr-head {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    min-height: 44px;
    border-bottom: none;
    position: relative;
    margin-bottom: 4px;
    padding-bottom: 4px;
  }
  body.hearings-roll-page .head.hr-head .head-office {
    padding-inline-end: 56px;
    flex: 1 1 0;
    min-width: 0;
    text-align: right;
  }
  body.hearings-roll-page .head.hr-head .head-logo {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
  }
  body.hearings-roll-page .head.hr-head img.logo {
    height: 42px;
    max-width: 42px;
    border-radius: 50%;
  }
  body.hearings-roll-page .head.hr-head .print-date {
    position: static;
    flex: 0 0 auto;
    min-width: 0;
    color: #5b6b7c;
    font-size: 10px;
    font-weight: 400;
    text-align: left;
  }
  .hr-lawyer { font-weight: 700; margin-bottom: 10px; }
  table.hearings-roll {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    direction: rtl;
    margin-top: 2px;
  }
  table.hearings-roll th,
  table.hearings-roll td {
    border: 1px solid #999;
    padding: 6px 8px;
    text-align: right;
    vertical-align: top;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    background: #fff;
    color: #122f4d;
    font-weight: 400;
    font-size: 9.5px;
    line-height: 1.35;
  }
  table.hearings-roll tbody td { vertical-align: top; }
  table.hearings-roll th {
    background-color: #f5f5f5;
    color: #122f4d;
    font-weight: 800;
    font-size: 10px;
  }
  table.hearings-roll tr.group-header td {
    background-color: #f0f0f0;
    text-align: right;
    font-weight: 800;
    padding: 8px;
  }
  table.hearings-roll tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table.hearings-roll .hr-line { display: block; line-height: 1.35; padding: 2px 0; }
  table.hearings-roll .hr-dots { letter-spacing: 1px; color: #888; }
</style>
</head>
<body class="${hearingsRoll ? 'hearings-roll-page' : ''}">
  <div class="head${hearingsRoll ? ' hr-head' : ''}">
    <div class="head-office">
      <h1>${escapeHtml(opts.office)}</h1>
      ${officeMeta}
    </div>
    <div class="head-logo">${opts.logo || ''}</div>
    ${leftBox}
  </div>
  ${opts.body}
</body>
</html>`)
}
