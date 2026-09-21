import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Textarea } from './ui'
import { LookupCombo } from './LookupCombo'
import { invoke } from '../lib/api'
import { formatPoliceStation } from '../lib/courtNumber'

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
  const [opp, setOpp] = useState({ name: '', address: '', phone: '' })
  const kind = String(form.execution_kind || '')
  const criminal = workKind === 'execution' && /جنائي|criminal/i.test(kind)

  useEffect(() => {
    const caseId = String(form.case_id || '')
    if (!caseId) {
      setOpp({ name: '', address: '', phone: '' })
      return
    }
    invoke<Record<string, unknown>>('cases:get', caseId)
      .then((row) => {
        const clientId = String(row.client_id || '')
        if (clientId) setField('client_id', clientId)
        if (workKind !== 'execution') return
        const opps = (row.opponents as { full_name?: string; address?: string; phone?: string }[]) || []
        const primary = opps[0]
        const name = String(row.opponent_name || primary?.full_name || '')
        const address = String(primary?.address || row.opponent_address || '')
        const phone = String(primary?.phone || row.opponent_phone || '')
        setOpp({ name, address, phone })
        if (!String(form.police_station || '') && row.police_station) {
          setField('police_station', formatPoliceStation(row.police_station))
        }
        if (!String(form.judgment_date || '') && row.judgment_date) {
          setField('judgment_date', String(row.judgment_date))
        }
        if (!String(form.judgment_text || '') && row.judgment_text) {
          setField('judgment_text', String(row.judgment_text))
        }
        if (!String(form.opponent_address || '') && address && !address.includes('****')) setField('opponent_address', address)
        if (!String(form.opponent_phone || '') && phone && !phone.includes('****')) setField('opponent_phone', phone)
        if (!String(form.venue || '') && row.court) setField('venue', String(row.court))
      })
      .catch(() => setOpp({ name: '', address: '', phone: '' }))
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
      <Field label={t('fields.execution_action')} required>
        <LookupCombo
          kind="execution_action"
          value={String(form.description || '')}
          onChange={(v) => setField('description', v)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {criminal ? (
          <>
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
          </>
        ) : null}
        <div className="w-[10rem]">
          <Field label={t('fields.execution_number')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.execution_number || '')}
              onChange={(e) => setField('execution_number', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.police_station')}>
            <LookupCombo
              kind="police_station"
              value={String(form.police_station || '')}
              onChange={(v) => setField('police_station', formatPoliceStation(v) || v)}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.venue')}>
            <LookupCombo kind="venue" value={String(form.venue || '')} onChange={(v) => setField('venue', v)} />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.execution_officer')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.execution_officer || '')}
              onChange={(e) => setField('execution_officer', e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[12rem] flex-1">
          <Field label={t('fields.opponent_name')}>
            <input className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-50" readOnly value={opp.name} />
          </Field>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Field label={t('fields.address')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              value={String(form.opponent_address || '')}
              onChange={(e) => setField('opponent_address', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.opponent_phone')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              dir="ltr"
              value={String(form.opponent_phone || '')}
              onChange={(e) => setField('opponent_phone', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-[12rem]">
          <Field label={t('fields.judgment_date')}>
            <input
              className="h-9 w-full rounded border px-2 text-sm dark:bg-navy-900"
              type="date"
              value={String(form.judgment_date || '')}
              onChange={(e) => setField('judgment_date', e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label={t('fields.judgment_text')}>
        <Textarea
          rows={4}
          value={String(form.judgment_text || '')}
          onChange={(e) => setField('judgment_text', e.target.value)}
        />
      </Field>
      <Field label={t('fields.notes')}>
        <Textarea rows={3} value={String(form.notes || '')} onChange={(e) => setField('notes', e.target.value)} />
      </Field>
    </div>
  )
}
