import { invoke } from './api'
import { formatCell } from './datetime'
import { formatCourtNumber, formatProgramCode, isManualProgramCode, stripInternalPrefix } from './courtNumber'
import { rtlIsolatedPair } from '@shared/rtlBidi'

export function escPrint(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type PrintPart = { label?: string; value: string; ltr?: boolean; html?: boolean }

export function labeledCell(parts: PrintPart[]): string {
  return parts
    .map((p) => ({ ...p, value: String(p.value || '').trim() }))
    .filter((p) => p.value && p.value !== '—')
    .map((p) => {
      const body = p.html ? p.value : p.ltr ? ltrPrint(p.value) : escPrint(p.value)
      return p.label ? `<b>${escPrint(p.label)}:</b> ${body}` : body
    })
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

export function ltrPrint(text: unknown): string {
  const s = String(text ?? '').trim()
  if (!s || s === '—') return escPrint(s || '—')
  return `<bdo dir="ltr">${escPrint(s)}</bdo>`
}

export function courtNumberPrint(row: Record<string, unknown>): string {
  const text = formatCourtNumber(row)
  if (!text || text === '—') return '—'
  return `<span class="court-number" dir="rtl">${escPrint(text)}</span>`
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

function pcPair(label: string, value: unknown, rawHtml = false) {
  if (rawHtml) {
    const v = String(value ?? '').trim()
    if (!v) return ''
    return `<span class="pc-pair"><strong>${escPrint(label)}:</strong> ${v}</span>`
  }
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
  const pair = rtlIsolatedPair(num, year)
  if (!pair) return ''
  return `<span class="court-number" dir="rtl">${escPrint(pair)}</span>`
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
    pcPair(t('printKit.caseNumber'), degreeNumber(r.first_instance_number, r.first_instance_year), true),
    pcPair(t('fields.appeal_number'), degreeNumber(r.appeal_number, r.appeal_year), true),
    pcPair(t('fields.cassation_number'), degreeNumber(r.cassation_number, r.cassation_year), true),
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

const ROLL_DOTS = '........'
const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function stripPlacePrefix(s: unknown): string {
  let t = nz(s)
  if (!t) return ''
  t = t.replace(/^محكمة\s+/u, '')
  t = t.replace(/\s*شرطة\s+/gu, ' ')
  t = t.replace(/^شرطة\s+/u, '')
  t = t.replace(/\s+شرطة$/u, '')
  return t.replace(/\s+/g, ' ').trim()
}

function isExpertHearing(r: Record<string, unknown>) {
  return r.__rollKind === 'expert' || /خبير|expert|جلسة خبراء/i.test(String(r.hearing_type || ''))
}

function expertTypeLabel(r: Record<string, unknown>) {
  const type = nz(r.hearing_type)
  if (type.includes('جلسة خبراء')) return type
  return type ? `[جلسة خبراء] ${type}` : '[جلسة خبراء]'
}

function slashDate(value: unknown): string {
  const s = nz(value)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`
}

function weekdayName(value: unknown, lang: string): string {
  const s = nz(value)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return ''
  const names = lang === 'en' ? EN_WEEKDAYS : AR_WEEKDAYS
  return names[dt.getDay()] || ''
}

function hearingPlace(r: Record<string, unknown>): string {
  return (
    stripPlacePrefix(r.court_name || r.court) ||
    stripPlacePrefix(r.venue) ||
    stripPlacePrefix(r.expert_office) ||
    stripPlacePrefix(r.session_place) ||
    stripPlacePrefix(r.police_station)
  )
}

function hrLine(text: unknown, dottedIfEmpty = false): string {
  const v = nz(text)
  if (!v && !dottedIfEmpty) return ''
  const body = v ? escPrint(v) : `<span class="hr-dots">${ROLL_DOTS}</span>`
  return `<div class="hr-line">${body}</div>`
}

function hrHtml(html: string, dottedIfEmpty = false): string {
  const v = String(html ?? '').trim()
  if ((!v || v === '—') && !dottedIfEmpty) return ''
  const body = v && v !== '—' ? v : `<span class="hr-dots">${ROLL_DOTS}</span>`
  return `<div class="hr-line">${body}</div>`
}

function hrLabeled(label: string, value: unknown, dottedIfEmpty = true): string {
  const v = nz(value)
  if (!v && !dottedIfEmpty) return ''
  const body = v ? escPrint(v) : `<span class="hr-dots">${ROLL_DOTS}</span>`
  return `<div class="hr-line">${escPrint(label)} ${body}</div>`
}

function hrStack(lines: string[], min = 1): string {
  const bits = lines.filter(Boolean)
  while (bits.length < min) bits.push(hrLine('', true))
  return bits.join('')
}

function rollCaseNumberLines(r: Record<string, unknown>, t: (k: string) => string): string {
  const lines: string[] = []
  const first =
    degreeNumber(r.first_instance_number, r.first_instance_year) ||
    (courtNumberPrint(r) !== '—' ? courtNumberPrint(r) : '')
  lines.push(hrHtml(first, true))
  const appeal = degreeNumber(r.appeal_number, r.appeal_year)
  if (appeal) lines.push(hrHtml(appeal))
  const cass = degreeNumber(r.cassation_number, r.cassation_year)
  if (cass) lines.push(hrHtml(cass))
  const refs: [unknown, unknown][] = [
    [r.extra_ref_type, r.extra_ref_number],
    [r.extra_ref2_type, r.extra_ref2_number],
    [r.extra_ref3_type, r.extra_ref3_number]
  ]
  for (const [type, num] of refs) {
    const typeLabel = nz(type)
    const n = nz(num)
    if (!typeLabel && !n) {
      lines.push(hrLine('', true))
      continue
    }
    const label = /صفة|sifa|capacity/i.test(typeLabel) ? t('printKit.sifaNumber') : typeLabel
    if (label && n) lines.push(hrLine(`${label} ${n}`))
    else if (n) lines.push(hrLine(n))
    else lines.push(`<div class="hr-line">${escPrint(label)} <span class="hr-dots">${ROLL_DOTS}</span></div>`)
  }
  return hrStack(lines, 2)
}

function rollCourtCell(r: Record<string, unknown>, preferVenue = false): string {
  const place = preferVenue ? adminPlace(r) : hearingPlace(r)
  const hallFloor = [nz(r.hall), nz(r.floor)].filter(Boolean).join(' / ')
  const circuit = [nz(r.circuit), nz(r.circuit_number), hallFloor].filter(Boolean).join(' ')
  const code = nz(r.system_code) || formatProgramCode(r)
  const codeLine = isManualProgramCode(r)
    ? `<div class="hr-line program-code-manual">${escPrint(code)}</div>`
    : hrLine(code)
  return hrStack(
    [
      codeLine,
      hrLine(place),
      hrLine(r.litigation_degree),
      hrLine(circuit)
    ],
    2
  )
}

function rollTypeCell(r: Record<string, unknown>, extraDates: unknown[] = []): string {
  const dateLines = extraDates.length
    ? extraDates.map((d) => hrLine(slashDate(d), true))
    : [hrLine(slashDate(r.previous_hearing_date), true), hrLine(slashDate(r.hearing_date), true)]
  return hrStack(
    [
      hrLine(isExpertHearing(r) ? expertTypeLabel(r) : r.hearing_type),
      hrLine(r.case_type || r.case_type_name || r.category),
      hrLine(r.case_subject || r.case_title),
      ...dateLines
    ],
    2
  )
}

function rollClientCell(r: Record<string, unknown>): string {
  const caps =
    nz(r.client_capacity) ||
    joinCaps(r.client_capacity_first || r.capacity_first, r.client_capacity_appeal || r.capacity_appeal, r.client_capacity_cassation || r.capacity_cassation)
  return hrStack([hrLine(r.client_name, true), hrLine(caps), hrLine(r.previous_decision)], 1)
}

function rollOpponentCell(r: Record<string, unknown>, t: (k: string) => string): string {
  const caps =
    nz(r.opponent_capacity) ||
    joinCaps(r.opponent_capacity_first, r.opponent_capacity_appeal, r.opponent_capacity_cassation)
  const lines = [hrLine(r.opponent_name, true), hrLine(caps)]
  if (isExpertHearing(r)) {
    const name = nz(r.expert_name)
    lines.push(
      `<div class="hr-line">${escPrint(t('printKit.expertNameLine'))}: ${
        name ? escPrint(name) : `<span class="hr-dots">${ROLL_DOTS}</span>`
      }</div>`
    )
  }
  return hrStack(lines, 1)
}

function hearingsDayTitle(r: Record<string, unknown>, lang: string, t: (k: string, opts?: Record<string, string>) => string) {
  const date = nz(r.hearing_date)
  return t('printKit.hearingsDay', {
    day: weekdayName(date, lang),
    date: slashDate(date),
    place: hearingPlace(r)
  }).replace(/\s+/g, ' ').trim()
}

function hearingsSheetTitle(r: Record<string, unknown>, lang: string, t: (k: string, opts?: Record<string, string>) => string) {
  const date = nz(r.hearing_date)
  return t('printKit.hearingsSheet', {
    day: weekdayName(date, lang),
    date: slashDate(date)
  }).replace(/\s+/g, ' ').trim()
}

function adminPlace(r: Record<string, unknown>): string {
  return stripPlacePrefix(r.venue) || hearingPlace(r)
}

function adminDayTitle(r: Record<string, unknown>, lang: string, t: (k: string, opts?: Record<string, string>) => string) {
  const date = nz(r.due_date)
  return t('printKit.adminDay', {
    day: weekdayName(date, lang),
    date: slashDate(date)
  }).replace(/\s+/g, ' ').trim()
}

const BLANK_LAWYER_LINE =
  '<div class="hr-lawyer" style="font-weight: bold; margin-bottom: 10px;">الأستاذ / ........................................................................</div>'

const ROLL_COLGROUP = `<colgroup>
      <col style="width:12%" /><col style="width:15%" /><col style="width:15%" />
      <col style="width:19%" /><col style="width:19%" /><col style="width:20%" />
    </colgroup>`

function rollThead(t: (k: string) => string, lastColKey: string) {
  return `<thead><tr>
      <th>${escPrint(t('printKit.courtAndCircuit'))}</th>
      <th>${escPrint(t('printKit.caseNumber'))}</th>
      <th>${escPrint(t('printKit.caseTypeCol'))}</th>
      <th>${escPrint(t('printKit.clientAndCapacity'))}</th>
      <th>${escPrint(t('printKit.opponentAndCapacity'))}</th>
      <th>${escPrint(t(lastColKey))}</th>
    </tr></thead>`
}

function groupHeaderRow(title: string) {
  return `<tr class="group-header"><td colspan="6">${escPrint(title)}</td></tr>`
}

function wrapRollTable(
  lawyerLine: string,
  tbody: string,
  t: (k: string) => string,
  lastColKey = 'printKit.decision',
  colgroup = ROLL_COLGROUP
) {
  return `${lawyerLine}<table class="hearings-roll" dir="rtl">${colgroup}${rollThead(t, lastColKey)}<tbody>${tbody}</tbody></table>`
}

function rollDataRow(
  r: Record<string, unknown>,
  t: (k: string) => string,
  decisionHtml: string,
  opts?: { preferVenue?: boolean; extraDates?: unknown[] }
) {
  return `<tr>
          <td>${rollCourtCell(r, opts?.preferVenue)}</td>
          <td>${rollCaseNumberLines(r, t)}</td>
          <td>${rollTypeCell(r, opts?.extraDates)}</td>
          <td>${rollClientCell(r)}</td>
          <td>${rollOpponentCell(r, t)}</td>
          <td>${decisionHtml}</td>
        </tr>`
}

function distinctDates(rows: Record<string, unknown>[], key: string) {
  return new Set(rows.map((r) => nz(r[key])).filter(Boolean)).size
}

export function hearingRollTableHtml(
  hearings: Record<string, unknown>[],
  t: (k: string, opts?: Record<string, string>) => string,
  lang: string,
  opts?: { emptyLabel?: string }
): { html: string; sheetTitle: string } {
  const lawyerLine = BLANK_LAWYER_LINE
  const emptyTitle = t('nav.hearings')
  if (!hearings.length) {
    return {
      sheetTitle: emptyTitle,
      html: wrapRollTable(
        lawyerLine,
        `<tr><td colspan="6">${escPrint(opts?.emptyLabel || t('noData'))}</td></tr>`,
        t
      )
    }
  }
  const groups = new Map<string, Record<string, unknown>[]>()
  const order: string[] = []
  for (const r of hearings) {
    const key = `${nz(r.hearing_date)}|${hearingPlace(r)}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(r)
  }
  const tbody = order
    .map((key) => {
      const rows = groups.get(key) || []
      const header = groupHeaderRow(hearingsDayTitle(rows[0], lang, t))
      const body = rows
        .map((r) => {
          const decision = nz(r.court_decision) || nz(r.what_happened) || nz(r.result)
          return rollDataRow(
            r,
            t,
            hrStack(
              [
                nz(r.previous_decision) ? hrLabeled(t('fields.previous_decision'), r.previous_decision, false) : '',
                hrLine(decision)
              ],
              1
            )
          )
        })
        .join('')
      return `${header}${body}`
    })
    .join('')
  return {
    sheetTitle:
      distinctDates(hearings, 'hearing_date') > 1
        ? t('printKit.hearingsLedger')
        : hearingsSheetTitle(hearings[0], lang, t) || emptyTitle,
    html: wrapRollTable(lawyerLine, tbody, t)
  }
}

export function expertRollTableHtml(
  rows: Record<string, unknown>[],
  t: (k: string, opts?: Record<string, string>) => string,
  lang: string,
  opts?: { emptyLabel?: string }
): { html: string; sheetTitle: string } {
  const lawyerLine = BLANK_LAWYER_LINE
  const emptyTitle = t('nav.experts')
  if (!rows.length) {
    return {
      sheetTitle: emptyTitle,
      html: wrapRollTable(
        lawyerLine,
        `<tr><td colspan="6">${escPrint(opts?.emptyLabel || t('noData'))}</td></tr>`,
        t,
        'fields.current_action'
      )
    }
  }
  const groups = new Map<string, Record<string, unknown>[]>()
  const order: string[] = []
  for (const r of rows) {
    const key = `${nz(r.hearing_date)}|${nz(r.expert_office)}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(r)
  }
  const tbody = order
    .map((key) => {
      const group = groups.get(key) || []
      const header = groupHeaderRow(hearingsDayTitle(group[0], lang, t))
      const body = group
        .map((r) => {
          const code = nz(r.system_code) || formatProgramCode(r)
          const codeLine = isManualProgramCode(r)
            ? `<div class="hr-line program-code-manual">${escPrint(code)}</div>`
            : hrLine(code)
          const court = `<td>${hrStack(
            [
              codeLine,
              hrLine(r.expert_office),
              hrLabeled(t('printKit.expertNameLine'), r.expert_name, false),
              hrLine([nz(r.floor), nz(r.hall)].filter(Boolean).join(' — '))
            ],
            2
          )}</td>`
          const decision = hrStack(
            [
              hrLabeled(t('fields.previous_action'), r.previous_action),
              hrLabeled(t('fields.current_action'), r.current_action)
            ],
            1
          )
          const typeLine = hrLine(expertTypeLabel(r))
          return `<tr>
          ${court}
          <td>${rollCaseNumberLines(r, t)}</td>
          <td>${hrStack([typeLine, hrLine(r.case_type || r.case_type_name), hrLine(r.case_subject || r.case_title), hrLine(r.hearing_time)], 2)}</td>
          <td>${rollClientCell(r)}</td>
          <td>${rollOpponentCell(r, t)}</td>
          <td>${decision}</td>
        </tr>`
        })
        .join('')
      return `${header}${body}`
    })
    .join('')
  return {
    sheetTitle:
      distinctDates(rows, 'hearing_date') > 1 ? t('nav.experts') : hearingsSheetTitle(rows[0], lang, t) || emptyTitle,
    html: wrapRollTable(lawyerLine, tbody, t, 'fields.current_action')
  }
}

export function taskRollTableHtml(
  tasks: Record<string, unknown>[],
  t: (k: string, opts?: Record<string, string>) => string,
  lang: string,
  opts?: { emptyLabel?: string }
): { html: string; sheetTitle: string } {
  const lawyerLine = BLANK_LAWYER_LINE
  const emptyTitle = t('nav.tasks')
  if (!tasks.length) {
    return {
      sheetTitle: emptyTitle,
      html: wrapRollTable(
        lawyerLine,
        `<tr><td colspan="6">${escPrint(opts?.emptyLabel || t('noData'))}</td></tr>`,
        t,
        'printKit.requiredAction'
      )
    }
  }
  const groups = new Map<string, Record<string, unknown>[]>()
  const order: string[] = []
  for (const r of tasks) {
    const key = nz(r.due_date)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(r)
  }
  const tbody = order
    .map((key) => {
      const rows = groups.get(key) || []
      const header = groupHeaderRow(adminDayTitle(rows[0], lang, t))
      const body = rows
        .map((r) => {
          const action = nz(r.required_action) || nz(r.description) || nz(r.title)
          return rollDataRow(r, t, hrLine(action, true), {
            preferVenue: true,
            extraDates: [r.start_date, r.due_date]
          })
        })
        .join('')
      return `${header}${body}`
    })
    .join('')
  return {
    sheetTitle:
      distinctDates(tasks, 'due_date') > 1 ? t('printKit.adminLedger') : adminDayTitle(tasks[0], lang, t) || emptyTitle,
    html: wrapRollTable(lawyerLine, tbody, t, 'printKit.requiredAction')
  }
}

export function adminTasksRollTableHtml(
  tasks: Record<string, unknown>[],
  t: (k: string, opts?: Record<string, string>) => string,
  lang: string,
  opts?: { emptyLabel?: string }
) {
  return taskRollTableHtml(tasks, t, lang, opts)
}

const EXEC_COLGROUP = `<colgroup>
      <col style="width:12%" /><col style="width:15%" /><col style="width:12%" />
      <col style="width:20%" /><col style="width:16%" /><col style="width:25%" />
    </colgroup>`

function executionPlace(r: Record<string, unknown>): string {
  return stripPlacePrefix(r.venue) || hearingPlace(r)
}

function executionDayTitle(r: Record<string, unknown>, lang: string, t: (k: string, opts?: Record<string, string>) => string) {
  const date = nz(r.due_date)
  return t('printKit.executionDay', {
    day: weekdayName(date, lang),
    date: slashDate(date)
  }).replace(/\s+/g, ' ').trim()
}

function executionNumberOf(r: Record<string, unknown>) {
  if (nz(r.execution_number)) return r.execution_number
  const refs: [unknown, unknown][] = [
    [r.extra_ref_type, r.extra_ref_number],
    [r.extra_ref2_type, r.extra_ref2_number],
    [r.extra_ref3_type, r.extra_ref3_number]
  ]
  for (const [type, num] of refs) {
    if (/تنفيذ/i.test(nz(type)) && nz(num)) return num
  }
  return ''
}

function execCourtCell(r: Record<string, unknown>, t: (k: string) => string): string {
  return hrStack(
    [
      hrLine(r.system_code || formatProgramCode(r)),
      hrLine(executionPlace(r)),
      hrLine(stripPlacePrefix(r.police_station)),
      hrLabeled(t('printKit.hasrType'), r.police_report_kind),
      hrLabeled(t('printKit.hasrNumber'), r.police_report_no)
    ],
    2
  )
}

function execCaseNumberCell(r: Record<string, unknown>, t: (k: string) => string): string {
  return hrStack(
    [
      rollCaseNumberLines(r, t),
      hrLabeled(t('fields.execution_number'), executionNumberOf(r)),
      hrLabeled(t('fields.execution_officer'), r.execution_officer)
    ],
    2
  )
}

function execClientCell(r: Record<string, unknown>, t: (k: string) => string): string {
  const caps =
    nz(r.client_capacity) ||
    joinCaps(r.client_capacity_first || r.capacity_first, r.client_capacity_appeal || r.capacity_appeal, r.client_capacity_cassation || r.capacity_cassation)
  return hrStack(
    [
      hrLine(r.client_name, true),
      hrLine(caps),
      hrLabeled(t('fields.judgment_date'), slashDate(r.judgment_date) || r.judgment_date),
      hrLabeled(t('fields.judgment_text'), r.judgment_text)
    ],
    1
  )
}

function execOpponentCell(r: Record<string, unknown>, t: (k: string) => string): string {
  const caps =
    nz(r.opponent_capacity) ||
    joinCaps(r.opponent_capacity_first, r.opponent_capacity_appeal, r.opponent_capacity_cassation)
  const action = nz(r.required_action) || nz(r.description) || nz(r.title)
  return hrStack([hrLine(r.opponent_name, true), hrLine(caps), hrLine(action)], 1)
}

export function executionTasksRollTableHtml(
  tasks: Record<string, unknown>[],
  t: (k: string, opts?: Record<string, string>) => string,
  lang: string,
  opts?: { emptyLabel?: string }
): { html: string; sheetTitle: string } {
  const lawyerLine = BLANK_LAWYER_LINE
  const emptyTitle = t('printKit.executionLedger')
  if (!tasks.length) {
    return {
      sheetTitle: emptyTitle,
      html: wrapRollTable(
        lawyerLine,
        `<tr><td colspan="6">${escPrint(opts?.emptyLabel || t('noData'))}</td></tr>`,
        t,
        'printKit.addressCol',
        EXEC_COLGROUP
      )
    }
  }
  const groups = new Map<string, Record<string, unknown>[]>()
  const order: string[] = []
  for (const r of tasks) {
    const key = nz(r.due_date)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(r)
  }
  const tbody = order
    .map((key) => {
      const rows = groups.get(key) || []
      const header = groupHeaderRow(executionDayTitle(rows[0], lang, t))
      const body = rows
        .map(
          (r) => `<tr>
          <td>${execCourtCell(r, t)}</td>
          <td>${execCaseNumberCell(r, t)}</td>
          <td>${rollTypeCell(r, [r.start_date, r.due_date])}</td>
          <td>${execClientCell(r, t)}</td>
          <td>${execOpponentCell(r, t)}</td>
          <td>${hrLine(r.opponent_address, true)}</td>
        </tr>`
        )
        .join('')
      return `${header}${body}`
    })
    .join('')
  return {
    sheetTitle:
      distinctDates(tasks, 'due_date') > 1
        ? t('printKit.executionLedger')
        : executionDayTitle(tasks[0], lang, t) || emptyTitle,
    html: wrapRollTable(lawyerLine, tbody, t, 'printKit.addressCol', EXEC_COLGROUP)
  }
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

export async function sendPrint(
  kind: 'report' | 'a4',
  title: string,
  body: string,
  layout?: 'hearingsRoll' | 'landscape'
) {
  await invoke('print:print', kind, title, body, layout)
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
    if (has(selected, 'number')) cells.push(courtNumberPrint(r))
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
          { label: t('printKit.caseLabel'), value: courtNumberPrint(r) !== '—' ? courtNumberPrint(r) : String(r.case_title || ''), html: courtNumberPrint(r) !== '—' },
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
          { label: t('printKit.caseLabel'), value: courtNumberPrint(r), html: true },
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
          { label: t('printKit.caseLabel'), value: courtNumberPrint(r), html: true },
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

