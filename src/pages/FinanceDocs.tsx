import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { expenseSchema, invoiceSchema, paymentSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { DatePicker } from '../components/DateTimePicker'
import { EntitySelect } from '../components/EntitySelect'
import { CrudPage } from '../components/CrudPage'
import { formatCell, formatDateTime } from '../lib/datetime'
import { downloadBytes } from '../lib/bytes'
import { onDataChanged } from '../lib/bus'
import { UploadSourceMenu, DocumentThumb, DocumentPreviewModal } from '../components/DocumentTools'

export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const { toast, can, setPage } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({ category: 'other' })
  const [file, setFile] = useState<{ name: string; data: number[] } | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [moveRow, setMoveRow] = useState<Record<string, unknown> | null>(null)
  const [versions, setVersions] = useState<{ id: string; version: number; file_name: string; created_at: string }[] | null>(null)
  const [versionDoc, setVersionDoc] = useState<string | null>(null)
  const [versionMeta, setVersionMeta] = useState<Record<string, unknown> | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const pick = async () => {
    const f = await invoke<{ name: string; data: number[] }>('files:pick')
    setFile(f)
    if (!form.title) setForm({ ...form, title: f.name })
  }
  const save = async () => {
    if (!file) return toast(t('docs.pickFirst'), 'err')
    await invoke('documents:upload', form, file)
    toast(t('docs.uploaded'))
    setOpen(false)
  }

  return (
    <div>
      <p className="mb-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm leading-relaxed text-navy-800 dark:border-navy-700 dark:bg-navy-900 dark:text-white">
        {t('docs.versionsHint')}
      </p>
      <CrudPage
        title={t('nav.documents')}
        listChannel="documents:list"
        updateChannel="documents:update"
        removeChannel="documents:remove"
        createPerm="documents.upload"
        updatePerm="documents.upload"
        deletePerm="documents.delete"
        columns={[
          {
            key: 'title',
            label: t('fields.title'),
            render: (r) => (
              <DocumentThumb id={String(r.id)} title={String(r.title || '')} onOpen={() => setPreviewId(String(r.id))} />
            )
          },
          { key: 'category', label: t('fields.category') },
          {
            key: 'client_name',
            label: t('fields.client_name'),
            onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
          },
          {
            key: 'case_number',
            label: t('fields.case_number'),
            onCellClick: (r) => r.case_id && setPage('caseProfile', { id: r.case_id })
          },
          { key: 'file_name', label: t('fields.file_name') },
          { key: 'current_version', label: t('fields.current_version') }
        ]}
        fields={[
          { name: 'title', label: t('fields.title') },
          { name: 'category', label: t('fields.category'), type: 'select', options: cats(t) },
          { name: 'notes', label: t('fields.notes'), type: 'textarea' }
        ]}
        extraActions={
          can('documents.upload') && (
            <Button variant="gold" onClick={() => setOpen(true)}>
              {t('docs.upload')}
            </Button>
          )
        }
        onRowOpen={(r) => setPreviewId(String(r.id))}
        rowActions={(r) => (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRenameId(String(r.id))
                setNewTitle(String(r.title || ''))
              }}
            >
              {t('rename')}
            </Button>
            <Button variant="ghost" onClick={() => setMoveRow(r)}>
              {t('move')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPreviewId(String(r.id))}
            >
              {t('docs.preview')}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const f = await invoke<{ name: string; data: number[] }>('documents:download', r.id)
                downloadBytes(f.name, f.data)
              }}
            >
              {t('download')}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const rows = await invoke<typeof versions>('documents:versions', r.id)
                setVersionDoc(String(r.id))
                setVersionMeta(r)
                setVersions(rows)
              }}
            >
              {t('versions')}
            </Button>
          </>
        )}
      />
      <Modal open={open} title={t('docs.upload')} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.title')} required>
            <Input value={String(form.title || '')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t('fields.client_id')}>
            <EntitySelect
              kind="clients"
              value={String(form.client_id || '')}
              onChange={(v) => setForm({ ...form, client_id: v })}
            />
          </Field>
          <Field label={t('fields.case_id')}>
            <EntitySelect
              kind="cases"
              value={String(form.case_id || '')}
              clientId={form.client_id as string | number | undefined}
              onChange={(v) => setForm({ ...form, case_id: v })}
            />
          </Field>
          <Field label={t('fields.category')}>
            <Select value={String(form.category)} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {cats(t).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('fields.notes')}>
            <Textarea value={String(form.notes || '')} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Field label={t('fields.hearing_id')}>
            <EntitySelect
              kind="hearings"
              value={String(form.hearing_id || '')}
              onChange={(v) => setForm({ ...form, hearing_id: v })}
            />
          </Field>
          <Field label={t('fields.contract_id')}>
            <EntitySelect
              kind="contracts"
              value={String(form.contract_id || '')}
              onChange={(v) => setForm({ ...form, contract_id: v })}
            />
          </Field>
        </div>
        <div className="mt-3 space-y-2">
          <UploadSourceMenu
            onFile={(f) => {
              setFile(f)
              if (!form.title) setForm({ ...form, title: f.name })
            }}
          />
          {file ? <p className="text-sm text-navy-600">{file.name}</p> : null}
          <Button disabled={!file} onClick={() => save().catch((e) => toast(e.message, 'err'))}>
            {t('save')}
          </Button>
        </div>
      </Modal>
      <Modal open={renameId != null} title={t('rename')} onClose={() => setRenameId(null)}>
        <Field label={t('docs.newTitle')}>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </Field>
        <Button
          className="mt-3"
          disabled={!newTitle.trim()}
          onClick={async () => {
            await invoke('documents:rename', renameId, newTitle)
            toast(t('docs.renamed'))
            setRenameId(null)
          }}
        >
          {t('save')}
        </Button>
      </Modal>
      <Modal open={!!moveRow} title={t('move')} onClose={() => setMoveRow(null)}>
        <Field label={t('docs.targetClient')}>
          <EntitySelect
            kind="clients"
            value={String(moveRow?.client_id ?? '')}
            onChange={(v) => setMoveRow({ ...moveRow, client_id: v })}
          />
        </Field>
        <Field label={t('docs.targetCase')}>
          <EntitySelect
            kind="cases"
            value={String(moveRow?.case_id ?? '')}
            clientId={moveRow?.client_id as string | number | undefined}
            onChange={(v) => setMoveRow({ ...moveRow, case_id: v })}
          />
        </Field>
        <Button
          className="mt-3"
          onClick={async () => {
            await invoke('documents:move', moveRow?.id, {
              client_id: moveRow?.client_id ? String(moveRow.client_id) : undefined,
              case_id: moveRow?.case_id ? String(moveRow.case_id) : undefined
            })
            toast(t('docs.moved'))
            setMoveRow(null)
          }}
        >
          {t('save')}
        </Button>
      </Modal>
      <Modal open={!!versions} title={t('docs.history')} onClose={() => setVersions(null)} wide>
        <p className="mb-3 text-sm text-navy-600 dark:text-navy-200">{t('docs.versionsHint')}</p>
        {can('documents.upload') && versionDoc && (
          <Button
            className="mb-3"
            variant="gold"
            onClick={async () => {
              try {
                const f = await invoke<{ name: string; data: number[] }>('files:pick')
                await invoke(
                  'documents:update',
                  versionDoc,
                  {
                    title: versionMeta?.title,
                    category: versionMeta?.category,
                    notes: versionMeta?.notes,
                    client_id: versionMeta?.client_id,
                    case_id: versionMeta?.case_id
                  },
                  f
                )
                const rows = await invoke<typeof versions>('documents:versions', versionDoc)
                setVersions(rows)
                toast(t('docs.versionAdded'))
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
          >
            {t('docs.addVersion')}
          </Button>
        )}
        <table className="w-full text-sm">
          <tbody>
            {(versions || []).map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-2">v{v.version}</td>
                <td>{formatCell('file_name', v.file_name, i18n.language, t)}</td>
                <td>{formatDateTime(v.created_at, i18n.language)}</td>
                <td>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const f = await invoke<{ name: string; data: number[] }>('documents:download', versionDoc, v.id)
                      downloadBytes(f.name, f.data)
                    }}
                  >
                    {t('download')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
      <DocumentPreviewModal id={previewId} onClose={() => setPreviewId(null)} />
    </div>
  )
}

function cats(t: (k: string) => string) {
  return [
    { value: 'poa', label: t('nav.poa') },
    { value: 'id', label: t('fields.national_id') },
    { value: 'contract', label: t('nav.contracts') },
    { value: 'memo', label: t('types.memo') },
    { value: 'judgment', label: t('types.judgment') },
    { value: 'complaint', label: t('types.complaint') },
    { value: 'case_docs', label: t('types.case_docs') },
    { value: 'mail', label: t('types.mail') },
    { value: 'receipt', label: t('types.receipt') },
    { value: 'other', label: t('status.other') }
  ]
}

async function doPrint(channel: string, id: string, pdf: boolean) {
  const p = await invoke<{ title: string; body: string; kind: string; name?: string }>(channel, id)
  if (pdf) {
    const r = await invoke<{ canceled?: boolean }>('print:pdf', p.kind, p.title, p.body, p.name || `${p.kind}.pdf`)
    if (r?.canceled) return
  } else {
    await invoke('print:print', p.kind, p.title, p.body)
  }
}

type BalanceCase = {
  id: string
  case_number: string
  title: string
  total_fees: number
  paid: number
  remaining: number
}

type ClientBalance = {
  client_id: string | null
  total: number
  paid: number
  remaining: number
  invoiceDue: number
  cases: BalanceCase[]
}

function asFees(row: Record<string, unknown>): Pick<BalanceCase, 'total_fees' | 'paid' | 'remaining'> {
  const fees = (row.fees as Record<string, unknown> | undefined) || row
  return {
    total_fees: Number(fees.total_fees ?? 0),
    paid: Number(fees.paid ?? 0),
    remaining: Number(fees.remaining ?? 0)
  }
}

async function loadClientBalance(clientId: string, caseId: string): Promise<ClientBalance> {
  let cid = clientId
  if (!cid && caseId) {
    const cs = await invoke<Record<string, unknown>>('cases:get', caseId)
    cid = String(cs.client_id || '')
    const f = asFees(cs)
    return {
      client_id: cid || null,
      total: f.total_fees,
      paid: f.paid,
      remaining: f.remaining,
      invoiceDue: 0,
      cases: [
        {
          id: String(cs.id || ''),
          case_number: String(cs.case_number ?? ''),
          title: String(cs.title ?? ''),
          ...f
        }
      ]
    }
  }

  const profile = await invoke<Record<string, unknown>>('clients:profile', cid)
  const rawCases = (profile.cases as Record<string, unknown>[]) || []
  let cases: BalanceCase[] = rawCases.map((c) => ({
    id: String(c.id || ''),
    case_number: String(c.case_number ?? ''),
    title: String(c.title ?? ''),
    ...asFees(c)
  }))

  const hasFeeCols = rawCases.some((c) => 'remaining' in c || 'total_fees' in c)
  if (!hasFeeCols) {
    const ids = (caseId ? cases.filter((c) => c.id === caseId) : cases).slice(0, 25)
    cases = await Promise.all(
      ids.map(async (c) => {
        try {
          const full = await invoke<Record<string, unknown>>('cases:get', c.id)
          return { ...c, ...asFees(full) }
        } catch {
          return c
        }
      })
    )
  } else if (caseId) {
    cases = cases.filter((c) => c.id === caseId)
  }

  const total = cases.reduce((s, c) => s + c.total_fees, 0)
  const paid = cases.reduce((s, c) => s + c.paid, 0)
  const remainingSum = cases.reduce((s, c) => s + c.remaining, 0)
  const remaining = total || paid || remainingSum ? remainingSum : Number(profile.due ?? 0)

  let invoiceDue = 0
  try {
    const inv = await invoke<{ rows: { client_id: string; case_id?: string; total: number; paid: number; status: string }[] }>(
      'invoices:list',
      { page: 1, pageSize: 100 }
    )
    invoiceDue = (inv.rows || [])
      .filter(
        (r) =>
          String(r.client_id) === String(cid) &&
          r.status !== 'paid' &&
          (!caseId || String(r.case_id) === String(caseId) || !r.case_id)
      )
      .reduce((s, r) => s + (Number(r.total) - Number(r.paid)), 0)
  } catch {
    /* تجاهل */
  }

  return { client_id: cid, total, paid, remaining, invoiceDue, cases }
}

function PaymentBalance({
  clientId,
  caseId,
  amount,
  onFill
}: {
  clientId?: unknown
  caseId?: unknown
  amount?: unknown
  onFill: (patch: Record<string, unknown>) => void
}) {
  const { t, i18n } = useTranslation()
  const [b, setB] = useState<ClientBalance | null>(null)
  const [loading, setLoading] = useState(false)
  const loc = i18n.language === 'en' ? 'en-EG' : 'ar-EG'
  const cid = clientId ? String(clientId) : ''
  const kid = caseId ? String(caseId) : ''

  useEffect(() => {
    if (!cid && !kid) {
      setB(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadClientBalance(cid, kid)
      .then((res) => {
        if (cancelled) return
        setB(res)
        const rem = Number(res.remaining)
        if (kid && rem > 0 && (!amount || Number(amount) === 0)) onFill({ amount: rem, client_id: res.client_id || cid })
      })
      .catch(() => {
        if (!cancelled) setB({ client_id: cid || null, total: 0, paid: 0, remaining: 0, invoiceDue: 0, cases: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cid, kid])

  if (!cid && !kid) return null
  if (loading && !b) return <div className="mt-3 text-sm text-navy-400">{t('loading')}</div>
  if (!b) return null

  return (
    <div className="mt-4 rounded-xl border border-gold-300 bg-gold-50 p-3 dark:bg-navy-800 dark:border-gold-700">
      <div className="mb-2 text-sm font-bold text-navy-900 dark:text-white">{t('finance.clientBalance')}</div>
      <div className="grid gap-2 text-sm md:grid-cols-4">
        <div className="rounded-lg bg-white px-3 py-2 dark:bg-navy-900">
          <div className="text-xs text-navy-500">{t('finance.feesTotal')}</div>
          <div className="text-lg font-extrabold">{b.total.toLocaleString(loc)}</div>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 dark:bg-navy-900">
          <div className="text-xs text-navy-500">{t('finance.alreadyPaid')}</div>
          <div className="text-lg font-extrabold text-emerald-700">{b.paid.toLocaleString(loc)}</div>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 dark:bg-navy-900">
          <div className="text-xs text-navy-500">{t('finance.stillDue')}</div>
          <div className="text-lg font-extrabold text-red-700">{b.remaining.toLocaleString(loc)}</div>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 dark:bg-navy-900">
          <div className="text-xs text-navy-500">{t('finance.invoiceDue')}</div>
          <div className="text-lg font-extrabold">{b.invoiceDue.toLocaleString(loc)}</div>
        </div>
      </div>
      {b.remaining > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => onFill({ amount: b.remaining, client_id: b.client_id || cid })}
        >
          {t('finance.fillRemaining')}
        </Button>
      )}
      {b.cases.length > 1 || (!kid && b.cases.length > 0) ? (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-navy-600">{t('finance.pickCaseToPay')}</div>
          <div className="max-h-40 overflow-auto rounded-lg bg-white dark:bg-navy-900">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-navy-500">
                  <th className="px-2 py-1 text-start">{t('fields.case_number')}</th>
                  <th className="px-2 py-1 text-start">{t('fields.title')}</th>
                  <th className="px-2 py-1 text-start">{t('finance.feesTotal')}</th>
                  <th className="px-2 py-1 text-start">{t('finance.alreadyPaid')}</th>
                  <th className="px-2 py-1 text-start">{t('finance.stillDue')}</th>
                </tr>
              </thead>
              <tbody>
                {b.cases.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t hover:bg-gold-50"
                    onClick={() =>
                      onFill({
                        case_id: c.id,
                        client_id: b.client_id || cid,
                        amount: Number(c.remaining) > 0 ? Number(c.remaining) : Number(c.total_fees)
                      })
                    }
                  >
                    <td className="px-2 py-1.5 text-start">{c.case_number}</td>
                    <td className="px-2 py-1.5 text-start">{c.title}</td>
                    <td className="px-2 py-1.5 text-start">{Number(c.total_fees).toLocaleString(loc)}</td>
                    <td className="px-2 py-1.5 text-start">{Number(c.paid).toLocaleString(loc)}</td>
                    <td className="px-2 py-1.5 text-start font-bold text-red-700">{Number(c.remaining).toLocaleString(loc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AccountsPage() {
  const { t } = useTranslation()
  const { toast, setPage, pageMeta, goBack } = useApp()
  const caseId = String(pageMeta.case_id || '')
  const clientId = String(pageMeta.client_id || '')
  const listFilters: Record<string, unknown> = {}
  if (caseId) listFilters.case_id = caseId
  else if (clientId) listFilters.client_id = clientId
  return (
    <div className="space-y-8">
      <CrudPage
        title={t('finance.payments')}
        listChannel="payments:list"
        createChannel="payments:create"
        removeChannel="payments:remove"
        createPerm="accounts.payment"
        deletePerm="accounts.payment"
        schema={paymentSchema}
        listFilters={Object.keys(listFilters).length ? listFilters : undefined}
        defaults={{ case_id: caseId || undefined, client_id: clientId || undefined }}
        extraActions={
          caseId || clientId ? (
            <Button variant="outline" onClick={() => goBack()}>
              {t('back')}
            </Button>
          ) : undefined
        }
        columns={[
          { key: 'payment_number', label: t('fields.payment_number') },
          {
            key: 'client_name',
            label: t('fields.client_name'),
            onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
          },
          {
            key: 'case_number',
            label: t('fields.case_number'),
            onCellClick: (r) => r.case_id && setPage('caseProfile', { id: r.case_id })
          },
          { key: 'amount', label: t('fields.amount'), money: true },
          { key: 'payment_type', label: t('fields.payment_type') },
          { key: 'payment_method', label: t('fields.payment_method') },
          { key: 'payment_date', label: t('fields.payment_date') }
        ]}
        fields={[
          { name: 'client_id', label: t('fields.client_id'), lookup: 'clients' },
          { name: 'case_id', label: t('fields.case_id'), lookup: 'cases' },
          { name: 'amount', label: t('fields.amount'), type: 'number', required: true },
          {
            name: 'payment_type',
            label: t('fields.payment_type'),
            type: 'select',
            options: ['fees', 'advance', 'installment', 'consultation', 'service', 'reimbursed', 'other'].map((v) => ({
              value: v,
              label: t(`types.${v}`)
            }))
          },
          {
            name: 'payment_method',
            label: t('fields.payment_method'),
            type: 'select',
            options: ['cash', 'bank', 'card', 'wallet', 'other'].map((v) => ({ value: v, label: t(`types.${v}`) }))
          },
          { name: 'cashbox_id', label: t('fields.cashbox_id'), lookup: 'cashboxes' },
          { name: 'payment_date', label: t('fields.payment_date'), type: 'date' },
          { name: 'notes', label: t('fields.notes'), type: 'textarea' }
        ]}
        formExtra={(form, setField) => (
          <PaymentBalance
            clientId={form.client_id}
            caseId={form.case_id}
            amount={form.amount}
            onFill={(patch) => {
              for (const [k, v] of Object.entries(patch)) setField(k, v)
            }}
          />
        )}
        onRowOpen={(r) => r.case_id && setPage('caseProfile', { id: r.case_id })}
        rowActions={(r) => (
          <>
            <Button variant="ghost" onClick={() => doPrint('print:receipt', String(r.id), false).catch((e) => toast(e.message, 'err'))}>
              {t('print')}
            </Button>
            <Button variant="ghost" onClick={() => doPrint('print:receipt', String(r.id), true).catch((e) => toast(e.message, 'err'))}>
              {t('exportPdf')}
            </Button>
          </>
        )}
      />
    </div>
  )
}

function isSalaryCategory(c: { name_ar?: string | null; name_en?: string | null }) {
  const s = `${c.name_ar || ''} ${c.name_en || ''}`.toLowerCase()
  return /راتب|رواتب|salary|salaries|payroll|wage/.test(s)
}

function ExpenseSalaryStaff({
  categoryId,
  employeeId,
  description,
  setField
}: {
  categoryId?: unknown
  employeeId?: unknown
  description?: unknown
  setField: (name: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const [cats, setCats] = useState<{ id: string; name_ar?: string; name_en?: string }[]>([])
  const [staff, setStaff] = useState<{ id: string; full_name: string; job_title?: string | null; salary?: number | null }[]>([])

  useEffect(() => {
    invoke<{ id: string; name_ar?: string; name_en?: string }[]>('expenses:categories')
      .then(setCats)
      .catch(() => setCats([]))
  }, [])

  const salaryCat = cats.some((c) => String(c.id) === String(categoryId ?? '') && isSalaryCategory(c))

  useEffect(() => {
    if (!salaryCat) return
    invoke<{ id: string; full_name: string; job_title?: string | null; salary?: number | null }[]>('expenses:staff')
      .then((rows) => setStaff(Array.isArray(rows) ? rows : []))
      .catch(() =>
        invoke<{ rows: { id: string; full_name: string; job_title?: string | null; salary?: number | null }[] }>('employees:list', {
          pageSize: 1000
        })
          .then((r) => setStaff(r.rows || []))
          .catch(() => setStaff([]))
      )
  }, [salaryCat])

  if (!salaryCat) return null

  const picked = staff.find((s) => String(s.id) === String(employeeId ?? ''))
  const salaryNum = picked?.salary == null ? NaN : Number(picked.salary)
  const hasSalary = Number.isFinite(salaryNum) && salaryNum > 0

  return (
    <div className="grid grid-cols-1 gap-2">
      <Field label={t('finance.pickEmployeeSalary')} required>
        <Select
          value={employeeId ? String(employeeId) : ''}
          onChange={(e) => {
            const id = e.target.value
            if (!id) {
              setField('employee_id', '')
              return
            }
            const emp = staff.find((s) => String(s.id) === id)
            setField('employee_id', id)
            const n = emp?.salary == null ? NaN : Number(emp.salary)
            setField('amount', Number.isFinite(n) && n > 0 ? n : '')
            const desc = String(description ?? '').trim()
            if (emp && (!desc || desc.startsWith('راتب ') || desc.toLowerCase().startsWith('salary '))) {
              setField('description', `راتب ${emp.full_name}`)
            }
          }}
        >
          <option value="">—</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
              {s.job_title ? ` — ${s.job_title}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {picked && !hasSalary ? <p className="text-xs text-navy-500">{t('finance.salaryEmptyHint')}</p> : null}
    </div>
  )
}

export function ExpensesPage() {
  const { t } = useTranslation()
  const { toast } = useApp()
  return (
      <CrudPage
        title={t('nav.expenses')}
        listChannel="expenses:list"
        createChannel="expenses:create"
        removeChannel="expenses:remove"
        createPerm="accounts.expense"
        deletePerm="accounts.expense"
        schema={expenseSchema}
        columns={[
          { key: 'expense_number', label: t('fields.expense_number') },
          { key: 'category_name', label: t('fields.category_name') },
          { key: 'amount', label: t('fields.amount'), money: true },
          { key: 'expense_date', label: t('fields.expense_date') },
          { key: 'description', label: t('fields.description') }
        ]}
        fields={[
          { name: 'category_id', label: t('fields.category_id'), lookup: 'expenseCategories' },
          { name: 'amount', label: t('fields.amount'), type: 'number', required: true },
          { name: 'cashbox_id', label: t('fields.cashbox_id'), lookup: 'cashboxes' },
          { name: 'expense_date', label: t('fields.expense_date'), type: 'date' },
          { name: 'client_id', label: t('fields.client_id'), lookup: 'clients' },
          { name: 'case_id', label: t('fields.case_id'), lookup: 'cases' },
          { name: 'description', label: t('fields.description'), type: 'textarea' }
        ]}
        formExtraAfter="category_id"
        formExtra={(form, setField) => (
          <ExpenseSalaryStaff
            categoryId={form.category_id}
            employeeId={form.employee_id}
            description={form.description}
            setField={setField}
          />
        )}
        rowActions={(r) => (
          <>
            <Button variant="ghost" onClick={() => doPrint('print:voucher', String(r.id), false).catch((e) => toast(e.message, 'err'))}>
              {t('print')}
            </Button>
            <Button variant="ghost" onClick={() => doPrint('print:voucher', String(r.id), true).catch((e) => toast(e.message, 'err'))}>
              {t('exportPdf')}
            </Button>
          </>
        )}
      />
  )
}

export function InvoicesPage() {
  const { t, i18n } = useTranslation()
  const { toast, can } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({
    items: [{ description: t('types.fees'), quantity: 1, unit_price: 0 }]
  })
  const [err, setErr] = useState('')
  const [caseFees, setCaseFees] = useState<{ total: number; paid: number; remaining: number; case_number?: string } | null>(null)

  const items = (form.items as { description: string; quantity: number; unit_price: number }[]) || []
  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0)
  const tax = Number(form.tax || 0)
  const total = subtotal + tax
  const loc = i18n.language === 'en' ? 'en-EG' : 'ar-EG'

  const setItems = (next: typeof items) => setForm({ ...form, items: next })

  const onPickCase = async (v: string) => {
    if (!v) {
      setForm({ ...form, case_id: '' })
      setCaseFees(null)
      return
    }
    try {
      const d = await invoke<Record<string, unknown>>('cases:get', String(v))
      const fees = (d.fees as Record<string, unknown>) || {}
      const remaining = Number(fees.remaining ?? 0)
      const totalFees = Number(fees.total_fees ?? d.total_fees ?? 0)
      const paid = Number(fees.paid ?? 0)
      const price = remaining > 0 ? remaining : totalFees
      setCaseFees({ total: totalFees, paid, remaining, case_number: String(d.case_number || '') })
      setForm({
        ...form,
        case_id: v,
        client_id: d.client_id || form.client_id,
        items: [
          {
            description: `${t('types.fees')} — ${d.case_number} ${d.title || ''}`.trim(),
            quantity: 1,
            unit_price: price
          }
        ]
      })
    } catch (e) {
      toast((e as Error).message, 'err')
      setForm({ ...form, case_id: v })
    }
  }

  const printInv = async (id: string, pdf = false) => {
    const p = await invoke<{ title: string; body: string; kind: string }>('print:preview', id)
    if (pdf) {
      const r = await invoke<{ canceled?: boolean }>('print:pdf', p.kind, p.title, p.body, `invoice-${id}.pdf`)
      if (r?.canceled) return
    } else await invoke('print:print', p.kind, p.title, p.body)
  }

  return (
    <div>
      <CrudPage
        title={t('finance.invoices')}
        listChannel="invoices:list"
        removeChannel="invoices:remove"
        createPerm="invoices.manage"
        deletePerm="invoices.manage"
        columns={[
          { key: 'invoice_number', label: t('fields.invoice_number') },
          { key: 'client_name', label: t('fields.client_name') },
          { key: 'case_number', label: t('fields.case_number') },
          { key: 'total', label: t('fields.total'), money: true },
          { key: 'paid', label: t('status.paid'), money: true },
          { key: 'status', label: t('fields.status'), status: true },
          { key: 'invoice_date', label: t('fields.invoice_date') }
        ]}
        fields={[{ name: 'notes', label: t('fields.notes'), type: 'textarea' }]}
        extraActions={
          can('invoices.manage') ? (
          <Button
            variant="gold"
            onClick={() => {
              setErr('')
              setCaseFees(null)
              setForm({ items: [{ description: t('types.fees'), quantity: 1, unit_price: 0 }] })
              setOpen(true)
            }}
          >
            {t('finance.newInvoice')}
          </Button>
          ) : null
        }
        rowActions={(r) => (
          <>
            <Button variant="ghost" onClick={() => printInv(String(r.id)).catch((e) => toast(e.message, 'err'))}>
              {t('print')}
            </Button>
            <Button variant="ghost" onClick={() => printInv(String(r.id), true).catch((e) => toast(e.message, 'err'))}>
              {t('exportPdf')}
            </Button>
          </>
        )}
      />
      <Modal open={open} title={t('finance.newInvoice')} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('fields.client_id')} required>
            <EntitySelect
              kind="clients"
              value={String(form.client_id || '')}
              onChange={(v) => setForm({ ...form, client_id: v })}
            />
          </Field>
          <Field label={t('fields.case_id')}>
            <EntitySelect
              kind="cases"
              value={String(form.case_id || '')}
              clientId={form.client_id as string | number | undefined}
              onChange={onPickCase}
            />
          </Field>
          <Field label={t('fields.invoice_date')}>
            <DatePicker value={String(form.invoice_date || '')} onChange={(d) => setForm({ ...form, invoice_date: d })} />
          </Field>
        </div>
        {caseFees && (
          <div className="mt-3 grid gap-2 rounded-lg bg-navy-50 p-3 text-sm md:grid-cols-3 dark:bg-navy-800">
            <div>
              {t('fields.total_fees')}: <b>{caseFees.total.toLocaleString(loc)}</b>
            </div>
            <div>
              {t('status.paid')}: <b>{caseFees.paid.toLocaleString(loc)}</b>
            </div>
            <div>
              {t('due')}: <b>{caseFees.remaining.toLocaleString(loc)}</b>
            </div>
          </div>
        )}
        <div className="mt-4">
          <div className="mb-2 text-sm font-bold">{t('finance.items')}</div>
          {items.map((it, idx) => (
            <div key={idx} className="mb-2 grid gap-2 md:grid-cols-12">
              <Input
                className="md:col-span-5"
                value={it.description}
                onChange={(e) => {
                  const next = [...items]
                  next[idx] = { ...it, description: e.target.value }
                  setItems(next)
                }}
              />
              <Input
                className="md:col-span-2"
                type="number"
                value={it.quantity}
                onChange={(e) => {
                  const next = [...items]
                  next[idx] = { ...it, quantity: Number(e.target.value) }
                  setItems(next)
                }}
              />
              <Input
                className="md:col-span-3"
                type="number"
                value={it.unit_price}
                onChange={(e) => {
                  const next = [...items]
                  next[idx] = { ...it, unit_price: Number(e.target.value) }
                  setItems(next)
                }}
              />
              <div className="md:col-span-2 flex items-center text-sm font-semibold">
                {(Number(it.quantity || 1) * Number(it.unit_price || 0)).toLocaleString(loc)}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems([...items, { description: '', quantity: 1, unit_price: 0 }])}
          >
            {t('finance.addItem')}
          </Button>
          <div className="mt-3 space-y-1 text-sm">
            <div>
              {t('finance.subtotal')}: <b>{subtotal.toLocaleString(loc)}</b>
            </div>
            <div>
              {t('fields.total')}: <b>{total.toLocaleString(loc)}</b>
            </div>
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            onClick={async () => {
              const parsed = invoiceSchema.safeParse({
                ...form,
                client_id: form.client_id ? String(form.client_id) : undefined,
                case_id: form.case_id ? String(form.case_id) : undefined,
                items
              })
              if (!parsed.success) {
                setErr(parsed.error.issues[0]?.message || t('error'))
                return
              }
              await invoke('invoices:create', parsed.data)
              toast(t('savedOk'))
              setOpen(false)
            }}
          >
            {t('save')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export function CashboxPage() {
  const { t, i18n } = useTranslation()
  const { toast, can } = useApp()
  const [boxes, setBoxes] = useState<{ id: string; name: string; type: string; current_balance: number }[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [tx, setTx] = useState<{ rows: object[] }>({ rows: [] })
  const [move, setMove] = useState({ type: 'deposit', amount: 0, description: '' })

  const load = () => invoke<typeof boxes>('cashbox:list').then(setBoxes)
  useEffect(() => {
    load()
  }, [])
  useEffect(() => onDataChanged(() => load()), [])
  useEffect(() => {
    if (sel) invoke<{ rows: object[] }>('cashbox:transactions', sel).then(setTx)
  }, [sel])

  return (
    <div className="space-y-4">
      <PageHeader title={t('finance.cashbox')} />
      <div className="grid gap-3 md:grid-cols-3">
        {boxes.map((b) => (
          <Card key={b.id} className={`cursor-pointer ${sel === b.id ? 'ring-2 ring-gold-400' : ''}`}>
            <button className="w-full text-right" onClick={() => setSel(b.id)}>
              <div className="text-sm text-navy-500">
                {b.name} — {t(`types.${b.type}`, { defaultValue: b.type })}
              </div>
              <div className="text-2xl font-extrabold">{Number(b.current_balance).toLocaleString('ar-EG')}</div>
            </button>
          </Card>
        ))}
      </div>
      {sel && (
        <Card>
          {can('accounts.payment') && (
          <div className="mb-3 flex gap-2">
            <Select value={move.type} onChange={(e) => setMove({ ...move, type: e.target.value })}>
              <option value="deposit">{t('finance.deposit')}</option>
              <option value="withdrawal">{t('finance.withdrawal')}</option>
            </Select>
            <Input type="number" onChange={(e) => setMove({ ...move, amount: Number(e.target.value) })} />
            <Input onChange={(e) => setMove({ ...move, description: e.target.value })} />
            <Button
              onClick={async () => {
                await invoke('cashbox:move', { cashbox_id: sel, ...move })
                toast(t('savedOk'))
                load()
              }}
            >
              {t('save')}
            </Button>
          </div>
          )}
          <table className="w-full table-fixed border-collapse text-sm">
            <tbody>
              {(tx.rows as { id: string; transaction_type: string; amount: number; description: string; created_at: string }[]).map(
                (r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1.5 text-start">{formatCell('transaction_type', r.transaction_type, i18n.language, t)}</td>
                    <td className="px-2 py-1.5 text-start">{Number(r.amount).toLocaleString(i18n.language === 'en' ? 'en-EG' : 'ar-EG')}</td>
                    <td className="px-2 py-1.5 text-start">{r.description}</td>
                    <td className="px-2 py-1.5 text-start">{formatDateTime(r.created_at, i18n.language)}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
