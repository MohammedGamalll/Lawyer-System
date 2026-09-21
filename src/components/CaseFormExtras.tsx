import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { ApiError } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Select } from './ui'
import { DatePicker } from './DateTimePicker'
import { EntitySelect } from './EntitySelect'
import { LookupCombo } from './LookupCombo'
import { SimilarClientModal } from './SimilarClientModal'
import type { LookupOption } from '../lib/lookups'
import { displayClientCode } from '../lib/courtNumber'

type ExtraClient = {
  client_id: string
  capacity_first: string
  capacity_appeal: string
  capacity_cassation: string
}
type ExtraOpp = {
  opponent_id: string
  full_name: string
  lawyer_name: string
  lawyer_phone: string
  capacity_first: string
  capacity_appeal: string
  capacity_cassation: string
}

type Snap = {
  national_id?: string
  address?: string
  phone?: string
  phone2?: string
  nickname?: string
  full_name?: string
  is_blacklisted?: number
}

const emptyClient = (): ExtraClient => ({
  client_id: '',
  capacity_first: '',
  capacity_appeal: '',
  capacity_cassation: ''
})
const emptyOpp = (): ExtraOpp => ({
  opponent_id: '',
  full_name: '',
  lawyer_name: '',
  lawyer_phone: '',
  capacity_first: '',
  capacity_appeal: '',
  capacity_cassation: ''
})

function ContactSnap({ id, kind }: { id: string; kind: 'clients' | 'opponents' }) {
  const { t } = useTranslation()
  const [snap, setSnap] = useState<Snap | null>(null)
  useEffect(() => {
    if (!id) {
      setSnap(null)
      return
    }
    const channel = kind === 'clients' ? 'clients:get' : 'opponents:get'
    invoke<Record<string, unknown>>(channel, id)
      .then((raw) => {
        const nested = raw.opponent as Snap | undefined
        const c = nested && typeof nested === 'object' ? nested : (raw as Snap)
        setSnap({
          national_id: c.national_id,
          address: c.address,
          phone: c.phone,
          phone2: c.phone2,
          nickname: (c as Snap).nickname,
          full_name: c.full_name,
          is_blacklisted: Number(c.is_blacklisted || 0)
        })
      })
      .catch(() => setSnap(null))
  }, [id, kind])
  return (
    <div className="space-y-1.5">
      {Number(snap?.is_blacklisted) ? (
        <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {t('party.blacklistPick', { name: snap?.full_name || snap?.nickname || '' })}
        </div>
      ) : null}
    <div className="flex flex-wrap gap-1.5 text-xs">
      <div className="max-w-full" style={{ width: '14ch' }}>
      <Field label={t('fields.nickname')}>
        <Input readOnly value={snap?.nickname || '—'} className="h-8 bg-navy-50" />
      </Field>
      </div>
      <div className="max-w-full" style={{ width: '16ch' }}>
      <Field label={t('fields.national_id')}>
        <Input readOnly value={snap?.national_id || '—'} className="h-8 bg-navy-50" />
      </Field>
      </div>
      <div className="min-w-[12rem] flex-1">
      <Field label={t('fields.address')}>
        <Input readOnly value={snap?.address || '—'} className="h-8 overflow-x-auto bg-navy-50" />
      </Field>
      </div>
      <div className="max-w-full" style={{ width: '16ch' }}>
      <Field label={t('fields.phone')}>
        <Input readOnly dir="ltr" value={snap?.phone || snap?.phone2 || '—'} className="h-8 bg-navy-50" />
      </Field>
      </div>
    </div>
    </div>
  )
}

function CapsInline({
  first,
  appeal,
  cassation,
  onFirst,
  onAppeal,
  onCassation
}: {
  first: string
  appeal: string
  cassation: string
  onFirst: (v: string) => void
  onAppeal: (v: string) => void
  onCassation: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="w-[8.5rem] shrink-0">
        <Field label={t('fields.capacity_first')}>
          <LookupCombo kind="capacity" value={first} onChange={onFirst} />
        </Field>
      </div>
      <div className="w-[8.5rem] shrink-0">
        <Field label={t('fields.capacity_appeal')}>
          <LookupCombo kind="capacity" value={appeal} onChange={onAppeal} />
        </Field>
      </div>
      <div className="w-[8.5rem] shrink-0">
        <Field label={t('fields.capacity_cassation')}>
          <LookupCombo kind="capacity" value={cassation} onChange={onCassation} />
        </Field>
      </div>
    </>
  )
}

export function CaseFormExtras({
  form,
  setField
}: {
  form: Record<string, unknown>
  setField: (name: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const { toast, can } = useApp()
  const [feesOpen, setFeesOpen] = useState(false)
  const [quick, setQuick] = useState({ full_name: '', national_id: '', client_type: 'individual' })
  const [quickOpp, setQuickOpp] = useState({ full_name: '', national_id: '' })
  const [similar, setSimilar] = useState<{ id: string; client_number: string; full_name: string } | null>(null)
  const [savingSimilar, setSavingSimilar] = useState(false)
  const [pinnedClients, setPinnedClients] = useState<LookupOption[]>([])
  const [pinnedOpps, setPinnedOpps] = useState<LookupOption[]>([])
  const extras = (form.extra_clients as ExtraClient[]) || []
  const extraOpps = (form.extra_opponents as ExtraOpp[]) || []

  const addClient = () => setField('extra_clients', [...extras, emptyClient()])
  const addOpp = () => setField('extra_opponents', [...extraOpps, emptyOpp()])

  const createInline = async (force = false) => {
    if (!quick.full_name.trim()) return
    try {
      const created = await invoke<{ id: string; client_number?: string }>('clients:create', {
        full_name: quick.full_name,
        national_id: quick.national_id || (quick.client_type === 'company' ? '***' : ''),
        client_type: quick.client_type,
        force_similar: force || undefined
      })
      const label = `${displayClientCode(created.client_number)} — ${quick.full_name}`.replace(/^ — /, '')
      setPinnedClients((prev) => [{ value: created.id, label }, ...prev.filter((x) => x.value !== created.id)])
      setField('client_id', created.id)
      setField('__quick_client', false)
      setQuick({ full_name: '', national_id: '', client_type: 'individual' })
      setSimilar(null)
    } catch (e) {
      const err = e as ApiError
      if (err.fieldErrors?._similar && !force) {
        try {
          setSimilar(JSON.parse(err.fieldErrors._similar))
        } catch {
          toast(err.message, 'err')
        }
        return
      }
      toast(err.message, 'err')
    }
  }

  const createOppInline = async () => {
    if (!quickOpp.full_name.trim()) return
    try {
      const created = await invoke<{ id: string }>('opponents:create', {
        full_name: quickOpp.full_name,
        national_id: quickOpp.national_id || undefined
      })
      setPinnedOpps((prev) => [
        { value: created.id, label: quickOpp.full_name },
        ...prev.filter((x) => x.value !== created.id)
      ])
      setField('opponent_id', created.id)
      setField('opponent_name', quickOpp.full_name)
      setField('__quick_opponent', false)
      setQuickOpp({ full_name: '', national_id: '' })
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const onPickOpponent = async (id: string) => {
    setField('opponent_id', id)
    if (!id) {
      setField('opponent_name', '')
      return
    }
    try {
      const packed = await invoke<{ opponent?: { full_name?: string }; full_name?: string }>('opponents:get', id)
      setField('opponent_name', packed.opponent?.full_name || packed.full_name || '')
    } catch {
      setField('opponent_name', '')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Field label={t('caseForm.numberingMode')}>
          <select
            className="flex h-9 w-full max-w-xs rounded-md border border-navy-200 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900"
            value={String(
              form.__numbering_mode ||
                (form.id && String(form.case_number || '').trim() && !/^CS-/i.test(String(form.case_number))
                  ? 'manual'
                  : 'auto')
            )}
            onChange={(e) => {
              const mode = e.target.value
              setField('__numbering_mode', mode)
              setField('numbering_mode', mode)
            }}
          >
            <option value="auto">{t('caseForm.numberingAuto')}</option>
            <option value="manual">{t('caseForm.numberingManual')}</option>
          </select>
        </Field>
        {String(
          form.__numbering_mode ||
            (form.id && String(form.case_number || '').trim() && !/^CS-/i.test(String(form.case_number))
              ? 'manual'
              : 'auto')
        ) === 'auto' ? (
          <p className="text-xs text-navy-500">{t('caseForm.numberingAutoHint')}</p>
        ) : (
          <>
            <Field label={t('fields.program_code')}>
              <Input
                className="w-40"
                dir="ltr"
                value={String(form.case_number || '')}
                onChange={(e) => setField('case_number', e.target.value)}
                placeholder="245"
              />
            </Field>
            <p className="text-xs text-navy-500">{t('caseForm.numberingManualHint')}</p>
          </>
        )}
        <div className="flex flex-wrap items-end gap-2 pt-2">
          <Field label={t('fields.court_number')}>
            <Input
              className="w-32"
              dir="ltr"
              value={String(form.office_case_number || '')}
              onChange={(e) => setField('office_case_number', e.target.value)}
              placeholder="6720"
            />
          </Field>
          <Field label={t('fields.case_year')}>
            <Input
              className="w-24"
              dir="ltr"
              value={String(form.case_year || '')}
              onChange={(e) => setField('case_year', e.target.value)}
              placeholder="2026"
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-navy-100 p-2 dark:border-navy-700">
        <div className="text-sm font-bold">{t('nav.clients')}</div>
        {form.__quick_client ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="max-w-full" style={{ width: '22ch' }}>
            <Input
              placeholder={t('fields.full_name')}
              value={quick.full_name}
              onChange={(e) => setQuick({ ...quick, full_name: e.target.value })}
            />
            </div>
            <div className="max-w-full" style={{ width: '16ch' }}>
            <Input
              placeholder={t('fields.national_id')}
              value={quick.national_id}
              onChange={(e) => setQuick({ ...quick, national_id: e.target.value })}
            />
            </div>
            <div className="max-w-full" style={{ width: '16ch' }}>
            <select
              className="h-9 w-full rounded border px-2 py-1 dark:bg-navy-800"
              value={quick.client_type}
              onChange={(e) => setQuick({ ...quick, client_type: e.target.value })}
            >
              <option value="individual">{t('status.individual')}</option>
              <option value="company">{t('status.company')}</option>
              <option value="institution">{t('status.institution')}</option>
            </select>
            </div>
            <Button type="button" variant="outline" onClick={() => createInline()}>
              {t('caseForm.createClient')}
            </Button>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end gap-1.5">
            <div className="min-w-[12rem] flex-1">
              <Field label={t('fields.client_id')} required>
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <EntitySelect
                      kind="clients"
                      value={form.client_id as string | number | undefined}
                      excludeIds={extras.map((x) => x.client_id).filter(Boolean)}
                      extraOptions={pinnedClients}
                      onChange={(v) => setField('client_id', v === '' ? '' : v)}
                    />
                  </div>
                  <Button type="button" variant="outline" className="h-9 w-9 shrink-0 px-0 text-lg" onClick={addClient}>
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 shrink-0 px-2 text-xs"
                    onClick={() => setField('__quick_client', !form.__quick_client)}
                  >
                    {t('caseForm.newClientInline')}
                  </Button>
                </div>
              </Field>
            </div>
            <CapsInline
              first={String(form.capacity_first || '')}
              appeal={String(form.capacity_appeal || '')}
              cassation={String(form.capacity_cassation || '')}
              onFirst={(v) => setField('capacity_first', v)}
              onAppeal={(v) => setField('capacity_appeal', v)}
              onCassation={(v) => setField('capacity_cassation', v)}
            />
          </div>
          <ContactSnap id={String(form.client_id || '')} kind="clients" />
        </div>
        {extras.map((row, i) => (
          <div key={i} className="space-y-1.5 rounded border border-dashed border-navy-200 p-2 dark:border-navy-700">
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[12rem] flex-1">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <EntitySelect
                      kind="clients"
                      value={row.client_id}
                      extraOptions={pinnedClients}
                      excludeIds={[String(form.client_id || ''), ...extras.map((x) => x.client_id)].filter(
                        (id) => id && id !== row.client_id
                      )}
                      onChange={(v) => {
                        const next = [...extras]
                        next[i] = { ...row, client_id: v }
                        setField('extra_clients', next)
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-2"
                    onClick={() => setField('extra_clients', extras.filter((_, j) => j !== i))}
                  >
                    ×
                  </Button>
                </div>
              </div>
              <CapsInline
                first={row.capacity_first}
                appeal={row.capacity_appeal}
                cassation={row.capacity_cassation}
                onFirst={(v) => {
                  const next = [...extras]
                  next[i] = { ...row, capacity_first: v }
                  setField('extra_clients', next)
                }}
                onAppeal={(v) => {
                  const next = [...extras]
                  next[i] = { ...row, capacity_appeal: v }
                  setField('extra_clients', next)
                }}
                onCassation={(v) => {
                  const next = [...extras]
                  next[i] = { ...row, capacity_cassation: v }
                  setField('extra_clients', next)
                }}
              />
            </div>
            <ContactSnap id={row.client_id} kind="clients" />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-navy-100 p-2 dark:border-navy-700">
        <div className="text-sm font-bold">{t('nav.opponents')}</div>
        {form.__quick_opponent ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="max-w-full" style={{ width: '22ch' }}>
            <Input
              placeholder={t('fields.full_name')}
              value={quickOpp.full_name}
              onChange={(e) => setQuickOpp({ ...quickOpp, full_name: e.target.value })}
            />
            </div>
            <div className="max-w-full" style={{ width: '16ch' }}>
            <Input
              placeholder={t('fields.national_id')}
              value={quickOpp.national_id}
              onChange={(e) => setQuickOpp({ ...quickOpp, national_id: e.target.value })}
            />
            </div>
            <Button type="button" variant="outline" onClick={() => createOppInline()}>
              {t('caseForm.createClient')}
            </Button>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end gap-1.5">
            <div className="min-w-[12rem] flex-1">
              <Field label={t('fields.opponent_name')} required>
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <EntitySelect
                      kind="opponents"
                      value={form.opponent_id as string | number | undefined}
                      excludeIds={extraOpps.map((x) => x.opponent_id).filter(Boolean)}
                      extraOptions={pinnedOpps}
                      onChange={(v) => onPickOpponent(v)}
                    />
                  </div>
                  <Button type="button" variant="outline" className="h-9 w-9 shrink-0 px-0 text-lg" onClick={addOpp}>
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 shrink-0 px-2 text-xs"
                    onClick={() => setField('__quick_opponent', !form.__quick_opponent)}
                  >
                    {t('caseForm.newOpponentInline')}
                  </Button>
                </div>
              </Field>
            </div>
            <CapsInline
              first={String(form.opponent_capacity_first || '')}
              appeal={String(form.opponent_capacity_appeal || '')}
              cassation={String(form.opponent_capacity_cassation || '')}
              onFirst={(v) => setField('opponent_capacity_first', v)}
              onAppeal={(v) => setField('opponent_capacity_appeal', v)}
              onCassation={(v) => setField('opponent_capacity_cassation', v)}
            />
          </div>
          <ContactSnap id={String(form.opponent_id || '')} kind="opponents" />
        </div>
        {extraOpps.map((row, i) => (
          <div key={i} className="space-y-1.5 rounded border border-dashed border-navy-200 p-2 dark:border-navy-700">
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[12rem] flex-1">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <EntitySelect
                      kind="opponents"
                      value={row.opponent_id}
                      extraOptions={pinnedOpps}
                      excludeIds={[String(form.opponent_id || ''), ...extraOpps.map((x) => x.opponent_id)].filter(
                        (id) => id && id !== row.opponent_id
                      )}
                      onChange={async (v) => {
                        const next = [...extraOpps]
                        let name = ''
                        let lawyer_name = ''
                        let lawyer_phone = ''
                        if (v) {
                          try {
                            const o = await invoke<{
                              opponent?: { full_name?: string; lawyer_name?: string; lawyer_phone?: string }
                              full_name?: string
                              lawyer_name?: string
                              lawyer_phone?: string
                            }>('opponents:get', v)
                            const rec = o.opponent || o
                            name = String(rec.full_name || '')
                            lawyer_name = String(rec.lawyer_name || '')
                            lawyer_phone = String(rec.lawyer_phone || '')
                          } catch {
                            name = ''
                          }
                        }
                        next[i] = { ...row, opponent_id: v, full_name: name, lawyer_name, lawyer_phone }
                        setField('extra_opponents', next)
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-2"
                    onClick={() => setField('extra_opponents', extraOpps.filter((_, j) => j !== i))}
                  >
                    ×
                  </Button>
                </div>
              </div>
              <CapsInline
                first={row.capacity_first}
                appeal={row.capacity_appeal}
                cassation={row.capacity_cassation}
                onFirst={(v) => {
                  const next = [...extraOpps]
                  next[i] = { ...row, capacity_first: v }
                  setField('extra_opponents', next)
                }}
                onAppeal={(v) => {
                  const next = [...extraOpps]
                  next[i] = { ...row, capacity_appeal: v }
                  setField('extra_opponents', next)
                }}
                onCassation={(v) => {
                  const next = [...extraOpps]
                  next[i] = { ...row, capacity_cassation: v }
                  setField('extra_opponents', next)
                }}
              />
            </div>
            <ContactSnap id={row.opponent_id} kind="opponents" />
          </div>
        ))}
      </div>

      {can('cases.finance') ? (
        <div className="rounded-lg border border-navy-100 dark:border-navy-700">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-start text-sm font-bold"
            onClick={() => setFeesOpen((v) => !v)}
          >
            <span>{t('caseForm.fees')}</span>
            <span className="text-navy-400">{feesOpen ? '−' : '+'}</span>
          </button>
          {feesOpen ? (
            <div className="flex flex-wrap gap-2 border-t border-navy-100 p-3 dark:border-navy-700">
              <div className="w-[9rem]">
                <Field label={t('fields.case_value')}>
                  <Input
                    dir="ltr"
                    type="number"
                    value={String(form.case_value ?? '')}
                    onChange={(e) => setField('case_value', e.target.value)}
                  />
                </Field>
              </div>
              <div className="w-[9rem]">
                <Field label={t('fields.total_fees')}>
                  <Input
                    dir="ltr"
                    type="number"
                    value={String(form.total_fees ?? '')}
                    onChange={(e) => setField('total_fees', e.target.value)}
                  />
                </Field>
              </div>
              <div className="w-[10rem]">
                <Field label={t('fields.fees_due_date')}>
                  <DatePicker
                    value={String(form.fees_due_date || '')}
                    onChange={(iso) => setField('fees_due_date', iso)}
                  />
                </Field>
              </div>
              <div className="w-[10rem]">
                <Field label={t('fields.payment_method')}>
                  <Select
                    value={String(form.payment_method || 'cash')}
                    onChange={(e) => setField('payment_method', e.target.value)}
                  >
                    {['cash', 'bank', 'card', 'wallet', 'installment', 'other'].map((v) => (
                      <option key={v} value={v}>
                        {t(`types.${v}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="w-[8rem]">
                <Field label={t('fields.installment_count')}>
                  <Input
                    dir="ltr"
                    type="number"
                    value={String(form.installment_count ?? '')}
                    onChange={(e) => setField('installment_count', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <SimilarClientModal
        open={!!similar}
        name={similar?.full_name}
        code={similar?.client_number}
        saving={savingSimilar}
        onClose={() => setSimilar(null)}
        onOpenExisting={() => {
          if (similar) setField('client_id', similar.id)
          setField('__quick_client', false)
          setSimilar(null)
        }}
        onAddAsNew={async () => {
          setSavingSimilar(true)
          try {
            await createInline(true)
          } finally {
            setSavingSimilar(false)
          }
        }}
      />
    </div>
  )
}
