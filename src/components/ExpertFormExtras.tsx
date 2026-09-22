import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Field } from './ui'
import { LookupCombo } from './LookupCombo'
import { DatePicker, TimePicker } from './DateTimePicker'
import type { SetField } from './CrudPage'
import { invoke } from '../lib/api'

export function ExpertFormExtras({
  form,
  setField
}: {
  form: Record<string, unknown>
  setField: SetField
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const caseId = String(form.case_id || '')
    if (!caseId) return
    invoke<Record<string, unknown>>('cases:get', caseId)
      .then((row) => {
        const opps = (row.opponents as { full_name?: string }[]) || []
        setField('client_name', String(row.client_name || ''))
        setField('opponent_name', String(row.opponent_name || opps[0]?.full_name || ''))
        setField('hearing_court', String(row.court || ''))
        if (!String(form.venue || '') && row.court) setField('venue', String(row.court))
      })
      .catch(() => undefined)
  }, [form.case_id])

  return (
    <div className="mb-2 space-y-2">
      {form.client_name || form.opponent_name ? (
        <div className="rounded-md border border-navy-100 px-2 py-1.5 text-sm dark:border-navy-700">
          <span className="font-semibold">{t('fields.parties')}: </span>
          {[form.client_name, form.opponent_name].filter(Boolean).join(' / ') || '—'}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[9.5rem]">
          <Field label={t('fields.hearing_date')} required>
            <DatePicker value={String(form.hearing_date || '')} onChange={(iso) => setField('hearing_date', iso)} />
          </Field>
        </div>
        <div className="w-[7rem]">
          <Field label={t('fields.hearing_time')}>
            <TimePicker value={String(form.hearing_time || '')} onChange={(hhmm) => setField('hearing_time', hhmm)} />
          </Field>
        </div>
        <div className="w-[8rem]">
          <Field label={t('fields.venue')}>
            <LookupCombo kind="venue" value={String(form.venue || '')} onChange={(v) => setField('venue', v)} />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.expert_office')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.expert_office || '')}
              onChange={(e) => setField('expert_office', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.expert_name')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.expert_name || '')}
              onChange={(e) => setField('expert_name', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[6rem]">
          <Field label={t('fields.floor')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.floor || '')}
              onChange={(e) => setField('floor', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[6rem]">
          <Field label={t('fields.hall')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.hall || '')}
              onChange={(e) => setField('hall', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
