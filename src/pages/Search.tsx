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
        case_type_id: filters.case_type_id ? Number(filters.case_type_id) : undefined,
        status: filters.status || undefined,
        lawyer_id: filters.lawyer_id ? Number(filters.lawyer_id) : undefined,
        hearing_from: filters.hearing_from || undefined,
        hearing_to: filters.hearing_to || undefined
      })
      setRows(data)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('searchPage.title')} />
      <Card>
        <div className="grid gap-3 md:grid-cols-5">
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
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-start">{t('fields.case_number')}</th>
              <th className="px-3 py-2 text-start">{t('fields.title')}</th>
              <th className="px-3 py-2 text-start">{t('fields.client_name')}</th>
              <th className="px-3 py-2 text-start">{t('fields.status')}</th>
              <th className="px-3 py-2 text-start">{t('fields.lawyer_id')}</th>
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
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t">
                <td className="min-w-0 px-3 py-2 text-start align-middle">
                  <button className="text-navy-800 underline" onClick={() => setPage('caseProfile', { id: r.id })}>
                    {String(r.case_number)}
                  </button>
                </td>
                <td className="min-w-0 px-3 py-2 text-start align-middle">{String(r.title)}</td>
                <td className="min-w-0 px-3 py-2 text-start align-middle">{String(r.client_name)}</td>
                <td className="min-w-0 px-3 py-2 text-start align-middle">
                  <StatusBadge value={String(r.status)} />
                </td>
                <td className="min-w-0 px-3 py-2 text-start align-middle">{String(r.lawyer_name ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
