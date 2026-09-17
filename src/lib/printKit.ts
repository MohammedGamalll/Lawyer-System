import { invoke } from './api'
import { formatCell } from './datetime'
import { formatCourtNumber, formatProgramCode, stripInternalPrefix } from './courtNumber'

export function escPrint(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type PrintPart = { label?: string; value: string }

export function labeledCell(parts: PrintPart[]): string {
  return parts
    .map((p) => ({ ...p, value: String(p.value || '').trim() }))
    .filter((p) => p.value && p.value !== '—')
    .map((p) => (p.label ? `<b>${escPrint(p.label)}:</b> ${escPrint(p.value)}` : escPrint(p.value)))
    .join(' — ')
}

export type PrintColumn = { label: string }

export function applyPrintColFilters(
  rows: Record<string, unknown>[],
  colFilters: Record<string, string> | undefined,
  lang: string,
  t: (k: string) => string
) {
  if (!colFilters) return rows
  let out = rows
  for (const [k, v] of Object.entries(colFilters)) {
    const s = String(v || '').trim().toLowerCase()
    if (!s) continue
    out = out.filter(
      (r) =>
        formatCell(k, r[k], lang, t).toLowerCase().includes(s) ||
        String(r[k] ?? '').toLowerCase().includes(s)
    )
  }
  return out
}

export function compactTableHtml(opts: {
  columns: PrintColumn[]
  rows: string[][]
  notesLabel: string
  subtitle?: string
  emptyLabel: string
}): string {
  const cols = [...opts.columns, { label: opts.notesLabel }]
  const head = cols.map((c) => `<th>${escPrint(c.label)}</th>`).join('')
  const body =
    opts.rows.length === 0
      ? `<tr><td colspan="${cols.length}">${escPrint(opts.emptyLabel)}</td></tr>`
      : opts.rows
          .map((cells) => {
            const padded = [...cells]
            while (padded.length < opts.columns.length) padded.push('')
            padded.push('')
            return `<tr>${padded
              .slice(0, cols.length)
              .map((c) => `<td>${c || ''}</td>`)
              .join('')}</tr>`
          })
          .join('')
  const sub = opts.subtitle ? `<h3 class="print-sub">${escPrint(opts.subtitle)}</h3>` : ''
  return `${sub}<table class="compact">${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${body}</tbody></table>`
}

export function promoteSingleFilter(
  items: { key: string; label: string; value: string }[]
): { header?: string; dropKeys: Set<string> } {
  const filled = items.filter((i) => String(i.value || '').trim())
  if (filled.length !== 1) return { dropKeys: new Set() }
  const one = filled[0]
  return { header: `${one.label}: ${one.value}`, dropKeys: new Set([one.key]) }
}

export function printVal(key: string, value: unknown, lang: string, t: (k: string) => string): string {
  if (key === 'office_case_number' && value && typeof value === 'object') {
    return formatCourtNumber(value as Record<string, unknown>)
  }
  const formatted = formatCell(key, value, lang, t)
  return stripInternalPrefix(formatted)
}

function nz(v: unknown) {
  const s = String(v ?? '').trim()
  return s && s !== '—' ? s : ''
}

function pcPair(label: string, value: unknown) {
  const v = nz(value)
  if (!v) return ''
  return `<span class="pc-pair"><strong>${escPrint(label)}:</strong> ${escPrint(v)}</span>`
}

function pcRow(htmls: string[], extraClass = '') {
  const bits = htmls.filter(Boolean)
  if (!bits.length) return ''
  const cls = extraClass ? `pc-row ${extraClass}` : 'pc-row'
  return `<div class="${cls}">${bits.join('')}</div>`
}

function pcLine(label: string, value: unknown, dottedIfEmpty = false) {
  const v = nz(value)
  if (!v && !dottedIfEmpty) return ''
  const body = v ? escPrint(v) : '<span class="pc-dots">............................................................</span>'
  return `<div class="pc-row"><span class="pc-pair"><strong>${escPrint(label)}:</strong> ${body}</span></div>`
}

function notesLine(label: string) {
  return `<div class="pc-notes"><strong>${escPrint(label)}:</strong> <span class="pc-dots">............................................................</span></div>`
}

function degreeNumber(num: unknown, year: unknown) {
  const n = nz(num)
  if (!n) return ''
  const y = nz(year)
  return y ? `${n} لسنة ${y} ق` : n
}

function joinCaps(...vals: unknown[]) {
  return vals.map(nz).filter(Boolean).join(' / ')
}

function partyText(name: unknown, caps: unknown) {
  const n = nz(name)
  const c = nz(caps)
  if (!n && !c) return ''
  if (n && c) return `${n} — ${c}`
  return n || c
}

function extraRefPairs(r: Record<string, unknown>, t: (k: string) => string) {
  const refs: [unknown, unknown][] = [
    [r.extra_ref_type, r.extra_ref_number],
    [r.extra_ref2_type, r.extra_ref2_number],
    [r.extra_ref3_type, r.extra_ref3_number]
  ]
  return refs.map(([type, num]) => {
    if (!nz(num)) return ''
    const typeLabel = nz(type)
    const label = /صفة|sifa|capacity/i.test(typeLabel) ? t('printKit.sifaNumber') : typeLabel || t('fields.extra_ref_number')
    return pcPair(label, num)
  })
}

function caseNumbersRow(r: Record<string, unknown>, t: (k: string) => string) {
  return pcRow([
    pcPair(t('printKit.caseNumber'), degreeNumber(r.first_instance_number, r.first_instance_year)),
    pcPair(t('fields.appeal_number'), degreeNumber(r.appeal_number, r.appeal_year)),
    pcPair(t('fields.cassation_number'), degreeNumber(r.cassation_number, r.cassation_year)),
    ...extraRefPairs(r, t)
  ])
}

function caseHeaderRows(r: Record<string, unknown>, t: (k: string) => string) {
  return [
    pcRow([
      pcPair(t('fields.program_code'), r.system_code || formatProgramCode(r)),
      pcPair(t('printKit.court'), r.court_name || r.court),
      pcPair(t('printKit.circuit'), r.circuit || r.circuit_number)
    ]),
    caseNumbersRow(r, t),
    pcRow([
      pcPair(t('fields.case_type_id'), r.case_type || r.case_type_name || r.category),
      pcPair(t('fields.case_subject'), r.case_subject || r.case_title)
    ]),
    pcRow(
      [
        pcPair(t('printKit.client'), partyText(r.client_name, r.client_capacity || joinCaps(r.client_capacity_first || r.capacity_first, r.client_capacity_appeal || r.capacity_appeal, r.client_capacity_cassation || r.capacity_cassation))),
        pcPair(t('printKit.opponent'), partyText(r.opponent_name, r.opponent_capacity || joinCaps(r.opponent_capacity_first, r.opponent_capacity_appeal, r.opponent_capacity_cassation)))
      ],
      'pc-row-parties'
    )
  ].join('')
}

function wrapPrintBlocks(items: string[], emptyLabel: string, subtitle?: string) {
  const sub = subtitle ? `<h3 class="print-sub">${escPrint(subtitle)}</h3>` : ''
  if (!items.length) return `${sub}<div class="pc-empty">${escPrint(emptyLabel)}</div>`
  return `${sub}${items.join('')}`
}

function doneFromStatus(r: Record<string, unknown>, lang: string, t: (k: string) => string) {
  return (
    nz(r.what_happened) ||
    nz(r.result) ||
    nz(r.court_decision) ||
    (['completed', 'done'].includes(String(r.status || '')) ? printVal('status', r.status, lang, t) : '')
  )
}

export function taskBlocksHtml(
  tasks: Record<string, unknown>[],
  t: (k: string) => string,
  lang: string,
  opts?: { emptyLabel?: string; subtitle?: string }
) {
  const items = tasks.map((r) => {
    const action = nz(r.required_action) || nz(r.description) || nz(r.title)
    const done = doneFromStatus(r, lang, t)
    return `<div class="print-card-block">
      ${caseHeaderRows(r, t)}
      ${pcRow(
        [
          pcPair(t('printKit.requiredAction'), action),
          `<span class="pc-pair"><strong>${escPrint(t('printKit.whatWasDone'))}:</strong> ${
            done ? escPrint(done) : '<span class="pc-dots">............................................................</span>'
          }</span>`
        ],
        'pc-row-action'
      )}
      ${notesLine(t('printKit.notes'))}
    </div>`
  })
  return wrapPrintBlocks(items, opts?.emptyLabel || t('noData'), opts?.subtitle)
}

export function hearingBlocksHtml(
  hearings: Record<string, unknown>[],
  t: (k: string) => string,
  lang: string,
  opts?: { emptyLabel?: string; subtitle?: string }
) {
  const items = hearings.map((r) => {
    const hallFloor = [nz(r.hall), nz(r.floor)].filter(Boolean).join(' / ')
    const decisionTaken = nz(r.court_decision) || nz(r.what_happened) || nz(r.result)
    return `<div class="print-card-block">
      ${caseHeaderRows(r, t)}
      ${pcRow([
        pcPair(t('fields.hearing_date'), printVal('hearing_date', r.hearing_date, lang, t)),
        pcPair(t('fields.hearing_type'), r.hearing_type),
        pcPair(t('printKit.hallFloor'), hallFloor)
      ])}
      ${pcLine(t('fields.previous_decision'), r.previous_decision)}
      ${pcLine(t('printKit.decisionDone'), decisionTaken, true)}
    </div>`
  })
  return wrapPrintBlocks(items, opts?.emptyLabel || t('noData'), opts?.subtitle)
}

export function executionBlocksHtml(
  tasks: Record<string, unknown>[],
  t: (k: string) => string,
  _lang: string,
  opts?: { emptyLabel?: string; subtitle?: string }
) {
  const items = tasks.map((r) => {
    const criminal = /جنائي|criminal/i.test(String(r.execution_kind || ''))
    const action = nz(r.required_action) || nz(r.description) || nz(r.title)
    const criminalRow = criminal
      ? pcRow([
          pcPair(t('printKit.hasrNumber'), r.police_report_no),
          pcPair(t('fields.police_station'), r.police_station),
          pcPair(t('printKit.opponent'), r.opponent_name),
          pcPair(t('fields.address'), r.opponent_address)
        ])
      : ''
    return `<div class="print-card-block">
      ${caseHeaderRows(r, t)}
      ${pcRow([pcPair(t('fields.execution_action'), action), pcPair(t('fields.execution_kind'), r.execution_kind)])}
      ${criminalRow}
      ${notesLine(t('printKit.notes'))}
    </div>`
  })
  return wrapPrintBlocks(items, opts?.emptyLabel || t('noData'), opts?.subtitle)
}

export async function sendPrint(kind: 'report' | 'a4', title: string, body: string) {
  await invoke('print:print', kind, title, body)
}

export type PrintFieldOpt = { id: string; label: string; defaultOn?: boolean }

function has(sel: string[], id: string) {
  return sel.includes(id)
}

export function casePrintFields(t: (k: string) => string): PrintFieldOpt[] {
  return [
    { id: 'number', label: t('printKit.number'), defaultOn: true },
    { id: 'title', label: t('fields.case_subject'), defaultOn: true },
    { id: 'parties', label: t('printKit.parties'), defaultOn: true },
    { id: 'court', label: t('printKit.courtCell'), defaultOn: true },
    { id: 'status', label: t('fields.status'), defaultOn: true },
    { id: 'lawyer', label: t('fields.lawyer_id'), defaultOn: false },
    { id: 'received_date', label: t('fields.received_date'), defaultOn: false }
  ]
}

export function buildCasePrintTable(
  data: Record<string, unknown>[],
  selected: string[],
  t: (k: string) => string,
  lang: string
) {
  const columns: PrintColumn[] = []
  if (has(selected, 'number')) columns.push({ label: t('printKit.number') })
  if (has(selected, 'title')) columns.push({ label: t('fields.case_subject') })
  if (has(selected, 'parties')) columns.push({ label: t('printKit.parties') })
  if (has(selected, 'court')) columns.push({ label: t('printKit.courtCell') })
  if (has(selected, 'status')) columns.push({ label: t('fields.status') })
  if (has(selected, 'lawyer')) columns.push({ label: t('fields.lawyer_id') })
  if (has(selected, 'received_date')) columns.push({ label: t('fields.received_date') })
  const rows = data.map((r) => {
    const cells: string[] = []
    if (has(selected, 'number')) cells.push(escPrint(formatCourtNumber(r)))
    if (has(selected, 'title')) cells.push(escPrint(printVal('title', r.title, lang, t)))
    if (has(selected, 'parties')) {
      cells.push(
        labeledCell([
          { label: t('printKit.client'), value: String(r.client_name || '') },
          { label: t('printKit.opponent'), value: String(r.opponent_name || r.opponent_names || '') }
        ])
      )
    }
    if (has(selected, 'court')) {
      cells.push(
        labeledCell([
          { label: t('printKit.court'), value: String(r.court || '') },
          { label: t('printKit.circuit'), value: String(r.circuit || '') },
          { label: t('printKit.sessionPlace'), value: String(r.session_place || '') }
        ])
      )
    }
    if (has(selected, 'status')) cells.push(escPrint(printVal('status', r.status, lang, t)))
    if (has(selected, 'lawyer')) cells.push(escPrint(String(r.lawyer_name || '')))
    if (has(selected, 'received_date')) cells.push(escPrint(printVal('received_date', r.received_date, lang, t)))
    return cells
  })
  return { columns, rows }
}

export function hearingPrintFields(t: (k: string) => string): PrintFieldOpt[] {
  return [
    { id: 'hearing_date', label: t('fields.hearing_date'), defaultOn: true },
    { id: 'hearing_type', label: t('fields.hearing_type'), defaultOn: true },
    { id: 'parties', label: t('printKit.parties'), defaultOn: true },
    { id: 'venue', label: t('fields.venue'), defaultOn: true },
    { id: 'decision', label: t('fields.court_decision'), defaultOn: true },
    { id: 'status', label: t('fields.status'), defaultOn: false }
  ]
}

export function buildHearingPrintTable(
  data: Record<string, unknown>[],
  selected: string[],
  t: (k: string) => string,
  lang: string
) {
  const columns: PrintColumn[] = []
  if (has(selected, 'hearing_date')) columns.push({ label: t('fields.hearing_date') })
  if (has(selected, 'hearing_type')) columns.push({ label: t('fields.hearing_type') })
  if (has(selected, 'parties')) columns.push({ label: t('printKit.parties') })
  if (has(selected, 'venue')) columns.push({ label: t('fields.venue') })
  if (has(selected, 'decision')) columns.push({ label: t('fields.court_decision') })
  if (has(selected, 'status')) columns.push({ label: t('fields.status') })
  const rows = data.map((r) => {
    const cells: string[] = []
    if (has(selected, 'hearing_date')) cells.push(escPrint(printVal('hearing_date', r.hearing_date, lang, t)))
    if (has(selected, 'hearing_type')) cells.push(escPrint(String(r.hearing_type || '')))
    if (has(selected, 'parties')) {
      cells.push(
        labeledCell([
          { label: t('printKit.caseLabel'), value: formatCourtNumber(r) || String(r.case_title || '') },
          { label: t('printKit.client'), value: String(r.client_name || '') }
        ])
      )
    }
    if (has(selected, 'venue')) {
      cells.push(
        labeledCell([
          { label: t('fields.venue'), value: String(r.venue || r.court || '') },
          { label: t('fields.hall'), value: [r.hall, r.floor].filter(Boolean).join(' / ') }
        ])
      )
    }
    if (has(selected, 'decision')) cells.push(escPrint(String(r.court_decision || r.previous_decision || '')))
    if (has(selected, 'status')) cells.push(escPrint(printVal('status', r.status, lang, t)))
    return cells
  })
  return { columns, rows }
}

export function adminPrintFields(t: (k: string) => string): PrintFieldOpt[] {
  return [
    { id: 'description', label: t('fields.description'), defaultOn: true },
    { id: 'parties', label: t('printKit.parties'), defaultOn: true },
    { id: 'venue', label: t('fields.venue'), defaultOn: true },
    { id: 'due_date', label: t('fields.due_date'), defaultOn: true },
    { id: 'assignee', label: t('fields.assignee_name'), defaultOn: false },
    { id: 'status', label: t('fields.status'), defaultOn: true }
  ]
}

export function buildAdminPrintTable(
  data: Record<string, unknown>[],
  selected: string[],
  t: (k: string) => string,
  lang: string
) {
  const columns: PrintColumn[] = []
  if (has(selected, 'description')) columns.push({ label: t('fields.description') })
  if (has(selected, 'parties')) columns.push({ label: t('printKit.parties') })
  if (has(selected, 'venue')) columns.push({ label: t('fields.venue') })
  if (has(selected, 'due_date')) columns.push({ label: t('fields.due_date') })
  if (has(selected, 'assignee')) columns.push({ label: t('fields.assignee_name') })
  if (has(selected, 'status')) columns.push({ label: t('fields.status') })
  const rows = data.map((r) => {
    const cells: string[] = []
    if (has(selected, 'description')) cells.push(escPrint(String(r.description || r.title || '')))
    if (has(selected, 'parties')) {
      cells.push(
        labeledCell([
          { label: t('printKit.caseLabel'), value: formatCourtNumber(r) },
          { label: t('printKit.client'), value: String(r.client_name || '') }
        ])
      )
    }
    if (has(selected, 'venue')) cells.push(escPrint(String(r.venue || '')))
    if (has(selected, 'due_date')) cells.push(escPrint(printVal('due_date', r.due_date, lang, t)))
    if (has(selected, 'assignee')) cells.push(escPrint(String(r.assignee_name || '')))
    if (has(selected, 'status')) cells.push(escPrint(printVal('status', r.status, lang, t)))
    return cells
  })
  return { columns, rows }
}

export function executionPrintFields(t: (k: string) => string): PrintFieldOpt[] {
  return [
    { id: 'action', label: t('fields.execution_action'), defaultOn: true },
    { id: 'kind', label: t('fields.execution_kind'), defaultOn: true },
    { id: 'parties', label: t('printKit.parties'), defaultOn: true },
    { id: 'criminal', label: t('printKit.criminal'), defaultOn: true },
    { id: 'venue', label: t('fields.venue'), defaultOn: true },
    { id: 'due_date', label: t('fields.due_date'), defaultOn: true },
    { id: 'status', label: t('fields.status'), defaultOn: false }
  ]
}

export function buildExecutionPrintTable(
  data: Record<string, unknown>[],
  selected: string[],
  t: (k: string) => string,
  lang: string
) {
  const anyCriminal = data.some((r) => /جنائي|criminal/i.test(String(r.execution_kind || '')))
  const showCriminal = has(selected, 'criminal') && anyCriminal
  const columns: PrintColumn[] = []
  if (has(selected, 'action')) columns.push({ label: t('fields.execution_action') })
  if (has(selected, 'kind')) columns.push({ label: t('fields.execution_kind') })
  if (has(selected, 'parties')) columns.push({ label: t('printKit.parties') })
  if (showCriminal) columns.push({ label: t('printKit.criminal') })
  if (has(selected, 'venue')) columns.push({ label: t('fields.venue') })
  if (has(selected, 'due_date')) columns.push({ label: t('fields.due_date') })
  if (has(selected, 'status')) columns.push({ label: t('fields.status') })
  const rows = data.map((r) => {
    const criminal = /جنائي|criminal/i.test(String(r.execution_kind || ''))
    const cells: string[] = []
    if (has(selected, 'action')) cells.push(escPrint(String(r.description || r.title || '')))
    if (has(selected, 'kind')) cells.push(escPrint(String(r.execution_kind || '')))
    if (has(selected, 'parties')) {
      cells.push(
        labeledCell([
          { label: t('printKit.caseLabel'), value: formatCourtNumber(r) },
          { label: t('printKit.client'), value: String(r.client_name || '') },
          { label: t('printKit.opponent'), value: String(r.opponent_name || '') }
        ])
      )
    }
    if (showCriminal) {
      cells.push(
        criminal
          ? labeledCell([
              { label: t('fields.police_report_kind'), value: String(r.police_report_kind || '') },
              { label: t('fields.police_report_no'), value: String(r.police_report_no || '') },
              { label: t('fields.police_station'), value: String(r.police_station || '') },
              { label: t('printKit.opponent'), value: String(r.opponent_name || '') },
              { label: t('fields.address'), value: String(r.opponent_address || '') }
            ])
          : ''
      )
    }
    if (has(selected, 'venue')) cells.push(escPrint(String(r.venue || r.police_station || '')))
    if (has(selected, 'due_date')) cells.push(escPrint(printVal('due_date', r.due_date, lang, t)))
    if (has(selected, 'status')) cells.push(escPrint(printVal('status', r.status, lang, t)))
    return cells
  })
  return { columns, rows }
}

export function kvBlock(title: string, lines: PrintPart[]): string {
  const body = lines
    .filter((l) => String(l.value || '').trim() && l.value !== '—')
    .map((l) => `<div class="kv"><b>${escPrint(l.label || '')}:</b> ${escPrint(l.value)}</div>`)
    .join('')
  if (!body) return ''
  return `<div class="block-title">${escPrint(title)}</div>${body}`
}

