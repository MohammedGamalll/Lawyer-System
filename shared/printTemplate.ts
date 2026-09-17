export const PRINT_FIELD_KEYS = [
  'office.name',
  'office.address',
  'office.phone',
  'office.logo',
  'client.full_name',
  'client.client_number',
  'client.national_id',
  'client.phone',
  'client.address',
  'client.profession',
  'client.capacity',
  'case.case_number',
  'case.office_case_number',
  'case.case_year',
  'case.title',
  'case.court',
  'case.status',
  'case.category',
  'case.circuit',
  'case.type',
  'case.lawyer',
  'case.assistant',
  'case.filing_date',
  'case.received_date',
  'case.notes',
  'case.summary',
  'case.description',
  'case.litigation_degree',
  'case.session_place',
  'opponent.full_name',
  'opponent.lawyer',
  'hearings.list',
  'hearings.next',
  'tasks.list',
  'tasks.upcoming',
  'fees.total',
  'fees.paid',
  'fees.remaining',
  'today',
  'custom'
] as const

export type PrintFieldKey = (typeof PRINT_FIELD_KEYS)[number]

export const PRINT_FIELD_GROUPS: { id: string; keys: PrintFieldKey[] }[] = [
  { id: 'office', keys: ['office.name', 'office.address', 'office.phone', 'office.logo'] },
  {
    id: 'client',
    keys: [
      'client.full_name',
      'client.client_number',
      'client.national_id',
      'client.phone',
      'client.address',
      'client.profession',
      'client.capacity'
    ]
  },
  {
    id: 'case',
    keys: [
      'case.case_number',
      'case.office_case_number',
      'case.case_year',
      'case.title',
      'case.court',
      'case.status',
      'case.category',
      'case.circuit',
      'case.type',
      'case.lawyer',
      'case.assistant',
      'case.filing_date',
      'case.received_date',
      'case.notes',
      'case.summary',
      'case.description',
      'case.litigation_degree',
      'case.session_place'
    ]
  },
  { id: 'opponent', keys: ['opponent.full_name', 'opponent.lawyer'] },
  { id: 'hearings', keys: ['hearings.list', 'hearings.next'] },
  { id: 'tasks', keys: ['tasks.list', 'tasks.upcoming'] },
  { id: 'fees', keys: ['fees.total', 'fees.paid', 'fees.remaining'] },
  { id: 'meta', keys: ['today', 'custom'] }
]

export type PrintBlockKind = 'section' | 'field' | 'text' | 'logo'

export type PrintAlign = 'right' | 'center' | 'left'
export type PrintVAlign = 'top' | 'middle' | 'bottom'

export type PrintBlock = {
  id: string
  kind: PrintBlockKind
  x: number
  y: number
  w: number
  h: number
  title: string
  bind: PrintFieldKey
  text: string
  fontSize: number
  align: PrintAlign
  vAlign: PrintVAlign
}

export type PrintLayout = {
  page: 'A4'
  blocks: PrintBlock[]
}

export const PAGE_W = 210
export const PAGE_H = 297
const MAX_BLOCKS = 120
const FONT_MIN = 10
const FONT_MAX = 24
const KINDS = new Set<PrintBlockKind>(['section', 'field', 'text', 'logo'])
const ALIGNS = new Set<PrintAlign>(['right', 'center', 'left'])
const VALIGNS = new Set<PrintVAlign>(['top', 'middle', 'bottom'])
const FIELD_SET = new Set<string>(PRINT_FIELD_KEYS)

export function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizePlain(raw: unknown, max = 500): string {
  let s = String(raw ?? '')
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  s = s.replace(/javascript:/gi, '')
  s = s.replace(/on\w+\s*=/gi, '')
  s = s.replace(/<\/?script/gi, '')
  s = s.replace(/<\/?iframe/gi, '')
  s = s.replace(/<\/?object/gi, '')
  s = s.replace(/<\/?embed/gi, '')
  return s.slice(0, max)
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

function isFieldKey(v: unknown): v is PrintFieldKey {
  return typeof v === 'string' && FIELD_SET.has(v)
}

export function sanitizeBlock(raw: unknown, index: number): PrintBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = KINDS.has(o.kind as PrintBlockKind) ? (o.kind as PrintBlockKind) : 'field'
  const align = ALIGNS.has(o.align as PrintAlign) ? (o.align as PrintAlign) : 'right'
  const vAlign = VALIGNS.has(o.vAlign as PrintVAlign) ? (o.vAlign as PrintVAlign) : 'top'
  const bind = isFieldKey(o.bind) ? o.bind : kind === 'logo' ? 'office.logo' : 'custom'
  const id = sanitizePlain(o.id || `b${index}`, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `b${index}`
  return {
    id,
    kind,
    x: clamp(o.x, 0, PAGE_W - 4, 10),
    y: clamp(o.y, 0, PAGE_H - 4, 10 + index * 12),
    w: clamp(o.w, 8, PAGE_W, 80),
    h: clamp(o.h, 6, PAGE_H, kind === 'section' ? 28 : 12),
    title: sanitizePlain(o.title, 80),
    bind: kind === 'logo' ? 'office.logo' : bind,
    text: sanitizePlain(o.text, 400),
    fontSize: clamp(o.fontSize, FONT_MIN, FONT_MAX, 12),
    align,
    vAlign
  }
}

export function sanitizeLayout(raw: unknown): PrintLayout {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(o.blocks) ? o.blocks : Array.isArray(raw) ? raw : []
  const blocks: PrintBlock[] = []
  for (let i = 0; i < list.length && blocks.length < MAX_BLOCKS; i++) {
    const b = sanitizeBlock(list[i], i)
    if (b) blocks.push(b)
  }
  return { page: 'A4', blocks }
}

export function defaultCaseLayout(): PrintLayout {
  return sanitizeLayout({
    page: 'A4',
    blocks: [
      { id: 'logo', kind: 'logo', x: 160, y: 8, w: 40, h: 22, bind: 'office.logo', title: '', text: '', fontSize: 12, align: 'left' },
      { id: 'office', kind: 'field', x: 10, y: 8, w: 140, h: 12, bind: 'office.name', title: '', text: '', fontSize: 18, align: 'right' },
      { id: 'addr', kind: 'field', x: 10, y: 20, w: 140, h: 10, bind: 'office.address', title: '', text: '', fontSize: 10, align: 'right' },
      { id: 'sec1', kind: 'section', x: 10, y: 40, w: 190, h: 70, bind: 'custom', title: 'بيانات القضية', text: '', fontSize: 12, align: 'right' },
      { id: 'cn', kind: 'field', x: 14, y: 52, w: 90, h: 10, bind: 'case.case_number', title: 'كود البرنامج', text: '', fontSize: 12, align: 'right' },
      { id: 'on', kind: 'field', x: 108, y: 52, w: 88, h: 10, bind: 'case.office_case_number', title: 'رقم المكتب', text: '', fontSize: 12, align: 'right' },
      { id: 'title', kind: 'field', x: 14, y: 64, w: 182, h: 12, bind: 'case.title', title: 'الموضوع', text: '', fontSize: 12, align: 'right' },
      { id: 'court', kind: 'field', x: 14, y: 78, w: 90, h: 10, bind: 'case.court', title: 'المحكمة', text: '', fontSize: 12, align: 'right' },
      { id: 'year', kind: 'field', x: 108, y: 78, w: 88, h: 10, bind: 'case.case_year', title: 'السنة', text: '', fontSize: 12, align: 'right' },
      { id: 'sec2', kind: 'section', x: 10, y: 118, w: 190, h: 50, bind: 'custom', title: 'الأطراف', text: '', fontSize: 12, align: 'right' },
      { id: 'cl', kind: 'field', x: 14, y: 132, w: 182, h: 12, bind: 'client.full_name', title: 'الموكل', text: '', fontSize: 12, align: 'right' },
      { id: 'op', kind: 'field', x: 14, y: 146, w: 182, h: 12, bind: 'opponent.full_name', title: 'الخصم', text: '', fontSize: 12, align: 'right' },
      { id: 'sec3', kind: 'section', x: 10, y: 176, w: 190, h: 44, bind: 'custom', title: 'الجلسات', text: '', fontSize: 12, align: 'right' },
      { id: 'hx', kind: 'field', x: 14, y: 188, w: 182, h: 28, bind: 'hearings.list', title: '', text: '', fontSize: 10, align: 'right' },
      { id: 'sec4', kind: 'section', x: 10, y: 226, w: 190, h: 36, bind: 'custom', title: 'المهام والإجراءات', text: '', fontSize: 12, align: 'right' },
      { id: 'tx', kind: 'field', x: 14, y: 238, w: 182, h: 20, bind: 'tasks.list', title: '', text: '', fontSize: 10, align: 'right' },
      { id: 'today', kind: 'field', x: 10, y: 276, w: 80, h: 10, bind: 'today', title: 'التاريخ', text: '', fontSize: 10, align: 'right' }
    ]
  })
}

export function isSafeImageDataUrl(url: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(url.trim())
}

export function renderLayoutHtml(
  layout: PrintLayout,
  values: Record<string, string>,
  logoDataUrl?: string,
  fontFace = '',
  printedAt = ''
): string {
  const safe = sanitizeLayout(layout)
  const src = logoDataUrl && isSafeImageDataUrl(logoDataUrl) ? logoDataUrl.trim() : ''
  const blocks = safe.blocks
    .map((b) => {
      const label = escapeHtml(b.title)
      const valRaw = values[b.bind] ?? ''
      const val = escapeHtml(valRaw).replace(/\n/g, '<br/>')
      let inner = ''
      if (b.kind === 'logo' || b.bind === 'office.logo' || b.bind === 'office.name' || b.bind === 'office.phone' || b.bind === 'office.address') {
        return ''
      } else if (b.kind === 'section') {
        inner = `<div style="font-weight:700;border-bottom:1px solid #c9a227;padding-bottom:1mm;color:#122f4d">${label}</div>`
      } else if (b.bind === 'custom' || b.kind === 'text') {
        const body = escapeHtml(b.text).replace(/\n/g, '<br/>')
        inner = `${label ? `<span class="lbl">${label}: </span>` : ''}${body}`
      } else {
        inner = `${label ? `<span class="lbl">${label}: </span>` : ''}<span class="val">${val}</span>`
      }
      const jc = b.vAlign === 'middle' ? 'center' : b.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
      return `<div class="block" style="left:${b.x}mm;top:${b.y}mm;width:${b.w}mm;height:${b.h}mm;font-size:${b.fontSize}pt;text-align:${b.align};display:flex;flex-direction:column;justify-content:${jc}"><div class="inner">${inner}</div></div>`
    })
    .join('')
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';"/>
<title>print</title>
<style>
${fontFace}
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
body { width: 210mm; min-height: 297mm; font-family: 'IBM Plex Sans Arabic', Tahoma, 'Segoe UI', sans-serif; color: #122f4d; direction: rtl; background: #fff; }
.page { position: relative; width: 210mm; height: 297mm; }
.block { position: absolute; overflow: hidden; box-sizing: border-box; padding: 0.6mm 1mm; color: #122f4d; }
.block .inner { width: 100%; color: #122f4d; overflow-wrap: break-word; word-break: normal; white-space: pre-wrap; line-height: 1.35; }
.block .lbl { color: #3d4f61; font-size: 8.5pt; }
.block .val { color: #122f4d; }
.block img { display: block; max-width: 100%; max-height: 100%; }
.print-date { position: absolute; top: 4mm; left: 6mm; font-size: 9pt; color: #5b6b7c; z-index: 4; }
.print-logo-center { position: absolute; top: 3mm; left: 50%; transform: translateX(-50%); height: 16mm; z-index: 3; }
.print-logo-center img { height: 16mm; width: auto; object-fit: contain; }
.print-office { position: absolute; top: 3mm; right: 6mm; text-align: right; z-index: 4; max-width: 72mm; font-size: 10pt; line-height: 1.35; }
.print-office .nm { font-weight: 700; }
.print-office .ph { color: #5b6b7c; font-size: 8.5pt; }
</style>
</head>
<body>
  <div class="page">
    <div class="print-date">${escapeHtml(printedAt)}</div>
    ${src ? `<div class="print-logo-center"><img src="${escapeHtml(src)}" alt=""/></div>` : ''}
    <div class="print-office">
      <div class="nm">${escapeHtml(values['office.name'] || '')}</div>
      <div class="ph">${escapeHtml([values['office.address'], values['office.phone']].filter(Boolean).join(' — '))}</div>
    </div>
    ${blocks}
  </div>
</body>
</html>`
}
