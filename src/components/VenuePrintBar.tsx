import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Button } from './ui'
import { LookupCombo } from './LookupCombo'
import { DatePicker } from './DateTimePicker'
import { formatCourtNumber, formatProgramCode } from '../lib/courtNumber'
import {
  executionBlocksHtml,
  hearingBlocksHtml,
  escPrint,
  labeledCell,
  sendPrint,
  taskBlocksHtml
} from '../lib/printKit'

export function VenuePrintBar({ toast }: { toast: (msg: string, type?: 'ok' | 'err') => void }) {
  const { t, i18n } = useTranslation()
  const [venue, setVenue] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const printSheet = async () => {
    const v = venue.trim()
    if (!v) return
    setBusy(true)
    try {
      const filters: Record<string, string> = { venue: v }
      if (from) filters.date_from = from
      if (to) filters.date_to = to
      const [hearings, tasks] = await Promise.all([
        invoke<{ rows: Record<string, unknown>[] }>('hearings:list', {
          page: 1,
          pageSize: 1000,
          print: true,
          filters
        }),
        invoke<{ rows: Record<string, unknown>[] }>('tasks:list', {
          page: 1,
          pageSize: 1000,
          print: true,
          filters
        })
      ])
      const hRows = (hearings.rows || []).filter((r) => String(r.status) !== 'done' && String(r.status) !== 'cancelled')
      const tRows = (tasks.rows || []).filter(
        (r) => String(r.status) !== 'completed' && String(r.status) !== 'cancelled'
      )
      const exec = tRows.filter((r) => String(r.work_kind || 'admin') === 'execution')
      const admin = tRows.filter((r) => String(r.work_kind || 'admin') !== 'execution')
      const range = [from, to].filter(Boolean).join(' — ')
      const subtitle = `${t('fields.venue')}: ${v}${range ? ` (${range})` : ''}`
      const body = `
        <h3 class="print-sub">${escPrint(subtitle)}</h3>
        <h2>${escPrint(t('nav.hearings'))}</h2>
        ${hearingBlocksHtml(hRows, t, i18n.language, { emptyLabel: t('noData') })}
        <h2>${escPrint(t('nav.tasks'))}</h2>
        ${taskBlocksHtml(admin, t, i18n.language, { emptyLabel: t('noData') })}
        <h2>${escPrint(t('nav.execution'))}</h2>
        ${executionBlocksHtml(exec, t, i18n.language, { emptyLabel: t('noData') })}`
      await sendPrint('report', `${t('printVenueSheet')} ${v}`, body)
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
      <Button type="button" variant="outline" disabled={busy || !venue.trim()} onClick={() => printSheet()}>
        {t('printVenueSheet')}
      </Button>
    </div>
  )
}

export function caseSheetHtml(row: Record<string, unknown>, t: (k: string) => string) {
  const cell = (k: string, v: unknown) =>
    `<tr><th style="text-align:start;width:30%">${t(k)}</th><td>${String(v ?? '—')}</td></tr>`
  return `<h2>${t('printCaseSheet')}</h2>
    <table>
      ${cell('fields.court_number', formatCourtNumber(row))}
      ${cell('fields.client_id', row.client_name)}
      ${cell('fields.capacity_first', row.capacity_first)}
      ${cell('fields.opponent_name', row.opponent_name)}
      ${cell('fields.court', row.court)}
      ${cell('fields.circuit', row.circuit ?? row.circuit_number)}
      ${cell('fields.session_place', row.session_place)}
      ${cell('fields.lawyer_id', row.lawyer_name)}
      ${cell('fields.status', row.status)}
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
  const parties = labeledCell([
    { label: t('printKit.client'), value: String(row.client_name || '') },
    { label: t('printKit.opponent'), value: String(row.opponent_name || '') }
  ])
  return `
    <div class="program-code">${escPrint(formatProgramCode(row) || '—')}</div>
    <div class="block-title">${escPrint(t('printKit.caseInterior'))}</div>
    <div class="kv">${parties}</div>
    <div class="kv"><b>${escPrint(t('fields.court_number'))}:</b> ${escPrint(formatCourtNumber(row))}</div>
    <div class="kv"><b>${escPrint(t('fields.case_subject'))}:</b> ${escPrint(row.title || row.case_type_name || '')}</div>
    <div class="kv"><b>${escPrint(t('printKit.court'))}:</b> ${escPrint(row.court || '')} — <b>${escPrint(t('printKit.circuit'))}:</b> ${escPrint(row.circuit || '')}</div>
    <div class="kv"><b>${escPrint(t('fields.capacity_first'))}:</b> ${escPrint(row.capacity_first || '')} — <b>${escPrint(t('fields.status'))}:</b> ${escPrint(row.status || '')}</div>
    <div class="kv"><b>${escPrint(t('fields.lawyer_id'))}:</b> ${escPrint(row.lawyer_name || '')}</div>
    <h2>${escPrint(t('printKit.courtHearings'))}</h2>
    ${hearingBlocksHtml(hearings, t, lang, { emptyLabel: t('noData') })}
    <h2>${escPrint(t('printKit.adminWork'))}</h2>
    ${taskBlocksHtml(tasks, t, lang, { emptyLabel: t('noData') })}
  `
}
