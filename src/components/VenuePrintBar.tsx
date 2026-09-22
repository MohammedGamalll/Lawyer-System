import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Button, Modal } from './ui'
import { LookupCombo } from './LookupCombo'
import { DatePicker } from './DateTimePicker'
import { formatProgramCode, isManualProgramCode } from '../lib/courtNumber'
import {
  executionTasksRollTableHtml,
  expertRollTableHtml,
  hearingBlocksHtml,
  hearingRollTableHtml,
  taskRollTableHtml,
  escPrint,
  labeledCell,
  courtNumberPrint,
  sendPrint,
  taskBlocksHtml,
  printVal
} from '../lib/printKit'

type PreviewRow = { id: string; kind: 'hearing' | 'expert' | 'admin' | 'exec'; label: string; row: Record<string, unknown> }

const EXPERT_MARK = '[جلسة خبراء]'

function asExpertRollRow(r: Record<string, unknown>): Record<string, unknown> {
  const type = String(r.hearing_type || '').trim()
  return {
    ...r,
    __rollKind: 'expert',
    hearing_type: type.includes('جلسة خبراء') ? type : type ? `${EXPERT_MARK} ${type}` : EXPERT_MARK,
    previous_decision: r.previous_decision || r.previous_action,
    court_decision: r.court_decision || r.current_action,
    venue: r.venue || r.expert_office,
    court: r.court || r.expert_office,
    court_name: r.court_name || r.court || r.expert_office
  }
}

export function VenuePrintBar({ toast }: { toast: (msg: string, type?: 'ok' | 'err') => void }) {
  const { t, i18n } = useTranslation()
  const [venue, setVenue] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [includeHearings, setIncludeHearings] = useState(true)
  const [includeExperts, setIncludeExperts] = useState(true)

  const loadRows = async () => {
    const v = venue.trim()
    if (!v) return { v, hRows: [] as Record<string, unknown>[], expertRows: [] as Record<string, unknown>[], admin: [] as Record<string, unknown>[], exec: [] as Record<string, unknown>[] }
    const filters: Record<string, string> = { venue: v }
    if (from) filters.date_from = from
    if (to) filters.date_to = to
    const dateFilters: Record<string, string> = {}
    if (from) dateFilters.date_from = from
    if (to) dateFilters.date_to = to
    const [hearings, expertHearings, experts, expertsOpen, tasks] = await Promise.all([
      includeHearings
        ? invoke<{ rows: Record<string, unknown>[] }>('hearings:list', {
            page: 1,
            pageSize: 1000,
            print: true,
            filters
          })
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      includeExperts
        ? invoke<{ rows: Record<string, unknown>[] }>('hearings:list', {
            page: 1,
            pageSize: 1000,
            print: true,
            filters: { ...filters, hearing_kind: 'expert' }
          })
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      includeExperts
        ? invoke<{ rows: Record<string, unknown>[] }>('experts:list', {
            page: 1,
            pageSize: 1000,
            print: true,
            filters
          })
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      includeExperts
        ? invoke<{ rows: Record<string, unknown>[] }>('experts:list', {
            page: 1,
            pageSize: 1000,
            print: true,
            filters: dateFilters
          })
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      invoke<{ rows: Record<string, unknown>[] }>('tasks:list', {
        page: 1,
        pageSize: 1000,
        print: true,
        filters
      })
    ])
    const open = (r: Record<string, unknown>) =>
      String(r.status) !== 'done' && String(r.status) !== 'cancelled' && String(r.status) !== 'completed'
    const hRows = (hearings.rows || []).filter(open)
    const seen = new Set<string>()
    const venueNeedle = v.toLowerCase()
    const matchesVenue = (r: Record<string, unknown>) => {
      const blob = [r.venue, r.expert_office, r.court, r.court_name, r.session_place]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      if (blob.includes(venueNeedle)) return true
      return !String(r.venue || '').trim()
    }
    const expertRows = [...(experts.rows || []), ...(expertsOpen.rows || []).filter(matchesVenue), ...(expertHearings.rows || [])].filter(
      (r) => {
        if (!open(r)) return false
        const id = String(r.id || '')
        if (id && seen.has(id)) return false
        if (id) seen.add(id)
        return true
      }
    )
    const tRows = (tasks.rows || []).filter(
      (r) => String(r.status) !== 'completed' && String(r.status) !== 'cancelled'
    )
    const exec = tRows.filter((r) => String(r.work_kind || 'admin') === 'execution')
    const admin = tRows.filter((r) => String(r.work_kind || 'admin') !== 'execution')
    return { v, hRows, expertRows, admin, exec }
  }

  const printRows = async (
    v: string,
    hRows: Record<string, unknown>[],
    expertRows: Record<string, unknown>[],
    admin: Record<string, unknown>[],
    exec: Record<string, unknown>[]
  ) => {
    const range = [from, to].filter(Boolean).join(' — ')
    const subtitle = `${t('fields.venue')}: ${v}${range ? ` (${range})` : ''}`
    const hearingRoll = includeHearings
      ? hearingRollTableHtml(hRows, t, i18n.language, { emptyLabel: t('noData') })
      : null
    const fromTable = includeExperts
      ? expertRows.filter((r) => 'current_action' in r || 'previous_action' in r || r.expert_office != null)
      : []
    const fromHearings = includeExperts
      ? expertRows.filter((r) => !fromTable.includes(r)).map(asExpertRollRow)
      : []
    const expertBits = includeExperts
      ? [
          fromHearings.length
            ? hearingRollTableHtml(fromHearings, t, i18n.language, { emptyLabel: t('noData') }).html
            : '',
          expertRollTableHtml(fromTable, t, i18n.language, { emptyLabel: t('noData') }).html
        ].join('')
      : ''
    const adminRoll = taskRollTableHtml(admin, t, i18n.language, { emptyLabel: t('noData') })
    const execRoll = executionTasksRollTableHtml(exec, t, i18n.language, { emptyLabel: t('noData') })
    const body = `
        <h3 class="print-sub">${escPrint(subtitle)}</h3>
        ${hearingRoll ? `<h2>${escPrint(t('printVenue.hearings'))}</h2>${hearingRoll.html}` : ''}
        ${includeExperts ? `<h2>${escPrint(t('printVenue.experts'))}</h2>${expertBits}` : ''}
        <h2>${escPrint(t('nav.tasks'))}</h2>
        ${adminRoll.html}
        <h2>${escPrint(t('nav.execution'))}</h2>
        ${execRoll.html}`
    await sendPrint('report', `${t('printVenueSheet')} ${v}`, body, 'hearingsRoll')
  }

  const openPreview = async () => {
    const v = venue.trim()
    if (!v) return
    setBusy(true)
    try {
      const data = await loadRows()
      const items: PreviewRow[] = [
        ...data.hRows.map((row) => ({
          id: `h-${row.id}`,
          kind: 'hearing' as const,
          label: `${formatProgramCode(row)} — ${row.client_name || ''} / ${row.opponent_name || ''}`,
          row
        })),
        ...data.expertRows.map((row) => ({
          id: `x-${row.id}`,
          kind: 'expert' as const,
          label: `${EXPERT_MARK} ${row.expert_name || row.hearing_type || ''} — ${formatProgramCode(row)} — ${row.client_name || ''}`,
          row
        })),
        ...data.admin.map((row) => ({
          id: `a-${row.id}`,
          kind: 'admin' as const,
          label: `${row.description || row.title || ''} — ${formatProgramCode(row)}`,
          row
        })),
        ...data.exec.map((row) => ({
          id: `e-${row.id}`,
          kind: 'exec' as const,
          label: `${row.description || row.title || ''} — ${formatProgramCode(row)}`,
          row
        }))
      ]
      setHidden({})
      setPreview(items)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const printVisible = async () => {
    if (!preview) return
    const v = venue.trim()
    setBusy(true)
    try {
      const vis = preview.filter((p) => !hidden[p.id])
      await printRows(
        v,
        vis.filter((p) => p.kind === 'hearing').map((p) => p.row),
        vis.filter((p) => p.kind === 'expert').map((p) => p.row),
        vis.filter((p) => p.kind === 'admin').map((p) => p.row),
        vis.filter((p) => p.kind === 'exec').map((p) => p.row)
      )
      setPreview(null)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const printSheet = async () => {
    const v = venue.trim()
    if (!v) return
    setBusy(true)
    try {
      const data = await loadRows()
      await printRows(data.v, data.hRows, data.expertRows, data.admin, data.exec)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-44">
        <LookupCombo kind="venue" value={venue} onChange={setVenue} placeholder={t('fields.venue')} />
      </div>
      <DatePicker value={from} onChange={setFrom} />
      <DatePicker value={to} onChange={setTo} />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={includeHearings} onChange={(e) => setIncludeHearings(e.target.checked)} />
        {t('printVenue.hearings')}
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={includeExperts} onChange={(e) => setIncludeExperts(e.target.checked)} />
        {t('printVenue.experts')}
      </label>
      <Button type="button" variant="outline" disabled={busy || !venue.trim()} onClick={() => void openPreview()}>
        {t('printVenuePreview')}
      </Button>
      <Button type="button" variant="outline" disabled={busy || !venue.trim()} onClick={() => void printSheet()}>
        {t('printVenueSheet')}
      </Button>
      <Modal open={Boolean(preview)} wide title={t('printVenueSheet')} onClose={() => setPreview(null)}>
        <div className="max-h-[70vh] space-y-2 overflow-auto text-sm">
          {(preview || []).map((p) => (
            <label key={p.id} className="flex items-start gap-2 rounded border border-navy-100 px-2 py-1.5 dark:border-navy-700">
              <input
                type="checkbox"
                checked={!hidden[p.id]}
                onChange={(e) => setHidden((h) => ({ ...h, [p.id]: !e.target.checked }))}
              />
              <span>
                <span className="ms-1 text-xs text-navy-400">
                  {p.kind === 'hearing'
                    ? t('printVenue.hearings')
                    : p.kind === 'expert'
                      ? t('printVenue.experts')
                      : p.kind === 'exec'
                        ? t('nav.execution')
                        : t('nav.tasks')}
                </span>{' '}
                {p.label}
              </span>
            </label>
          ))}
          {!preview?.length ? <div className="py-6 text-center text-navy-400">{t('noData')}</div> : null}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(null)}>
            {t('cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void printVisible()}>
            {t('printSelected')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export function caseSheetHtml(row: Record<string, unknown>, t: (k: string) => string) {
  const cell = (k: string, v: unknown, html?: string) =>
    `<tr><th style="text-align:start;width:30%">${t(k)}</th><td>${html ?? String(v ?? '—')}</td></tr>`
  return `<h2>${t('printCaseSheet')}</h2>
    <table>
      ${cell('fields.court_number', '', courtNumberPrint(row))}
      ${cell('fields.client_id', row.client_name)}
      ${cell('fields.capacity_first', row.capacity_first)}
      ${cell('fields.opponent_name', row.opponent_name)}
      ${cell('fields.court', row.court)}
      ${cell('fields.circuit', row.circuit ?? row.circuit_number)}
      ${cell('fields.session_place', row.session_place)}
      ${cell('fields.lawyer_id', row.lawyer_name)}
      ${cell('fields.status', printVal('status', row.status, 'ar', t))}
    </table>`
}

export function caseInteriorHtml(
  row: Record<string, unknown>,
  t: (k: string) => string,
  lang: string
) {
  const withCase = (item: Record<string, unknown>) => ({
    ...row,
    ...item,
    case_title: item.case_title || row.title,
    title: item.title || row.title,
    client_name: item.client_name || row.client_name,
    opponent_name: item.opponent_name || row.opponent_name,
    court_name: item.court_name || item.court || row.court,
    case_type: item.case_type || item.case_type_name || row.case_type_name,
    case_subject: item.case_subject || item.case_title || row.title,
    system_code: item.system_code || formatProgramCode({ ...row, ...item }),
    circuit: item.circuit || row.circuit,
    case_type_name: item.case_type_name || row.case_type_name,
    first_instance_number: item.first_instance_number || row.first_instance_number,
    first_instance_year: item.first_instance_year || row.first_instance_year,
    appeal_number: item.appeal_number || row.appeal_number,
    appeal_year: item.appeal_year || row.appeal_year,
    cassation_number: item.cassation_number || row.cassation_number,
    cassation_year: item.cassation_year || row.cassation_year,
    extra_ref_type: item.extra_ref_type || row.extra_ref_type,
    extra_ref_number: item.extra_ref_number || row.extra_ref_number,
    extra_ref2_type: item.extra_ref2_type || row.extra_ref2_type,
    extra_ref2_number: item.extra_ref2_number || row.extra_ref2_number,
    extra_ref3_type: item.extra_ref3_type || row.extra_ref3_type,
    extra_ref3_number: item.extra_ref3_number || row.extra_ref3_number,
    client_capacity_first: item.client_capacity_first || row.capacity_first,
    client_capacity_appeal: item.client_capacity_appeal || row.capacity_appeal,
    client_capacity_cassation: item.client_capacity_cassation || row.capacity_cassation,
    opponent_capacity_first: item.opponent_capacity_first || row.opponent_capacity_first,
    opponent_capacity_appeal: item.opponent_capacity_appeal || row.opponent_capacity_appeal,
    opponent_capacity_cassation: item.opponent_capacity_cassation || row.opponent_capacity_cassation,
    opponent_address:
      item.opponent_address ||
      row.opponent_address ||
      ((row.opponents as { address?: string }[] | undefined) || []).find((o) => o.address)?.address
  })
  const hearings = (((row.hearings as Record<string, unknown>[]) || []) as Record<string, unknown>[]).map(withCase)
  const tasks = ((row.tasks as Record<string, unknown>[]) || [])
    .filter((tk) => String(tk.work_kind || 'admin') !== 'execution')
    .map(withCase)
  const experts = (
    ((row.expertHearings || row.expert_hearings) as Record<string, unknown>[] | undefined) || []
  ).map(withCase)
  const parties = labeledCell([
    { label: t('printKit.client'), value: String(row.client_name || '') },
    { label: t('printKit.opponent'), value: String(row.opponent_name || '') }
  ])
  return `
    <div class="program-code${isManualProgramCode(row) ? ' manual' : ''}">${escPrint(formatProgramCode(row) || '—')}</div>
    <div class="block-title">${escPrint(t('printKit.caseInterior'))}</div>
    <div class="kv">${parties}</div>
    <div class="kv"><b>${escPrint(t('fields.court_number'))}:</b> ${courtNumberPrint(row)}</div>
    <div class="kv"><b>${escPrint(t('fields.case_subject'))}:</b> ${escPrint(row.title || row.case_type_name || '')}</div>
    <div class="kv"><b>${escPrint(t('printKit.court'))}:</b> ${escPrint(row.court || '')} — <b>${escPrint(t('printKit.circuit'))}:</b> ${escPrint(row.circuit || '')}</div>
    <div class="kv"><b>${escPrint(t('fields.capacity_first'))}:</b> ${escPrint(row.capacity_first || '')} — <b>${escPrint(t('fields.status'))}:</b> ${escPrint(printVal('status', row.status, lang, t))}</div>
    <div class="kv"><b>${escPrint(t('fields.lawyer_id'))}:</b> ${escPrint(row.lawyer_name || '')}</div>
    <h2>${escPrint(t('printKit.courtHearings'))}</h2>
    ${hearingBlocksHtml(hearings, t, lang, { emptyLabel: t('noData') })}
    <h2>${escPrint(t('caseForm.expertHearings'))}</h2>
    ${expertRollTableHtml(experts, t, lang, { emptyLabel: t('noData') }).html}
    <h2>${escPrint(t('printKit.adminWork'))}</h2>
    ${taskBlocksHtml(tasks, t, lang, { emptyLabel: t('noData') })}
  `
}
