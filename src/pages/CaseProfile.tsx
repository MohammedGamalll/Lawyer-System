import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Gavel, Wallet } from 'lucide-react'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, InfoGrid, MiniTable, PageHeader, Select, StatusBadge, UiTabs } from '../components/ui'
import { EntitySelect } from '../components/EntitySelect'
import { onDataChanged } from '../lib/bus'

export function CaseProfilePage() {
  const { t } = useTranslation()
  const { pageMeta, setPage, goBack, toast, can } = useApp()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [link, setLink] = useState({ related_case_id: '', link_type: 'appeal' })
  const [oppId, setOppId] = useState('')
  const id = String(pageMeta.id || '')
  const showFinance = can('accounts.view')
  const load = () => invoke<Record<string, unknown>>('cases:get', id).then(setRow)
  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [id])
  useEffect(() => onDataChanged(() => load().catch(() => undefined)), [id])
  if (!row) return <div>{t('loading')}</div>
  const fees = (row.fees as Record<string, unknown>) || {}

  const financeTabs = showFinance
    ? [
        {
          id: 'fees',
          label: t('tabs.fees'),
          body: (
            <InfoGrid
              items={[
                {
                  label: t('fields.total_fees'),
                  value: Number(fees.total_fees ?? row.total_fees ?? 0).toLocaleString('ar-EG')
                },
                { label: t('status.paid'), value: Number(fees.paid ?? 0).toLocaleString('ar-EG') },
                { label: t('due'), value: Number(fees.remaining ?? 0).toLocaleString('ar-EG') },
                { label: t('fields.due_date'), value: String(fees.due_date ?? '—') },
                { label: t('fields.payment_method'), value: String(fees.payment_method ?? '—') },
                {
                  label: t('fields.installment_count'),
                  value: String(fees.installment_count ?? '—')
                }
              ]}
            />
          )
        },
        {
          id: 'payments',
          label: t('tabs.payments'),
          body: (
            <MiniTable
              rows={row.payments as object[]}
              keys={['payment_number', 'amount', 'payment_date', 'payment_method']}
            />
          )
        }
      ]
    : []

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${row.case_number} — ${row.title}`}
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
            {can('hearings.create') && (
              <button
                type="button"
                className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-xl border border-gold-400 bg-gold-50 px-3 py-2 text-navy-900 hover:bg-gold-100 dark:bg-navy-800 dark:text-white"
                onClick={() => setPage('hearings', { create: true, case_id: id })}
              >
                <Gavel className="h-6 w-6" />
                <span className="text-xs font-bold">{t('caseForm.newHearing')}</span>
              </button>
            )}
            {can('tasks.manage') && (
              <button
                type="button"
                className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-xl border border-navy-200 bg-white px-3 py-2 text-navy-900 hover:bg-navy-50 dark:border-navy-700 dark:bg-navy-800 dark:text-white"
                onClick={() => setPage('tasks', { create: true, case_id: id, client_id: row.client_id })}
              >
                <ClipboardList className="h-6 w-6" />
                <span className="text-xs font-bold">{t('caseForm.newAdminAction')}</span>
              </button>
            )}
            {showFinance && can('accounts.payment') && (
              <button
                type="button"
                className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-xl border border-navy-200 bg-white px-3 py-2 text-navy-900 hover:bg-navy-50 dark:border-navy-700 dark:bg-navy-800 dark:text-white"
                onClick={() => setPage('accounts', { create: true, case_id: id, client_id: row.client_id })}
              >
                <Wallet className="h-6 w-6" />
                <span className="text-xs font-bold">{t('caseForm.newPayment')}</span>
              </button>
            )}
            </div>
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
            <Button variant="outline" onClick={() => goBack()}>
              {t('back')}
            </Button>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:bg-navy-50 dark:hover:bg-navy-800"
          onClick={() => row.client_id && setPage('clientProfile', { id: String(row.client_id) })}
        >
          {t('fields.client_name')}: {String(row.client_name)}
        </Card>
        <Card>
          {t('fields.lawyer_id')}: {String(row.lawyer_name ?? '—')}
        </Card>
        <Card>
          {t('fields.status')}: <StatusBadge value={String(row.status)} />
        </Card>
      </div>
      <Card>
        <InfoGrid
          items={[
            { label: t('fields.case_subject'), value: String(row.category ?? '—') },
            { label: t('fields.case_year'), value: String(row.case_year ?? '—') },
            { label: t('fields.court'), value: String(row.court ?? '—') },
            { label: t('fields.circuit_number'), value: String(row.circuit_number ?? row.circuit ?? '—') },
            { label: t('fields.first_instance_number'), value: `${row.first_instance_number ?? '—'} / ${row.first_instance_year ?? ''}` },
            { label: t('fields.appeal_number'), value: `${row.appeal_number ?? '—'} / ${row.appeal_year ?? ''}` },
            { label: t('fields.cassation_number'), value: `${row.cassation_number ?? '—'} / ${row.cassation_year ?? ''}` },
            { label: t('fields.extra_ref_type'), value: `${row.extra_ref_type ?? '—'} ${row.extra_ref_number ?? ''}` }
          ]}
        />
      </Card>
      <Card>
        <UiTabs
          tabs={[
            ...financeTabs,
            {
              id: 'hearings',
              label: t('tabs.hearings'),
              body: (
                <div className="space-y-2">
                  <MiniTable
                    rows={row.hearings as object[]}
                    keys={['hearing_date', 'hearing_type', 'venue', 'previous_decision', 'hall', 'floor', 'notes', 'status', 'result']}
                    onRowClick={(r) => r.id && setPage('hearings', { edit_id: r.id, case_id: id })}
                  />
                  {Number(row.hearingsTotal || 0) > ((row.hearings as object[]) || []).length ? (
                    <Button variant="outline" onClick={() => setPage('hearings', { case_id: id })}>
                      {t('tabs.hearings')} ({String(row.hearingsTotal)})
                    </Button>
                  ) : null}
                </div>
              )
            },
            {
              id: 'tasks',
              label: t('nav.tasks'),
              body: (
                <MiniTable
                  rows={row.tasks as object[]}
                  keys={['title', 'case_subject', 'venue', 'due_date', 'status']}
                  onRowClick={(r) => r.id && setPage('tasks', { edit_id: r.id })}
                />
              )
            },
            {
              id: 'clients',
              label: t('nav.clients'),
              body: (
                <MiniTable
                  rows={row.caseClients as object[]}
                  keys={['full_name', 'capacity_first', 'capacity_appeal', 'capacity_cassation']}
                  onRowClick={(r) => r.client_id && setPage('clientProfile', { id: r.client_id })}
                />
              )
            },
            {
              id: 'opponents',
              label: t('tabs.opponents'),
              body: (
                <div>
                  <div className="mb-3 flex gap-2">
                    <div className="min-w-[240px] flex-1">
                    <EntitySelect kind="opponents" value={oppId} onChange={setOppId} />
                    </div>
                    <Button
                      onClick={async () => {
                        if (!oppId) return
                        await invoke('opponents:linkCase', String(oppId), id)
                        toast(t('savedOk'))
                        load()
                      }}
                    >
                      {t('add')}
                    </Button>
                  </div>
                  <MiniTable rows={row.opponents as object[]} keys={['full_name', 'phone', 'lawyer_name', 'lawyer_phone']} />
                </div>
              )
            }
          ]}
        />
      </Card>
      <Card>
        <h3 className="mb-1 font-bold">{t('tabs.relatedCases')}</h3>
        <p className="mb-2 text-xs text-navy-500 dark:text-navy-300">{t('tabs.relatedCasesHint')}</p>
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
              if (!relatedId) {
                toast(t('tabs.relatedCasesHint'), 'err')
                return
              }
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
    </div>
  )
}
