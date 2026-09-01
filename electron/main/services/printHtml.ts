export type PrintKind = 'invoice' | 'receipt' | 'voucher' | 'report' | 'a4'

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
}): string {
  const isTicket = opts.kind === 'receipt' || opts.kind === 'voucher'
  const isReport = opts.kind === 'report'
  const width = isTicket ? '72mm' : isReport ? 'auto' : '190mm'
  const fontSize = isTicket ? '13px' : isReport ? '11px' : '14px'
  const pageMargin = isTicket ? '5mm 6mm' : isReport ? '14mm 16mm' : '16mm 18mm'
  const bodyPad = isTicket ? '6mm 7mm' : isReport ? '22px 28px' : '20px 24px'
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${opts.title}</title>
<style>
  ${opts.fontFace || ''}
  * { box-sizing: border-box; }
  @page { size: ${isReport ? 'A4 landscape' : 'A4'}; margin: ${pageMargin}; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Cairo, Tahoma, sans-serif; direction: rtl; text-align: right; width: ${width}; max-width: 100%; padding: ${bodyPad}; color: #122f4d; font-size: ${fontSize}; unicode-bidi: isolate; }
  h1 { font-size: ${isReport ? '16px' : '20px'}; margin: 0 0 4px; }
  .muted { color: #5b6b7c; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
  th, td { border: 1px solid #cfd8e3; padding: ${isReport ? '4px 5px' : '6px 8px'}; text-align: right; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; font-size: ${isReport ? '10px' : 'inherit'}; }
  th { background: #122f4d; color: #fff; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom: 3px solid #c9a227; padding-bottom: 8px; margin-bottom: 12px; }
  .head img.logo, .logo { height: ${isReport ? '64px' : '96px'}; width: auto; max-width: 180px; object-fit: contain; display: block; margin-bottom: 6px; }
  .gold { color: #c9a227; font-weight: 700; }
  .total { font-weight: 700; font-size: 16px; margin-top: 12px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      ${opts.logo || ''}
      <h1>${opts.office}</h1>
      <div class="muted">${opts.address || ''} ${opts.phone || ''}</div>
    </div>
    <div class="gold">${opts.title}</div>
  </div>
  ${opts.body}
  <p class="muted">طُبع بتاريخ ${opts.printedAt || ''}</p>
</body>
</html>`
}
