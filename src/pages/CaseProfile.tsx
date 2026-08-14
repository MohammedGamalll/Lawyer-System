import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, InfoGrid, MiniTable, PageHeader, Select, StatusBadge, UiTabs } from '../components/ui'
import { EntitySelect } from '../components/EntitySelect'
import { onDataChanged } from '../lib/bus'

export function CaseProfilePage() {
  const { t } = useTranslation()
  const { pageMeta, setPage, toast } = useApp()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [link, setLink] = useState({ related_case_id: '', link_type: 'appeal' })
  const [oppId, setOppId] = useState('')
  const id = Number(pageMeta.id)
  const load = () => invoke<Record<string, unknown>>('cases:get', id).then(setRow)
  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [id])
  useEffect(() => onDataChanged(() => load().catch(() => undefined)), [id])
  if (!row) return <div>{t('loading')}</div>
  const fees = (row.fees as Record<string, unknown>) || {}

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${row.case_number} — ${row.title}`}
        actions={
          <>
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
            <Button variant="outline" onClick={() => setPage('cases')}>
              {t('back')}
            </Button>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
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
        <UiTabs
          tabs={[
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
            },
            {
              id: 'hearings',
              label: t('tabs.hearings'),
              body: <MiniTable rows={row.hearings as object[]} keys={['hearing_date', 'status', 'result']} />
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
                        await invoke('opponents:linkCase', Number(oppId), id)
                        toast(t('savedOk'))
                        load()
                      }}
                    >
                      {t('add')}
                    </Button>
                  </div>
                  <MiniTable rows={row.opponents as object[]} keys={['full_name', 'phone', 'lawyer_name']} />
                </div>
              )
            }
          ]}
        />
      </Card>
      <Card>
        <h3 className="mb-2 font-bold">{t('nav.cases')}</h3>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[240px] flex-1">
            <EntitySelect
              kind="cases"
              value={link.related_case_id}
              onChange={(v) => setLink({ ...link, related_case_id: v })}
            />
          </div>
          <Select value={link.link_type} onChange={(e) => setLink({ ...link, link_type: e.target.value })}>
            <option value="original">{t('status.original')}</option>
            <option value="appeal">{t('status.appeal')}</option>
            <option value="cassation">{t('status.cassation')}</option>
            <option value="execution">{t('status.execution')}</option>
          </Select>
          <Button
            onClick={async () => {
              await invoke('cases:link', id, Number(link.related_case_id), link.link_type)
              toast(t('savedOk'))
              load()
            }}
          >
            {t('save')}
          </Button>
        </div>
        <MiniTable rows={row.links as object[]} keys={['link_type', 'case_number', 'title']} />
      </Card>
    </div>
  )
}
