import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, Button } from './ui'
import { LookupCombo } from './LookupCombo'
import { DatePicker } from './DateTimePicker'

type Proc = { title: string; due_date: string }

export function HearingFormExtras({
  form,
  setField
}: {
  form: Record<string, unknown>
  setField: (name: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const typeVal = String(form.hearing_type || '')
  const typeSize = typeVal.length > 14 ? 11 : typeVal.length > 10 ? 12 : 14
  const procs = ((form.upcoming_procedures as Proc[]) || []).filter((p) => p)
  const [draft, setDraft] = useState({ title: '', due_date: '' })

  const addProc = () => {
    if (!draft.title.trim()) return
    setField('upcoming_procedures', [...procs, { title: draft.title.trim(), due_date: draft.due_date }])
    setDraft({ title: '', due_date: '' })
  }

  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[9.5rem]">
          <Field label={t('fields.hearing_date')} required>
            <DatePicker value={String(form.hearing_date || '')} onChange={(iso) => setField('hearing_date', iso)} />
          </Field>
        </div>
        <div className="w-[8.5rem]">
          <Field label={t('fields.hearing_type')}>
            <LookupCombo
              kind="hearing_type"
              value={typeVal}
              onChange={(v) => setField('hearing_type', v)}
              style={{ fontSize: typeSize }}
            />
          </Field>
        </div>
        <div className="w-[8rem]">
          <Field label={t('fields.venue')}>
            <LookupCombo kind="venue" value={String(form.venue || '')} onChange={(v) => setField('venue', v)} />
          </Field>
        </div>
        <div className="w-[5.5rem]">
          <Field label={t('fields.hall')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.hall || '')}
              onChange={(e) => setField('hall', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[5.5rem]">
          <Field label={t('fields.floor')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.floor || '')}
              onChange={(e) => setField('floor', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[9.5rem]">
          <Field label={t('fields.next_hearing_date')}>
            <DatePicker
              value={String(form.next_hearing_date || '')}
              onChange={(iso) => setField('next_hearing_date', iso)}
            />
          </Field>
        </div>
      </div>
      <div className="rounded-md border border-navy-100 p-2 dark:border-navy-700">
        <div className="mb-1 text-sm font-bold">{t('caseForm.upcomingProcedures')}</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <Field label={t('caseForm.newAdminAction')}>
              <LookupCombo kind="admin_action" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
            </Field>
          </div>
          <div className="w-[9.5rem]">
            <Field label={t('fields.due_date')}>
              <DatePicker value={draft.due_date} onChange={(iso) => setDraft({ ...draft, due_date: iso })} />
            </Field>
          </div>
          <Button type="button" variant="outline" onClick={addProc}>
            {t('add')}
          </Button>
        </div>
        {procs.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {procs.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded bg-navy-50 px-2 py-1 dark:bg-navy-800">
                <span>
                  {p.title}
                  {p.due_date ? ` — ${p.due_date}` : ''}
                </span>
                <button
                  type="button"
                  className="text-navy-400 hover:text-red-600"
                  onClick={() => setField('upcoming_procedures', procs.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
