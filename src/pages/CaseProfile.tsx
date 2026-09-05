import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Gavel, Hammer, Printer, Wallet } from 'lucide-react'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, InfoGrid, Input, MiniTable, Modal, PageHeader, Select, StatusBadge, UiTabs } from '../components/ui'
import { EntitySelect } from '../components/EntitySelect'
import { FormFields } from '../components/CrudPage'
import { CaseFormExtras } from '../components/CaseFormExtras'
import { caseFormFields, hydrateCaseForm } from '../lib/caseForm'
import { caseSchema } from '@shared/schemas'
import { onDataChanged } from '../lib/bus'
import { formatCourtNumber, formatProgramCode } from '../lib/courtNumber'
import { cleanPartyName } from '../lib/partyName'
import { AndOthers } from '../components/AndOthers'
import { caseSheetHtml } from '../components/VenuePrintBar'
import { HearingsPage, TasksPage } from './WorkPages'

type CaseTab = 'hearings' | 'admin' | 'execution' | 'finance'

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

export function CaseProfilePage() {
  const { t } = useTranslation()
  const { pageMeta, setPage, goBack, toast, can } = useApp()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [link, setLink] = useState({ related_case_id: '', link_type: 'appeal' })
  const [partiesOpen, setPartiesOpen] = useState<'clients' | 'opponents' | null>(null)
  const [tab, setTab] = useState<CaseTab>('hearings')
  const [feesEdit, setFeesEdit] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash', notes: '' })
  const id = String(pageMeta.id || '')
  const canFinance = can('accounts.view')
  const load = () => invoke<Record<string, unknown>>('cases:get', id).then(setRow)
  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [id])
  useEffect(() => onDataChanged(() => load().catch(() => undefined)), [id])
  if (!row) return <div>{t('loading')}</div>
  const fees = (row.fees as Record<string, unknown>) || {}
  const payments = (row.payments as { amount?: number }[]) || []
  const agreed = Number(fees.total_fees ?? row.total_fees ?? 0)
  const paidSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const due = Math.max(0, agreed - paidSum)
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
          { label: t('fields.client_number'), value: dash(c.client_number) },
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
            <div className="text-4xl font-black tracking-wide text-red-600">{formatProgramCode(row)}</div>
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
          <div>
            <div className="text-xs font-semibold text-navy-500">{t('fields.capacity_first')}</div>
            <div className="font-semibold">{String(row.capacity_first || '—')}</div>
          </div>
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
          <Button
            variant="outline"
            onClick={() =>
              invoke('print:print', 'report', t('printCaseSheet'), caseSheetHtml(row, t)).catch((e) =>
                toast((e as Error).message, 'err')
              )
            }
          >
            <Printer className="me-1 inline h-4 w-4" />
            {t('print')}
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
        <div>
          <div className="text-xs font-semibold text-navy-500">{t('fields.opponent_capacity_first')}</div>
          <div className="font-semibold">{String(row.opponent_capacity_first || '—')}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-navy-500">{t('fields.court_number')}</div>
          <div dir="ltr" className="font-bold" style={{ unicodeBidi: 'isolate' }}>
            {formatCourtNumber(row)}
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
          {tab === 'admin' && can('tasks.view') && (
            <TasksPage embeddedCaseId={id} embeddedClientId={String(row.client_id || '')} embeddedWorkKind="admin" />
          )}
          {tab === 'execution' && can('tasks.view') && (
            <TasksPage embeddedCaseId={id} embeddedClientId={String(row.client_id || '')} embeddedWorkKind="execution" />
          )}
          {tab === 'finance' && canFinance && (
            <Card>
              <p className="mb-3 text-sm text-navy-500">{t('caseFinance.hint')}</p>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
                  <div className="text-xs text-navy-500">{t('caseFinance.agreed')}</div>
                  <div className="text-xl font-black tabular-nums">{agreed.toLocaleString('ar-EG')}</div>
                </div>
                <div className="rounded-lg border border-navy-100 p-3 dark:border-navy-700">
                  <div className="text-xs text-navy-500">{t('caseFinance.paid')}</div>
                  <div className="text-xl font-black tabular-nums text-green-700">{paidSum.toLocaleString('ar-EG')}</div>
                </div>
                <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 dark:border-navy-700 dark:bg-navy-800">
                  <div className="text-xs text-navy-500">{t('caseFinance.remaining')}</div>
                  <div className="text-xl font-black tabular-nums">{due.toLocaleString('ar-EG')}</div>
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
                </div>
              )}
              {!can('cases.update') && can('accounts.payment') && (
                <Button className="mb-3" onClick={() => setPayOpen(true)}>
                  {t('caseFinance.addPayment')}
                </Button>
              )}
              <MiniTable rows={row.payments as object[]} keys={['payment_number', 'amount', 'payment_date']} />
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
          <Field label={t('fields.payment_date')}>
            <Input
              type="date"
              value={pay.payment_date}
              onChange={(e) => setPay({ ...pay, payment_date: e.target.value })}
            />
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
            <Button
              onClick={async () => {
                try {
                  await invoke('payments:create', {
                    case_id: id,
                    client_id: row.client_id,
                    amount: Number(pay.amount),
                    payment_date: pay.payment_date,
                    payment_method: pay.payment_method,
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
          </div>
        </div>
      </Modal>
      <Modal open={editOpen} title={t('edit')} onClose={() => setEditOpen(false)} wide>
        <div className="mb-3 text-center text-4xl font-black text-red-600">{formatProgramCode(form)}</div>
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
