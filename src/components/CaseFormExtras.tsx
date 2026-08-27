import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input } from './ui'
import { EntitySelect } from './EntitySelect'
import { LookupCombo } from './LookupCombo'

type ExtraClient = {
  client_id: string
  capacity_first: string
  capacity_appeal: string
  capacity_cassation: string
}
type ExtraOpp = { opponent_id: string; full_name: string; lawyer_name: string; lawyer_phone: string }

export function CaseFormExtras({
  form,
  setField
}: {
  form: Record<string, unknown>
  setField: (name: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [quick, setQuick] = useState({ full_name: '', national_id: '', client_type: 'individual' })
  const extras = (form.extra_clients as ExtraClient[]) || []
  const opps =
    (form.extra_opponents as ExtraOpp[]) || []
  const shownOpps =
    opps.length > 0 ? opps : [{ opponent_id: '', full_name: '', lawyer_name: '', lawyer_phone: '' }]

  const addClient = () =>
    setField('extra_clients', [
      ...extras,
      { client_id: '', capacity_first: '', capacity_appeal: '', capacity_cassation: '' }
    ])
  const addOpp = () => setField('extra_opponents', [...shownOpps, { opponent_id: '', full_name: '', lawyer_name: '', lawyer_phone: '' }])

  const createInline = async () => {
    if (!quick.full_name.trim()) return
    try {
      const created = await invoke<{ id: string }>('clients:create', {
        full_name: quick.full_name,
        national_id: quick.national_id || (quick.client_type === 'company' ? '***' : ''),
        client_type: quick.client_type
      })
      setField('client_id', created.id)
      setField('__quick_client', false)
      setQuick({ full_name: '', national_id: '', client_type: 'individual' })
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-4">
      {form.__quick_client ? (
      <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
        <div className="mb-2 text-sm font-bold">{t('caseForm.newClientInline')}</div>
        <div className="grid gap-2 md:grid-cols-4">
          <Input
            placeholder={t('fields.full_name')}
            value={quick.full_name}
            onChange={(e) => setQuick({ ...quick, full_name: e.target.value })}
          />
          <Input
            placeholder={t('fields.national_id')}
            value={quick.national_id}
            onChange={(e) => setQuick({ ...quick, national_id: e.target.value })}
          />
          <select
            className="rounded border px-2 py-2 dark:bg-navy-800"
            value={quick.client_type}
            onChange={(e) => setQuick({ ...quick, client_type: e.target.value })}
          >
            <option value="individual">{t('status.individual')}</option>
            <option value="company">{t('status.company')}</option>
            <option value="institution">{t('status.institution')}</option>
          </select>
          <Button type="button" variant="outline" onClick={() => createInline()}>
            {t('caseForm.createClient')}
          </Button>
        </div>
      </div>
      ) : null}

      <Field label={t('fields.capacity_first')}>
        <LookupCombo
          kind="capacity"
          value={String(form.capacity_first || '')}
          onChange={(v) => setField('capacity_first', v)}
        />
      </Field>
      <Field label={t('fields.capacity_appeal')}>
        <LookupCombo
          kind="capacity"
          value={String(form.capacity_appeal || '')}
          onChange={(v) => setField('capacity_appeal', v)}
        />
      </Field>
      <Field label={t('fields.capacity_cassation')}>
        <LookupCombo
          kind="capacity"
          value={String(form.capacity_cassation || '')}
          onChange={(v) => setField('capacity_cassation', v)}
        />
      </Field>

      <div className="flex items-center justify-between">
        <div className="font-bold">{t('caseForm.moreClients')}</div>
        <Button type="button" variant="outline" onClick={addClient}>
          {t('add')}
        </Button>
      </div>
      {extras.map((row, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-4">
          <EntitySelect
            kind="clients"
            value={row.client_id}
            onChange={(v) => {
              const next = [...extras]
              next[i] = { ...row, client_id: v }
              setField('extra_clients', next)
            }}
          />
          <LookupCombo
            kind="capacity"
            value={row.capacity_first}
            onChange={(v) => {
              const next = [...extras]
              next[i] = { ...row, capacity_first: v }
              setField('extra_clients', next)
            }}
            placeholder={t('fields.capacity_first')}
          />
          <LookupCombo
            kind="capacity"
            value={row.capacity_appeal}
            onChange={(v) => {
              const next = [...extras]
              next[i] = { ...row, capacity_appeal: v }
              setField('extra_clients', next)
            }}
            placeholder={t('fields.capacity_appeal')}
          />
          <LookupCombo
            kind="capacity"
            value={row.capacity_cassation}
            onChange={(v) => {
              const next = [...extras]
              next[i] = { ...row, capacity_cassation: v }
              setField('extra_clients', next)
            }}
            placeholder={t('fields.capacity_cassation')}
          />
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="font-bold">{t('caseForm.moreOpponents')}</div>
        <Button type="button" variant="outline" onClick={addOpp}>
          {t('add')}
        </Button>
      </div>
      {shownOpps.map((row, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-4">
          <EntitySelect
            kind="opponents"
            value={row.opponent_id}
            onChange={(v) => {
              const next = [...shownOpps]
              next[i] = { ...row, opponent_id: v }
              setField('extra_opponents', next)
            }}
          />
          <Input
            placeholder={t('fields.full_name')}
            value={row.full_name}
            onChange={(e) => {
              const next = [...shownOpps]
              next[i] = { ...row, full_name: e.target.value }
              setField('extra_opponents', next)
            }}
          />
          <Input
            placeholder={t('fields.lawyer_name')}
            value={row.lawyer_name}
            onChange={(e) => {
              const next = [...shownOpps]
              next[i] = { ...row, lawyer_name: e.target.value }
              setField('extra_opponents', next)
            }}
          />
          <Input
            placeholder={t('fields.lawyer_phone')}
            value={row.lawyer_phone}
            onChange={(e) => {
              const next = [...shownOpps]
              next[i] = { ...row, lawyer_phone: e.target.value }
              setField('extra_opponents', next)
            }}
          />
        </div>
      ))}
    </div>
  )
}
