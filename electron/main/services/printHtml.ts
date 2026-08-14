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
  const width = opts.kind === 'receipt' || opts.kind === 'voucher' ? '72mm' : '190mm'
  const fontSize = opts.kind === 'receipt' || opts.kind === 'voucher' ? '13px' : '14px'
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${opts.title}</title>
<style>
  ${opts.fontFace || ''}
  * { box-sizing: border-box; }
  body { font-family: Cairo, Tahoma, sans-serif; direction: rtl; text-align: right; width: ${width}; margin: 12px auto; color: #122f4d; font-size: ${fontSize}; unicode-bidi: isolate; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #5b6b7c; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #cfd8e3; padding: 6px 8px; text-align: right; }
  th { background: #122f4d; color: #fff; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom: 3px solid #c9a227; padding-bottom: 8px; margin-bottom: 12px; }
  .head img.logo, .logo { height: 96px; width: auto; max-width: 220px; object-fit: contain; display: block; margin-bottom: 6px; }
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
