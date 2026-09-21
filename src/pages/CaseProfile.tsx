import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, FileSearch, Gavel, Hammer, Wallet } from 'lucide-react'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, InfoGrid, Input, MiniTable, Modal, PageHeader, Select, StatusBadge, UiTabs } from '../components/ui'
import { EntitySelect } from '../components/EntitySelect'
import { FormFields } from '../components/CrudPage'
import { CaseFormExtras } from '../components/CaseFormExtras'
import { caseFormFields, hydrateCaseForm } from '../lib/caseForm'
import { caseSchema } from '@shared/schemas'
import { onDataChanged } from '../lib/bus'
import { formatProgramCode, displayClientCode, isManualProgramCode } from '../lib/courtNumber'
import { CourtNumberText } from '../components/CourtNumberText'
import { cleanPartyName } from '../lib/partyName'
import { AndOthers } from '../components/AndOthers'
import { caseInteriorHtml } from '../components/VenuePrintBar'
import { HearingsPage, TasksPage, ExpertsPage } from './WorkPages'
import { PrintTemplatePicker } from '../components/PrintTemplatePicker'
import { sendPrint } from '../lib/printKit'
import { LookupCombo } from '../components/LookupCombo'

type CaseTab = 'hearings' | 'experts' | 'admin' | 'execution' | 'finance'

function IconBtn({
  label,
  onClick,
  gold,
  children
}: {
  label: string
  onClick: () => void
  gold?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`flex min-w-[6.2rem] flex-col items-center gap-1 rounded-xl border px-3 py-2 text-navy-900 hover:bg-navy-50 dark:border-navy-700 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700 ${
        gold ? 'border-gold-400 bg-gold-50 hover:bg-gold-100 dark:bg-navy-800' : 'border-navy-200 bg-white'
      }`}
      onClick={onClick}
    >
      {children}
      <span className="text-xs font-bold">{label}</span>
    </button>
  )
}

function dash(v: unknown) {
  const s = String(v ?? '').trim()
  return s || '—'
}

function CapBits({
  items
}: {
  items: { label: string; value: unknown }[]
}) {
  const shown = items.filter((i) => String(i.value ?? '').trim())
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap gap-4">
      {shown.map((i) => (
        <div key={i.label}>
          <div className="text-xs font-semibold text-navy-500">{i.label}</div>
          <div className="font-semibold">{String(i.value)}</div>
        </div>
      ))}
    </div>
  )
}

export function CaseProfilePage() {
  const { t, i18n } = useTranslation()
  const { pageMeta, setPage, goBack, toast, can } = useApp()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [link, setLink] = useState({ related_case_id: '', link_type: 'appeal' })
  const [partiesOpen, setPartiesOpen] = useState<'clients' | 'opponents' | null>(null)
  const [tab, setTab] = useState<CaseTab>('hearings')
  const [feesEdit, setFeesEdit] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    payment_type: 'fees',
    notes: ''
  })
  const [dueOpen, setDueOpen] = useState(false)
  const [due, setDue] = useState({ amount: '', due_type: '', notes: '' })
  const id = String(pageMeta.id || '')
  const canFinance = can('cases.finance')
  const load = () => invoke<Record<string, unknown>>('cases:get', id).then(setRow)
  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [id])
  useEffect(() => onDataChanged(() => load().catch(() => undefined), ['cases', 'hearings', 'tasks', 'payments', 'documents', 'expenses', 'case_dues']), [id])
  if (!row) return <div>{t('loading')}</div>
  const fees = (row.fees as Record<string, unknown>) || {}
  const payments = (row.payments as { amount?: number }[]) || []
  const dues = (row.dues as { id?: string; amount?: number; due_type?: string; notes?: string; created_at?: string }[]) || []
  const agreed = Number(fees.total_fees ?? row.total_fees ?? 0)
  const expenseSum = Number(row.expense_sum ?? 0)
  const duesSum = dues.reduce((s, d) => s + Number(d.amount || 0), 0)
  const paidSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalDebt = agreed + expenseSum + duesSum
  const dueAmount = Math.max(0, totalDebt - paidSum)
  const primaryClean = cleanPartyName(String(row.client_name || ''))
  const clients = (row.caseClients as Record<string, unknown>[] | undefined) || []
  const extraClients = clients.filter(
    (c) => Number(c.is_primary) !== 1 && cleanPartyName(String(c.full_name || '')) !== primaryClean
  )
  const opponents = (row.opponents as Record<string, unknown>[] | undefined) || []
  const oppNames = opponents.map((o) => String(o.full_name || '')).filter((n) => n.length > 0)
  const oppPrimary = String(row.opponent_name || oppNames[0] || '')
  const oppExtras = oppNames.filter((n) => n !== oppPrimary)

  const clientCards = (clients.length ? clients : [{ full_name: row.client_name, is_primary: 1 }]).map((c, i) => (
    <div key={String(c.client_id || i)} className="mb-3 rounded-lg border border-navy-100 p-2 dark:border-navy-700">
      <InfoGrid
        items={[
          { label: t('fields.client_number'), value: dash(displayClientCode(c.client_number)) },
          { label: t('fields.full_name'), value: dash(c.full_name) },
          { label: t('fields.nickname'), value: dash(c.nickname) },
          { label: t('fields.national_id'), value: dash(c.national_id) },
          { label: t('fields.phone'), value: dash(c.phone) },
          { label: t('fields.phone2'), value: dash(c.phone2) },
          { label: t('fields.whatsapp'), value: dash(c.whatsapp) },
          { label: t('fields.email'), value: dash(c.email) },
          { label: t('fields.address'), value: dash(c.address) },
          { label: t('fields.profession'), value: dash(c.profession) },
          { label: t('fields.client_type'), value: dash(c.client_type) },
          { label: t('fields.capacity_first'), value: dash(c.capacity_first) },
          { label: t('fields.capacity_appeal'), value: dash(c.capacity_appeal) },
          { label: t('fields.capacity_cassation'), value: dash(c.capacity_cassation) }
        ]}
      />
    </div>
  ))
  const opponentCards = (opponents.length ? opponents : [{ full_name: oppPrimary }]).map((o, i) => (
    <div key={String(o.id || i)} className="mb-3 rounded-lg border border-navy-100 p-2 dark:border-navy-700">
      <InfoGrid
        items={[
          { label: t('fields.full_name'), value: dash(o.full_name) },
          { label: t('fields.nickname'), value: dash(o.nickname) },
          { label: t('fields.national_id'), value: dash(o.national_id) },
          { label: t('fields.phone'), value: dash(o.phone) },
          { label: t('fields.address'), value: dash(o.address) },
          { label: t('fields.lawyer_name'), value: dash(o.lawyer_name) },
          { label: t('fields.lawyer_phone'), value: dash(o.lawyer_phone) },
          { label: t('fields.capacity_first'), value: dash(o.capacity_first) },
          { label: t('fields.capacity_appeal'), value: dash(o.capacity_appeal) },
          { label: t('fields.capacity_cassation'), value: dash(o.capacity_cassation) }
        ]}
      />
    </div>
  ))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs font-semibold text-navy-500">{t('fields.program_code')}</div>
            <div className={`text-4xl font-black tracking-wide ${isManualProgramCode(row) ? 'text-red-600' : 'text-navy-900 dark:text-white'}`}>{formatProgramCode(row)}</div>
          </div>
          <div
            className="cursor-pointer"
            onClick={() => setPartiesOpen('clients')}
          >
            <div className="text-xs font-semibold text-navy-500">{t('fields.client_id')}</div>
            <div className="text-lg font-bold">
              <AndOthers
                primary={cleanPartyName(String(row.client_name || ''))}
                extraNames={extraClients.map((c) => cleanPartyName(String(c.full_name || ''))).join('، ')}
                extraCount={extraClients.length}
              />
            </div>
          </div>
          <CapBits
            items={[
              { label: t('fields.capacity_first'), value: row.capacity_first },
              { label: t('fields.capacity_appeal'), value: row.capacity_appeal },
              { label: t('fields.capacity_cassation'), value: row.capacity_cassation }
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {can('cases.update') && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const full = await invoke<Record<string, unknown>>('cases:get', id)
                  setForm(hydrateCaseForm(row, full))
                  setEditOpen(true)
                } catch (e) {
                  toast((e as Error).message, 'err')
                }
              }}
            >
              {t('edit')}
            </Button>
          )}
          <PrintTemplatePicker
            caseId={id}
            fallback={() => {
              invoke('print:print', 'a4', t('printKit.caseInterior'), caseInteriorHtml(row, t, i18n.language)).catch((e) =>
                toast((e as Error).message, 'err')
              )
            }}
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const full = await invoke<Record<string, unknown>>('cases:get', id)
                await sendPrint('a4', t('printKit.caseInterior'), caseInteriorHtml({ ...row, ...full }, t, i18n.language))
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
          >
            {t('printKit.caseInterior')}
          </Button>
          <Button variant="outline" onClick={() => setPartiesOpen('clients')}>
            {t('caseFinance.parties')}
          </Button>
          <Button variant="outline" onClick={() => goBack()}>
            {t('back')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="cursor-pointer" onClick={() => setPartiesOpen('opponents')}>
          <div className="text-xs font-semibold text-navy-500">{t('fields.opponent_name')}</div>
          <div className="font-bold">
            <AndOthers
              primary={cleanPartyName(oppPrimary)}
              extraNames={oppExtras.map((n) => cleanPartyName(n)).join('، ')}
              extraCount={oppExtras.length}
            />
          </div>
        </div>
        <CapBits
          items={[
            { label: t('fields.opponent_capacity_first'), value: row.opponent_capacity_first },
            { label: t('fields.opponent_capacity_appeal'), value: row.opponent_capacity_appeal },
            { label: t('fields.opponent_capacity_cassation'), value: row.opponent_capacity_cassation }
          ]}
        />
        <div>
          <div className="text-xs font-semibold text-navy-500">{t('fields.court_number')}</div>
          <div className="font-bold">
            <CourtNumberText row={row} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {can('hearings.view') && (
              <IconBtn gold={tab === 'hearings'} label={t('nav.hearings')} onClick={() => setTab('hearings')}>
                <Gavel className="h-6 w-6" />
              </IconBtn>
            )}
            {can('hearings.view') && (
              <IconBtn gold={tab === 'experts'} label={t('nav.experts')} onClick={() => setTab('experts')}>
                <FileSearch className="h-6 w-6" />
              </IconBtn>
            )}
            {can('tasks.view') && (
              <IconBtn gold={tab === 'admin'} label={t('caseForm.adminWork')} onClick={() => setTab('admin')}>
                <ClipboardList className="h-6 w-6" />
              </IconBtn>
            )}
            {can('tasks.view') && (
              <IconBtn gold={tab === 'execution'} label={t('caseForm.executionWork')} onClick={() => setTab('execution')}>
                <Hammer className="h-6 w-6" />
              </IconBtn>
            )}
            {canFinance && (
              <IconBtn gold={tab === 'finance'} label={t('caseForm.finance')} onClick={() => setTab('finance')}>
                <Wallet className="h-6 w-6" />
              </IconBtn>
            )}
          </div>
          {tab === 'hearings' && can('hearings.view') && <HearingsPage embeddedCaseId={id} />}
          {tab === 'experts' && can('hearings.view') && <ExpertsPage embeddedCaseId={id} />}
          {tab === 'admin' && can('tasks.view') && (
            <TasksPage embeddedCaseId={id} embeddedClientId={String(row.client_id || '')} embeddedWorkKind="admin" />
          )}
          {tab === 'execution' && can('tasks.view') && (
            <TasksPage embeddedCaseId={id} embeddedClientId={String(row.client_id || '')} embeddedWorkKind="execution" />
          )}
          {tab === 'finance' && canFinance && (
            <Card>
              <p className="mb-3 text-sm text-navy-500">{t('caseFinance.hint')}</p>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
                  <div className="text-xs text-navy-500">{t('caseFinance.agreed')}</div>
                  <div className="text-xl font-black tabular-nums">{agreed.toLocaleString('ar-EG')}</div>
                </div>
                <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
                  <div className="text-xs text-navy-500">{t('fields.total_debt')}</div>
                  <div className="text-xl font-black tabular-nums">{totalDebt.toLocaleString('ar-EG')}</div>
                </div>
                <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
                  <div className="text-xs text-navy-500">{t('caseFinance.paid')}</div>
                  <div className="text-xl font-black tabular-nums text-green-700">{paidSum.toLocaleString('ar-EG')}</div>
                </div>
                <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 dark:border-navy-700 dark:bg-navy-800">
                  <div className="text-xs text-navy-500">{t('caseFinance.remaining')}</div>
                  <div className="text-xl font-black tabular-nums">{dueAmount.toLocaleString('ar-EG')}</div>
                </div>
              </div>
              {can('cases.update') && (
                <div className="mb-4 flex flex-wrap items-end gap-2">
                  <Field label={t('caseFinance.agreed')}>
                    <Input
                      dir="ltr"
                      className="w-40"
                      value={feesEdit || String(agreed || '')}
                      onChange={(e) => setFeesEdit(e.target.value)}
                    />
                  </Field>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const n = Number(feesEdit || agreed)
                      if (!Number.isFinite(n) || n < 0) return
                      await invoke('cases:update', id, { ...row, total_fees: n })
                      toast(t('savedOk'))
                      setFeesEdit('')
                      load()
                    }}
                  >
                    {t('caseFinance.saveAgreed')}
                  </Button>
                  {can('accounts.payment') && <Button onClick={() => setPayOpen(true)}>{t('caseFinance.addPayment')}</Button>}
                  <Button variant="outline" onClick={() => setDueOpen(true)}>
                    {t('caseFinance.addDue')}
                  </Button>
                </div>
              )}
              {!can('cases.update') && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {can('accounts.payment') ? (
                    <Button onClick={() => setPayOpen(true)}>{t('caseFinance.addPayment')}</Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDueOpen(true)}>
                    {t('caseFinance.addDue')}
                  </Button>
                </div>
              )}
              <MiniTable
                rows={row.payments as object[]}
                keys={['payment_number', 'amount', 'payment_type', 'payment_date']}
              />
              <h4 className="mb-1 mt-4 text-sm font-bold">{t('caseFinance.extraDues')}</h4>
              {dues.length ? (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-start">{t('fields.due_type')}</th>
                      <th className="px-3 py-2 text-start">{t('fields.amount')}</th>
                      <th className="px-3 py-2 text-start">{t('fields.notes')}</th>
                      <th className="px-3 py-2 text-start" />
                    </tr>
                  </thead>
                  <tbody>
                    {dues.map((d) => (
                      <tr key={String(d.id)} className="border-t">
                        <td className="px-3 py-2">{d.due_type || '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{Number(d.amount || 0).toLocaleString('ar-EG')}</td>
                        <td className="px-3 py-2">{d.notes || '—'}</td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              if (!d.id || !window.confirm(t('confirmDelete'))) return
                              try {
                                await invoke('dues:remove', d.id)
                                toast(t('savedOk'))
                                load()
                              } catch (e) {
                                toast((e as Error).message, 'err')
                              }
                            }}
                          >
                            {t('delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-navy-400">{t('noData')}</div>
              )}
            </Card>
          )}
        </div>

      <Card>
        <InfoGrid
            items={[
              { label: t('fields.court'), value: String(row.court ?? '—') },
              { label: t('fields.circuit'), value: String(row.circuit ?? row.circuit_number ?? '—') },
              { label: t('fields.session_place'), value: String(row.session_place ?? '—') },
              {
                label: t('fields.first_instance_number'),
                value: `${row.first_instance_number ?? '—'} / ${row.first_instance_year ?? ''}`
              },
              { label: t('fields.lawyer_id'), value: String(row.lawyer_name ?? '—') },
              { label: t('fields.status'), value: <StatusBadge value={String(row.status)} /> }
            ]}
          />
      </Card>

      <PageHeader
        title=""
        actions={
          <Button
            variant="outline"
            onClick={() =>
              invoke('cases:archive', id).then(() => {
                toast(t('savedOk'))
                setPage('cases')
              })
            }
          >
            {t('archive')}
          </Button>
        }
      />

      <Card>
        <h3 className="mb-1 font-bold">{t('tabs.relatedCases')}</h3>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[240px] flex-1">
            <EntitySelect
              kind="cases"
              value={link.related_case_id}
              excludeIds={[id]}
              onChange={(v) => setLink((prev) => ({ ...prev, related_case_id: v }))}
            />
          </div>
          <Select value={link.link_type} onChange={(e) => setLink((prev) => ({ ...prev, link_type: e.target.value }))}>
            <option value="original">{t('status.original')}</option>
            <option value="appeal">{t('status.appeal')}</option>
            <option value="cassation">{t('status.cassation')}</option>
            <option value="execution">{t('status.execution')}</option>
          </Select>
          <Button
            onClick={async () => {
              const relatedId = String(link.related_case_id || '')
              if (!relatedId) return
              try {
                await invoke('cases:link', id, relatedId, link.link_type)
                toast(t('savedOk'))
                setLink({ related_case_id: '', link_type: link.link_type })
                await load()
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
          >
            {t('save')}
          </Button>
        </div>
        <MiniTable
          rows={row.links as object[]}
          keys={['link_type', 'case_number', 'title']}
          onRowClick={(r) => r.related_case_id && setPage('caseProfile', { id: r.related_case_id })}
        />
      </Card>

      <Modal
        open={!!partiesOpen}
        title={t('caseFinance.parties')}
        onClose={() => setPartiesOpen(null)}
        wide
      >
        <UiTabs
          value={partiesOpen || 'clients'}
          onValueChange={(v) => setPartiesOpen(v as 'clients' | 'opponents')}
          tabs={[
            { id: 'clients', label: t('nav.clients'), body: <div className="max-h-[70vh] overflow-auto">{clientCards}</div> },
            { id: 'opponents', label: t('nav.opponents'), body: <div className="max-h-[70vh] overflow-auto">{opponentCards}</div> }
          ]}
        />
        {partiesOpen === 'clients' && row.client_id ? (
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={() => setPage('clientProfile', { id: String(row.client_id) })}>
              {t('clients.openExisting')}
            </Button>
          </div>
        ) : null}
      </Modal>
      <Modal open={payOpen} title={t('caseForm.newPayment')} onClose={() => setPayOpen(false)}>
        <div className="space-y-2">
          <Field label={t('fields.amount')}>
            <Input
              dir="ltr"
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value })}
            />
          </Field>
          {Number(pay.amount) > dueAmount + 0.001 ? (
            <div className="rounded border border-gold-300 bg-gold-50 px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-800">
              {t('caseFinance.overpayWarn', {
                extra: (Number(pay.amount) - dueAmount).toLocaleString('ar-EG')
              })}
            </div>
          ) : null}
          <Field label={t('fields.payment_date')}>
            <Input
              type="date"
              value={pay.payment_date}
              onChange={(e) => setPay({ ...pay, payment_date: e.target.value })}
            />
          </Field>
          <Field label={t('fields.payment_type')}>
            <LookupCombo kind="payment_type" value={pay.payment_type} onChange={(v) => setPay({ ...pay, payment_type: v })} />
          </Field>
          <Field label={t('fields.payment_method')}>
            <Select value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}>
              <option value="cash">{t('types.cash')}</option>
              <option value="bank">{t('types.bank')}</option>
              <option value="card">{t('types.card')}</option>
              <option value="wallet">{t('types.wallet')}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              {t('cancel')}
            </Button>
            {Number(pay.amount) > dueAmount + 0.001 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    void (async () => {
                      try {
                        await invoke('payments:create', {
                          case_id: id,
                          client_id: row.client_id,
                          amount: dueAmount,
                          payment_date: pay.payment_date,
                          payment_method: pay.payment_method,
                          payment_type: pay.payment_type || 'fees',
                          notes: pay.notes
                        })
                        toast(t('savedOk'))
                        setPayOpen(false)
                        load()
                      } catch (e) {
                        toast((e as Error).message, 'err')
                      }
                    })()
                  }
                >
                  {t('caseFinance.payDueOnly')}
                </Button>
                <Button
                  onClick={() =>
                    void (async () => {
                      try {
                        await invoke('payments:create', {
                          case_id: id,
                          client_id: row.client_id,
                          amount: Number(pay.amount),
                          payment_date: pay.payment_date,
                          payment_method: pay.payment_method,
                          payment_type: pay.payment_type || 'fees',
                          notes: pay.notes
                        })
                        toast(t('savedOk'))
                        setPayOpen(false)
                        load()
                      } catch (e) {
                        toast((e as Error).message, 'err')
                      }
                    })()
                  }
                >
                  {t('caseFinance.payFull')}
                </Button>
              </>
            ) : (
              <Button
                onClick={async () => {
                  try {
                    await invoke('payments:create', {
                      case_id: id,
                      client_id: row.client_id,
                      amount: Number(pay.amount),
                      payment_date: pay.payment_date,
                      payment_method: pay.payment_method,
                      payment_type: pay.payment_type || 'fees',
                      notes: pay.notes
                    })
                    toast(t('savedOk'))
                    setPayOpen(false)
                    load()
                  } catch (e) {
                    toast((e as Error).message, 'err')
                  }
                }}
              >
                {t('save')}
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <Modal open={dueOpen} title={t('caseFinance.addDue')} onClose={() => setDueOpen(false)}>
        <div className="space-y-2">
          <Field label={t('fields.amount')}>
            <Input dir="ltr" value={due.amount} onChange={(e) => setDue({ ...due, amount: e.target.value })} />
          </Field>
          <Field label={t('fields.due_type')}>
            <LookupCombo kind="due_type" value={due.due_type} onChange={(v) => setDue({ ...due, due_type: v })} />
          </Field>
          <Field label={t('fields.notes')}>
            <Input value={due.notes} onChange={(e) => setDue({ ...due, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDueOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await invoke('dues:create', {
                    case_id: id,
                    amount: Number(due.amount),
                    due_type: due.due_type,
                    notes: due.notes
                  })
                  toast(t('savedOk'))
                  setDue({ amount: '', due_type: '', notes: '' })
                  setDueOpen(false)
                  load()
                } catch (e) {
                  toast((e as Error).message, 'err')
                }
              }}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={editOpen} title={t('edit')} onClose={() => setEditOpen(false)} wide>
        <div className={`mb-3 text-center text-4xl font-black ${isManualProgramCode(form) ? 'text-red-600' : 'text-navy-900 dark:text-white'}`}>{formatProgramCode(form)}</div>
        <CaseFormExtras
          form={form}
          setField={(n, v) => setForm((prev) => ({ ...prev, [n]: v }))}
        />
        <FormFields
          fields={caseFormFields(t)}
          values={form}
          onChange={(n, v) => setForm((prev) => ({ ...prev, [n]: v }))}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={async () => {
              const parsed = caseSchema.safeParse(form)
              if (!parsed.success) {
                toast(parsed.error.issues[0]?.message || t('error'), 'err')
                return
              }
              try {
                await invoke('cases:update', id, form)
                toast(t('savedOk'))
                setEditOpen(false)
                await load()
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
          >
            {t('save')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
