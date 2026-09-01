import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Button } from './ui'
import { LookupCombo } from './LookupCombo'
import { DatePicker } from './DateTimePicker'
import { formatCourtNumber, formatProgramCode } from '../lib/courtNumber'

export function VenuePrintBar({ toast }: { toast: (msg: string, type?: 'ok' | 'err') => void }) {
  const { t } = useTranslation()
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
      const ht = (r: Record<string, unknown>) =>
        `<tr><td>${String(r.hearing_date ?? '')}</td><td>${String(r.case_number ?? '')}</td><td>${String(r.client_name ?? '')}</td><td>${String(r.hearing_type ?? '')}</td><td>${String(r.hall ?? '')} / ${String(r.floor ?? '')}</td><td>${String(r.court_decision ?? r.previous_decision ?? '')}</td></tr>`
      const tt = (r: Record<string, unknown>) =>
        `<tr><td>${String(r.due_date ?? '')}</td><td>${String(r.case_number ?? '')}</td><td>${String(r.client_name ?? '')}</td><td>${String(r.title ?? '')}</td><td>${String(r.description ?? '')}</td><td>${String(r.assignee_name ?? '')}</td></tr>`
      const range = [from, to].filter(Boolean).join(' — ')
      const body = `
        <h2>${t('printVenueSheet')} — ${v}${range ? ` (${range})` : ''}</h2>
        <h3>${t('nav.hearings')}</h3>
        <table><thead><tr><th>${t('fields.hearing_date')}</th><th>${t('fields.case_number')}</th><th>${t('fields.client_name')}</th><th>${t('fields.hearing_type')}</th><th>${t('fields.hall')}</th><th>${t('fields.court_decision')}</th></tr></thead>
        <tbody>${hRows.map(ht).join('') || `<tr><td colspan="6">${t('noData')}</td></tr>`}</tbody></table>
        <h3>${t('nav.tasks')}</h3>
        <table><thead><tr><th>${t('fields.due_date')}</th><th>${t('fields.case_number')}</th><th>${t('fields.client_name')}</th><th>${t('fields.title')}</th><th>${t('fields.description')}</th><th>${t('fields.assignee_name')}</th></tr></thead>
        <tbody>${tRows.map(tt).join('') || `<tr><td colspan="6">${t('noData')}</td></tr>`}</tbody></table>`
      await invoke('print:print', 'report', `${t('printVenueSheet')} ${v}`, body)
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
  const cell = (k: string, v: unknown) => `<tr><th style="text-align:start;width:30%">${t(k)}</th><td>${String(v ?? '—')}</td></tr>`
  return `<h2>${t('printCaseSheet')} ${formatProgramCode(row)}</h2>
    <table>
      ${cell('fields.program_code', formatProgramCode(row))}
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
