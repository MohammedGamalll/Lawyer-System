import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field } from './ui'
import { LookupCombo } from './LookupCombo'
import { invoke } from '../lib/api'

export function TaskFormExtras({
  form,
  setField,
  workKind
}: {
  form: Record<string, unknown>
  setField: (name: string, value: unknown) => void
  workKind: string
}) {
  const { t } = useTranslation()
  const [opp, setOpp] = useState({ name: '', address: '' })
  const kind = String(form.execution_kind || '')
  const criminal = workKind === 'execution' && /جنائي|criminal/i.test(kind)

  useEffect(() => {
    const caseId = String(form.case_id || '')
    if (workKind !== 'execution' || !caseId) {
      setOpp({ name: '', address: '' })
      return
    }
    invoke<Record<string, unknown>>('cases:get', caseId)
      .then((row) => {
        const opps = (row.opponents as { full_name?: string; address?: string }[]) || []
        const primary = opps[0]
        setOpp({
          name: String(row.opponent_name || primary?.full_name || ''),
          address: String(primary?.address || '')
        })
        if (!String(form.police_station || '') && row.police_station) {
          setField('police_station', String(row.police_station))
        }
      })
      .catch(() => setOpp({ name: '', address: '' }))
  }, [form.case_id, workKind])

  if (workKind !== 'execution') return null

  return (
    <div className="mb-2 space-y-2">
      <Field label={t('fields.execution_kind')}>
        <div className="flex flex-wrap gap-2">
          {(['مدني', 'جنائي'] as const).map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={kind === opt ? 'primary' : 'outline'}
              onClick={() => setField('execution_kind', opt)}
            >
              {opt === 'مدني' ? t('status.civil') : t('status.criminal')}
            </Button>
          ))}
        </div>
      </Field>
      {criminal ? (
        <div className="flex flex-wrap gap-2">
          <div className="w-[10rem]">
            <Field label={t('fields.police_report_kind')}>
              <LookupCombo
                kind="police_report_kind"
                value={String(form.police_report_kind || '')}
                onChange={(v) => setField('police_report_kind', v)}
              />
            </Field>
          </div>
          <div className="w-[10rem]">
            <Field label={t('fields.police_report_no')}>
              <input
                className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
                dir="ltr"
                value={String(form.police_report_no || '')}
                onChange={(e) => setField('police_report_no', e.target.value)}
              />
            </Field>
          </div>
          <div className="w-[12rem]">
            <Field label={t('fields.police_station')}>
              <LookupCombo
                kind="police_station"
                value={String(form.police_station || '')}
                onChange={(v) => setField('police_station', v)}
              />
            </Field>
          </div>
          <div className="min-w-[12rem] flex-1">
            <Field label={t('fields.opponent_name')}>
              <input className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-50" readOnly value={opp.name} />
            </Field>
          </div>
          <div className="min-w-[12rem] flex-1">
            <Field label={t('fields.address')}>
              <input className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-50" readOnly value={opp.address} />
            </Field>
          </div>
        </div>
      ) : null}
      <div className="w-[12rem]">
        <Field label={t('fields.venue')}>
          <LookupCombo kind="venue" value={String(form.venue || '')} onChange={(v) => setField('venue', v)} />
        </Field>
      </div>
    </div>
  )
}
