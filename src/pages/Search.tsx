import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CASE_STATUSES } from '@shared/types'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, PageHeader, Select, StatusBadge } from '../components/ui'
import { DatePicker } from '../components/DateTimePicker'
import { EntitySelect } from '../components/EntitySelect'

export function SearchPage() {
  const { t } = useTranslation()
  const { toast, setPage } = useApp()
  const [filters, setFilters] = useState({
    q: '',
    scope: 'cases',
    office_case_number: '',
    client_name: '',
    opponent_name: '',
    case_type_id: '',
    status: '',
    lawyer_id: '',
    hearing_from: '',
    hearing_to: ''
  })
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  const run = async () => {
    try {
      const data = await invoke<Record<string, unknown>[]>('search:advanced', {
        q: filters.q || undefined,
        scope: filters.scope || undefined,
        office_case_number: filters.office_case_number || undefined,
        client_name: filters.client_name || undefined,
        opponent_name: filters.opponent_name || undefined,
        case_type_id: filters.case_type_id || undefined,
        status: filters.status || undefined,
        lawyer_id: filters.lawyer_id || undefined,
        hearing_from: filters.hearing_from || undefined,
        hearing_to: filters.hearing_to || undefined
      })
      setRows(data)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const kind = (r: Record<string, unknown>) => String(r.result_kind || filters.scope || 'case')

  return (
    <div className="space-y-4">
      <PageHeader title={t('searchPage.title')} />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['cases', 'hearings', 'admin'] as const).map((s) => (
            <Button key={s} type="button" variant={filters.scope === s ? 'primary' : 'outline'} onClick={() => setFilters({ ...filters, scope: s })}>
              {s === 'cases' ? t('nav.cases') : s === 'hearings' ? t('nav.hearings') : t('caseForm.adminWork')}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t('searchPage.query')}>
            <input
              className="w-full rounded border px-2 py-2 dark:bg-navy-800"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder={t('searchPage.queryHint')}
            />
          </Field>
          <Field label={t('fields.court_number')}>
            <input
              className="w-full rounded border px-2 py-2 dark:bg-navy-800"
              dir="ltr"
              value={filters.office_case_number}
              onChange={(e) => setFilters({ ...filters, office_case_number: e.target.value })}
            />
          </Field>
          <Field label={t('fields.client_name')}>
            <input
              className="w-full rounded border px-2 py-2 dark:bg-navy-800"
              value={filters.client_name}
              onChange={(e) => setFilters({ ...filters, client_name: e.target.value })}
            />
          </Field>
          <Field label={t('fields.opponent_name')}>
            <input
              className="w-full rounded border px-2 py-2 dark:bg-navy-800"
              value={filters.opponent_name}
              onChange={(e) => setFilters({ ...filters, opponent_name: e.target.value })}
            />
          </Field>
          <Field label={t('searchPage.caseType')}>
            <EntitySelect
              kind="caseTypes"
              value={filters.case_type_id}
              onChange={(v) => setFilters({ ...filters, case_type_id: v })}
            />
          </Field>
          <Field label={t('searchPage.status')}>
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">—</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('searchPage.lawyer')}>
            <EntitySelect
              kind="lawyers"
              value={filters.lawyer_id}
              onChange={(v) => setFilters({ ...filters, lawyer_id: v })}
            />
          </Field>
          <Field label={t('searchPage.hearingFrom')}>
            <DatePicker value={filters.hearing_from} onChange={(d) => setFilters({ ...filters, hearing_from: d })} />
          </Field>
          <Field label={t('searchPage.hearingTo')}>
            <DatePicker value={filters.hearing_to} onChange={(d) => setFilters({ ...filters, hearing_to: d })} />
          </Field>
        </div>
        <Button className="mt-3" onClick={run}>
          {t('searchPage.run')}
        </Button>
      </Card>
      <Card>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-start">{t('fields.case_number')}</th>
              <th className="px-3 py-2 text-start">{t('fields.court_number')}</th>
              <th className="px-3 py-2 text-start">{t('fields.title')}</th>
              <th className="px-3 py-2 text-start">{t('fields.client_name')}</th>
              <th className="px-3 py-2 text-start">{t('fields.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-navy-400">
                  {t('noData')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const k = kind(r)
              const caseId = String(r.case_id || (k === 'case' ? r.id : '') || '')
              return (
                <tr
                  key={`${k}-${String(r.id)}`}
                  className="cursor-pointer border-t hover:bg-navy-50/60 dark:hover:bg-navy-800/60"
                  onClick={() => {
                    if (k === 'hearing' && r.case_id) setPage('caseProfile', { id: r.case_id })
                    else if (k === 'admin' && r.case_id) setPage('caseProfile', { id: r.case_id })
                    else if (r.id && (k === 'case' || !k)) setPage('caseProfile', { id: r.id })
                    else if (caseId) setPage('caseProfile', { id: caseId })
                  }}
                >
                  <td className="px-3 py-2">{String(r.case_number || '')}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {String(r.office_case_number || '')}
                  </td>
                  <td className="px-3 py-2">{String(r.title || r.case_title || r.description || '')}</td>
                  <td className="px-3 py-2">{String(r.client_name || '')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={String(r.status || '')} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
