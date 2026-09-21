import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { CaseFormExtras } from '../components/CaseFormExtras'
import { PrintFieldPicker } from '../components/PrintFieldPicker'
import { ContactActions } from '../components/ContactActions'
import { AndOthers } from '../components/AndOthers'
import { Button, Input, Select } from '../components/ui'
import { EntitySelect } from '../components/EntitySelect'
import { LookupCombo } from '../components/LookupCombo'
import { DatePicker } from '../components/DateTimePicker'
import { formatProgramCode, displayClientCode, isManualProgramCode } from '../lib/courtNumber'
import { CourtNumberText } from '../components/CourtNumberText'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { REMINDER_TYPES } from '@shared/types'
import {
  appointmentSchema,
  caseSchema,
  clientSchema,
  consultationSchema,
  contractSchema,
  correspondenceSchema,
  opponentSchema,
  poaSchema,
  reminderSchema
} from '@shared/schemas'
import { ClientForm, uploadClientPendingDocs } from '../components/ClientForm'
import { PartyForm, uploadOpponentPendingDocs } from '../components/PartyForm'
import {
  AttachDocumentControl,
  DocumentPreviewModal,
  DocumentThumb,
  uploadPendingDocs,
  type PendingDoc
} from '../components/DocumentTools'
import { caseFormFields } from '../lib/caseForm'
import { clientBlankFormHtml } from '../lib/clientBlankForm'
import {
  applyPrintColFilters,
  buildCasePrintTable,
  casePrintFields,
  compactTableHtml,
  sendPrint
} from '../lib/printKit'
import { StaffFormPage } from './StaffForm'
import { ClientProfilePage } from './ClientProfile'
import { OpponentProfilePage } from './OpponentProfile'
import { CaseProfilePage } from './CaseProfile'

export { ClientProfilePage, CaseProfilePage, StaffFormPage, OpponentProfilePage }

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

function f(t: (k: string) => string, name: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label: t(`fields.${name}`), ...extra }
}

function PrintFilterCheck({
  on,
  label,
  onToggle,
  children
}: {
  on: boolean
  label: string
  onToggle: (v: boolean) => void
  children?: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span className="font-semibold">{label}</span>
      </label>
      {on ? children : null}
    </div>
  )
}

type CasePrintExtra = {
  case_type: boolean
  case_type_id: string
  title: boolean
  title_value: string
  dates: boolean
  date_from: string
  date_to: string
  status: boolean
  status_value: string
  court: boolean
  court_value: string
  lawyer: boolean
  lawyer_id: string
  client: boolean
  client_id: string
  opponent: boolean
  opponent_value: string
}

const emptyCasePrintExtra = (): CasePrintExtra => ({
  case_type: false,
  case_type_id: '',
  title: false,
  title_value: '',
  dates: false,
  date_from: '',
  date_to: '',
  status: false,
  status_value: '',
  court: false,
  court_value: '',
  lawyer: false,
  lawyer_id: '',
  client: false,
  client_id: '',
  opponent: false,
  opponent_value: ''
})

export function ClientsPage() {
  const { t } = useTranslation()
  const { setPage, can, toast, pageMeta } = useApp()
  const showContact = can('clients.unmask_contact')
  const listFilters: Record<string, unknown> = {}
  if (pageMeta.created_from) listFilters.created_from = String(pageMeta.created_from)
  return (
    <CrudPage
      title={t('nav.clients')}
      listChannel="clients:list"
      listFilters={Object.keys(listFilters).length ? listFilters : undefined}
      createChannel="clients:create"
      updateChannel="clients:update"
      removeChannel="clients:remove"
      createPerm="clients.create"
      updatePerm="clients.update"
      deletePerm="clients.delete"
      schema={clientSchema}
      defaults={{ id_kind: 'national_id' }}
      columns={[
        { key: 'client_number', label: t('fields.client_number'), render: (r) => displayClientCode(r.client_number) },
        {
          key: 'full_name',
          label: t('fields.full_name'),
          onCellClick: (r) => setPage('clientProfile', { id: r.id })
        },
        {
          key: 'phone',
          label: t('fields.phone'),
          render: (r) => (
            <span className="inline-flex items-center gap-1">
              <span dir="ltr">{String(r.phone ?? r.whatsapp ?? '')}</span>
              {showContact ? <ContactActions phone={String(r.phone || '')} whatsapp={String(r.whatsapp || '')} /> : null}
            </span>
          )
        },
        { key: 'national_id', label: t('fields.national_id') },
        { key: 'profession', label: t('fields.profession') },
        ...(can('accounts.view') ? [{ key: 'due', label: t('due'), money: true as const }] : [])
      ]}
      fields={[]}
      formBody={(form, setField, errors) => (
        <ClientForm values={form} onChange={setField} errors={errors} clientId={String(form.id || '')} />
      )}
      afterSave={async ({ result, form }) => {
        const id = String((result as { id?: string })?.id || form.id || '')
        if (!id) return
        try {
          let poaId = String((result as { poa_id?: string })?.poa_id || '')
          const docs = ((form.__pending_docs as PendingDoc[]) || []).concat(
            form.__pending_poa ? [{ localId: 'poa', category: 'poa' } as PendingDoc] : []
          )
          const hasPoaDoc = docs.some((d) => /^(poa|توكيل)$/i.test(String(d.category || '')))
          if (!poaId && (hasPoaDoc || String(form.poa_number || '').trim())) {
            const created = await invoke<{ id: string }>('poa:create', {
              client_id: id,
              poa_number: form.poa_number,
              poa_year: form.poa_year,
              poa_letter: form.poa_letter,
              poa_office: form.poa_office
            })
            poaId = created.id
          }
          await uploadClientPendingDocs(id, form, poaId ? { poa_id: poaId } : undefined)
        } catch (e) {
          toast((e as Error).message, 'err')
        }
      }}
      extraActions={
        <>
          <Button
            variant="outline"
            onClick={() =>
              invoke('print:print', 'a4', t('clients.blankForm'), clientBlankFormHtml()).catch((e) =>
                toast((e as Error).message, 'err')
              )
            }
          >
            {t('clients.printBlank')}
          </Button>
          <ImportButton kind="clients" />
        </>
      }
      onRowOpen={(r) => setPage('clientProfile', { id: r.id })}
    />
  )
}

export function CasesPage() {
  const { t, i18n } = useTranslation()
  const { setPage, toast, pageMeta } = useApp()
  const [draft, setDraft] = useState({ office_case_number: '', program_code: '', client_name: '', opponent_name: '' })
  const [applied, setApplied] = useState<Record<string, unknown>>(draft)
  const [printOpen, setPrintOpen] = useState(false)
  const [printScope, setPrintScope] = useState<'filtered' | 'all' | 'upcoming'>('filtered')
  const [printColFilters, setPrintColFilters] = useState<Record<string, string>>({})
  const [printExtra, setPrintExtra] = useState<CasePrintExtra>(emptyCasePrintExtra)
  useEffect(() => {
    setApplied((p) => {
      const next = { ...p }
      delete next.status_in
      delete next.status
      delete next.status_not_in
      if (pageMeta.status_in) next.status_in = String(pageMeta.status_in)
      if (pageMeta.status) next.status = String(pageMeta.status)
      if (pageMeta.status_not_in) next.status_not_in = String(pageMeta.status_not_in)
      return next
    })
  }, [pageMeta.status_in, pageMeta.status, pageMeta.status_not_in])
  const runSearch = () => {
    setApplied({
      ...draft,
      ...(pageMeta.status_in ? { status_in: String(pageMeta.status_in) } : {}),
      ...(pageMeta.status ? { status: String(pageMeta.status) } : {}),
      ...(pageMeta.status_not_in ? { status_not_in: String(pageMeta.status_not_in) } : {})
    })
  }
  const setExtra = <K extends keyof CasePrintExtra>(key: K, value: CasePrintExtra[K]) =>
    setPrintExtra((p) => ({ ...p, [key]: value }))
  return (
    <>
    <CrudPage
      title={t('nav.cases')}
      listChannel="cases:list"
      createChannel="cases:create"
      updateChannel="cases:update"
      removeChannel="cases:remove"
      createPerm="cases.create"
      updatePerm="cases.update"
      deletePerm="cases.delete"
      schema={caseSchema}
      hideQuickSearch
      listFilters={applied}
      extraFilters={
        <div className="flex w-full flex-wrap items-end gap-2">
          <Input
            className="min-w-[10rem] flex-1"
            autoFocus
            placeholder={t('cases.searchCourtHint')}
            dir="ltr"
            value={draft.office_case_number}
            onChange={(e) => setDraft({ ...draft, office_case_number: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <Input
            className="min-w-[10rem] flex-1"
            placeholder={t('fields.program_code')}
            dir="ltr"
            value={draft.program_code}
            onChange={(e) => setDraft({ ...draft, program_code: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <Input
            className="min-w-[10rem] flex-1"
            placeholder={t('fields.client_name')}
            value={draft.client_name}
            onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <Input
            className="min-w-[10rem] flex-1"
            placeholder={t('fields.opponent_name')}
            value={draft.opponent_name}
            onChange={(e) => setDraft({ ...draft, opponent_name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <Button type="button" onClick={runSearch}>
            {t('search')}
          </Button>
        </div>
      }
      columns={[
        {
          key: 'case_number',
          label: t('fields.program_code'),
          render: (r) => (
            <span className={isManualProgramCode(r) ? 'font-bold text-red-600' : ''}>{formatProgramCode(r)}</span>
          ),
          onCellClick: (r) => setPage('caseProfile', { id: r.id })
        },
        {
          key: 'office_case_number',
          label: t('fields.court_number'),
          render: (r) => <CourtNumberText row={r} />
        },
        { key: 'title', label: t('fields.case_subject'), onCellClick: (r) => setPage('caseProfile', { id: r.id }) },
        {
          key: 'client_name',
          label: t('fields.client_name'),
          render: (r) => (
            <AndOthers
              primary={String(r.client_name || '')}
              extraNames={r.extra_client_names}
              extraCount={r.extra_client_count}
            />
          ),
          onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
        },
        {
          key: 'opponent_name',
          label: t('fields.opponent_name'),
          render: (r) => {
            const names = String(r.opponent_names || '')
              .split(/[،,]/)
              .map((s) => s.trim())
              .filter(Boolean)
            const primary = String(r.opponent_name || names[0] || '')
            const extras = names.filter((n) => n !== primary)
            return <AndOthers primary={primary} extraNames={extras.join('، ')} extraCount={extras.length} />
          }
        },
        { key: 'lawyer_name', label: t('fields.lawyer_id') },
        { key: 'case_type_name', label: t('fields.case_type_name') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      compactForm
      fields={caseFormFields(t)}
      onRowOpen={(r) => setPage('caseProfile', { id: r.id })}
      extraActions={<ImportButton kind="cases" />}
      onPrint={(ctx) => {
        setPrintColFilters(ctx.colFilters)
        setPrintOpen(true)
      }}
      afterSave={async ({ created, result }) => {
        if (!created) return
        const id = String((result as { id?: string })?.id || '')
        if (id) setPage('caseProfile', { id }, { replace: true })
      }}
      defaults={{
        received_date: new Date().toISOString().slice(0, 10),
        extra_clients: [],
        extra_opponents: []
      }}
      formPrefix={(form, setField) => <CaseFormExtras form={form} setField={setField} />}
    />
    <PrintFieldPicker
      open={printOpen}
      title={t('print')}
      wide
      fields={casePrintFields(t)}
      extra={
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t('printKit.scope')}</p>
            {(['filtered', 'all', 'upcoming'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="radio" name="case-print-scope" checked={printScope === s} onChange={() => setPrintScope(s)} />
                {s === 'all' ? t('printKit.allCases') : s === 'upcoming' ? t('printKit.upcoming') : t('printKit.filtered')}
              </label>
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-navy-100 p-3 dark:border-navy-700">
            <p className="text-sm font-semibold">{t('printKit.extraFilters')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PrintFilterCheck
                on={printExtra.case_type}
                label={t('fields.case_type_id')}
                onToggle={(v) => setExtra('case_type', v)}
              >
                <EntitySelect kind="caseTypes" value={printExtra.case_type_id} onChange={(v) => setExtra('case_type_id', v)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.title}
                label={t('fields.case_subject')}
                onToggle={(v) => setExtra('title', v)}
              >
                <Input value={printExtra.title_value} onChange={(e) => setExtra('title_value', e.target.value)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.dates}
                label={`${t('printKit.dateFrom')} / ${t('printKit.dateTo')}`}
                onToggle={(v) => setExtra('dates', v)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <DatePicker value={printExtra.date_from} onChange={(v) => setExtra('date_from', v)} />
                  <DatePicker value={printExtra.date_to} onChange={(v) => setExtra('date_to', v)} />
                </div>
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.status}
                label={t('fields.status')}
                onToggle={(v) => setExtra('status', v)}
              >
                <LookupCombo kind="case_status" value={printExtra.status_value} onChange={(v) => setExtra('status_value', v)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.court}
                label={t('fields.court')}
                onToggle={(v) => setExtra('court', v)}
              >
                <LookupCombo kind="court" value={printExtra.court_value} onChange={(v) => setExtra('court_value', v)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.lawyer}
                label={t('fields.lawyer_id')}
                onToggle={(v) => setExtra('lawyer', v)}
              >
                <EntitySelect kind="lawyers" value={printExtra.lawyer_id} onChange={(v) => setExtra('lawyer_id', v)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.client}
                label={t('fields.client_id')}
                onToggle={(v) => setExtra('client', v)}
              >
                <EntitySelect kind="clients" value={printExtra.client_id} onChange={(v) => setExtra('client_id', v)} />
              </PrintFilterCheck>
              <PrintFilterCheck
                on={printExtra.opponent}
                label={t('fields.opponent_name')}
                onToggle={(v) => setExtra('opponent', v)}
              >
                <Input value={printExtra.opponent_value} onChange={(e) => setExtra('opponent_value', e.target.value)} />
              </PrintFilterCheck>
            </div>
          </div>
        </div>
      }
      onClose={() => setPrintOpen(false)}
      onConfirm={async (selected) => {
        const filters: Record<string, unknown> =
          printScope === 'all' ? {} : printScope === 'upcoming' ? { upcoming: true } : { ...applied }
        if (printExtra.case_type && printExtra.case_type_id) filters.case_type_id = printExtra.case_type_id
        if (printExtra.title && printExtra.title_value.trim()) filters.title = printExtra.title_value.trim()
        if (printExtra.dates && printExtra.date_from) filters.date_from = printExtra.date_from
        if (printExtra.dates && printExtra.date_to) filters.date_to = printExtra.date_to
        if (printExtra.status && printExtra.status_value.trim()) filters.status = printExtra.status_value.trim()
        if (printExtra.court && printExtra.court_value.trim()) filters.court = printExtra.court_value.trim()
        if (printExtra.lawyer && printExtra.lawyer_id) filters.primary_lawyer_id = printExtra.lawyer_id
        if (printExtra.client && printExtra.client_id) filters.client_id = printExtra.client_id
        if (printExtra.opponent && printExtra.opponent_value.trim()) filters.opponent_name = printExtra.opponent_value.trim()
        const res = await invoke<{ rows: Record<string, unknown>[]; total: number }>('cases:list', {
          page: 1,
          pageSize: 1000,
          print: true,
          filters
        })
        const fetched = res.rows || []
        const rows = applyPrintColFilters(fetched, printColFilters, i18n.language, t)
        const colLabels: Record<string, string> = {
          case_number: t('fields.program_code'),
          office_case_number: t('fields.court_number'),
          title: t('fields.case_subject'),
          client_name: t('fields.client_name'),
          opponent_name: t('fields.opponent_name'),
          lawyer_name: t('fields.lawyer_id'),
          case_type_name: t('fields.case_type_name'),
          status: t('fields.status')
        }
        const filterBits = [
          ...(printScope === 'filtered'
            ? [
                { label: t('fields.court_number'), value: applied.office_case_number },
                { label: t('fields.program_code'), value: applied.program_code },
                { label: t('fields.client_name'), value: applied.client_name },
                { label: t('fields.opponent_name'), value: applied.opponent_name }
              ]
            : printScope === 'upcoming'
              ? [{ label: t('printKit.upcoming'), value: t('printKit.upcoming') }]
              : []),
          ...(printExtra.case_type && printExtra.case_type_id
            ? [{ label: t('fields.case_type_id'), value: printExtra.case_type_id }]
            : []),
          ...(printExtra.title && printExtra.title_value.trim()
            ? [{ label: t('fields.case_subject'), value: printExtra.title_value.trim() }]
            : []),
          ...(printExtra.dates && (printExtra.date_from || printExtra.date_to)
            ? [{ label: t('printKit.dateFrom'), value: [printExtra.date_from, printExtra.date_to].filter(Boolean).join(' — ') }]
            : []),
          ...(printExtra.status && printExtra.status_value.trim()
            ? [{ label: t('fields.status'), value: printExtra.status_value.trim() }]
            : []),
          ...(printExtra.court && printExtra.court_value.trim()
            ? [{ label: t('fields.court'), value: printExtra.court_value.trim() }]
            : []),
          ...(printExtra.lawyer && printExtra.lawyer_id ? [{ label: t('fields.lawyer_id'), value: printExtra.lawyer_id }] : []),
          ...(printExtra.client && printExtra.client_id ? [{ label: t('fields.client_id'), value: printExtra.client_id }] : []),
          ...(printExtra.opponent && printExtra.opponent_value.trim()
            ? [{ label: t('fields.opponent_name'), value: printExtra.opponent_value.trim() }]
            : []),
          ...Object.entries(printColFilters)
            .filter(([, v]) => String(v || '').trim())
            .map(([key, value]) => ({
              label: colLabels[key] || t(`fields.${key}`),
              value: String(value)
            }))
        ].filter((i) => String(i.value || '').trim())
        const table = buildCasePrintTable(rows, selected, t, i18n.language)
        await sendPrint(
          'report',
          t('nav.cases'),
          compactTableHtml({
            columns: table.columns,
            rows: table.rows,
            notesLabel: t('printKit.notes'),
            emptyLabel: t('noData'),
            subtitle: filterBits.length ? filterBits.map((i) => `${i.label}: ${i.value}`).join(' — ') : undefined
          })
        )
        if ((res.total || 0) > fetched.length) toast(t('printListCapped', { count: fetched.length }))
        setPrintOpen(false)
      }}
    />
    </>
  )
}

export { HearingsPage, TasksPage, ExecutionPage, ExpertsPage } from './WorkPages'

export function RemindersPage() {
  const { t } = useTranslation()
  return (
    <CrudPage
      title={t('nav.reminders')}
      listChannel="reminders:list"
      createChannel="reminders:create"
      updateChannel="reminders:update"
      removeChannel="reminders:remove"
      createPerm="reminders.view"
      updatePerm="reminders.view"
      deletePerm="reminders.view"
      schema={reminderSchema}
      columns={[
        { key: 'title', label: t('fields.title') },
        { key: 'reminder_type', label: t('fields.reminder_type') },
        { key: 'remind_at', label: t('fields.remind_at') },
        { key: 'priority', label: t('fields.priority'), status: true },
        { key: 'assignee_name', label: t('fields.assignee_name') }
      ]}
      fields={[
        f(t, 'title', { required: true }),
        f(t, 'reminder_type', { type: 'select', options: REMINDER_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) })) }),
        f(t, 'remind_at', { type: 'datetime-local', required: true }),
        {
          name: 'notify_before_minutes',
          label: t('fields.notify_before_minutes'),
          type: 'select',
          options: [
            { value: 5, label: t('remind.m5') },
            { value: 15, label: t('remind.m15') },
            { value: 60, label: t('remind.h1') },
            { value: 1440, label: t('remind.d1') },
            { value: 4320, label: t('remind.d3') },
            { value: 10080, label: t('remind.w1') }
          ]
        },
        f(t, 'priority', { type: 'select', options: st(t, ['low', 'medium', 'high']) }),
        f(t, 'assignee_id', { lookup: 'users' }),
        f(t, 'case_id', { lookup: 'cases' }),
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
  )
}

export function LawyersPage() {
  const { t } = useTranslation()
  const { setPage, can, toast } = useApp()
  return (
    <CrudPage
      title={t('nav.lawyers')}
      listChannel="lawyers:list"
      removeChannel="lawyers:remove"
      deletePerm="users.manage"
      extraActions={
        can('users.manage') ? (
        <Button variant="gold" onClick={() => setPage('staffForm', { lockRole: 'lawyer', back: 'lawyers' })}>
          {t('hr.addLawyer')}
        </Button>
        ) : null
      }
      columns={[
        { key: 'full_name', label: t('fields.full_name') },
        { key: 'bar_number', label: t('fields.bar_number') },
        { key: 'bar_degree', label: t('fields.bar_degree') },
        { key: 'duties', label: t('fields.duties') },
        { key: 'phone', label: t('fields.phone') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[]}
      onEditRow={(r) =>
        setPage('staffForm', {
          employeeId: r.employee_id,
          lawyerId: r.id,
          lockRole: 'lawyer',
          back: 'lawyers'
        })
      }
      onRowOpen={(r) =>
        setPage('staffForm', {
          employeeId: r.employee_id,
          lawyerId: r.id,
          lockRole: 'lawyer',
          back: 'lawyers'
        })
      }
      rowActions={(r, reload) =>
        can('users.manage') ? (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                invoke('lawyers:reorder', r.id, 'up')
                  .then(() => reload())
                  .catch((e) => toast((e as Error).message, 'err'))
              }
            >
              {t('moveUp')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                invoke('lawyers:reorder', r.id, 'down')
                  .then(() => reload())
                  .catch((e) => toast((e as Error).message, 'err'))
              }
            >
              {t('moveDown')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setPage('staffForm', {
                  employeeId: r.employee_id,
                  lawyerId: r.id,
                  lockRole: 'lawyer',
                  back: 'lawyers'
                })
              }
            >
              {t('details')}
            </Button>
          </>
        ) : null
      }
    />
  )
}

export function LawyerProfilePage() {
  return <StaffFormPage />
}

export function EmployeesPage() {
  const { t } = useTranslation()
  const { setPage, can } = useApp()
  return (
    <CrudPage
      title={t('nav.employees')}
      listChannel="employees:list"
      removeChannel="employees:remove"
      deletePerm="employees.manage"
      extraActions={
        can('employees.manage') ? (
        <Button variant="gold" onClick={() => setPage('staffForm', { back: 'employees' })}>
          {t('hr.addStaff')}
        </Button>
        ) : null
      }
      columns={[
        { key: 'full_name', label: t('fields.full_name') },
        { key: 'role_name', label: t('fields.role_name') },
        { key: 'job_title', label: t('fields.job_title') },
        { key: 'phone', label: t('fields.phone') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[]}
      onRowOpen={(r) => setPage('staffForm', { employeeId: r.id, lawyerId: r.lawyer_id, userId: r.user_id, back: 'employees' })}
      onEditRow={(r) => setPage('staffForm', { employeeId: r.id, lawyerId: r.lawyer_id, userId: r.user_id, back: 'employees' })}
    />
  )
}

export function EmployeeProfilePage() {
  return <StaffFormPage />
}

export function OpponentsPage() {
  const { t } = useTranslation()
  const { setPage, toast } = useApp()
  return (
    <CrudPage
      title={t('nav.opponents')}
      listChannel="opponents:list"
      createChannel="opponents:create"
      updateChannel="opponents:update"
      removeChannel="opponents:remove"
      createPerm="opponents.manage"
      updatePerm="opponents.manage"
      deletePerm="opponents.manage"
      schema={opponentSchema}
      defaults={{ id_kind: 'national_id' }}
      columns={[
        {
          key: 'full_name',
          label: t('fields.full_name'),
          onCellClick: (r) => setPage('opponentProfile', { id: r.id })
        },
        { key: 'national_id', label: t('fields.national_id') },
        { key: 'phone', label: t('fields.phone') },
        { key: 'poa_number', label: t('fields.poa_number') },
        { key: 'lawyer_name', label: t('fields.lawyer_name') },
        { key: 'lawyer_phone', label: t('fields.lawyer_phone') }
      ]}
      fields={[]}
      formBody={(form, setField, errors) => (
        <PartyForm entity="opponent" values={form} onChange={setField} errors={errors} partyId={String(form.id || '')} />
      )}
      afterSave={async ({ result, form }) => {
        const id = String((result as { id?: string })?.id || form.id || '')
        if (!id) return
        try {
          await uploadOpponentPendingDocs(id, form)
        } catch (e) {
          toast((e as Error).message, 'err')
        }
      }}
      onRowOpen={(r) => setPage('opponentProfile', { id: r.id })}
    />
  )
}

export function PoaPage() {
  const { t } = useTranslation()
  const { toast, can } = useApp()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const openPoaDoc = (row: Record<string, unknown>) => {
    const id = String(row.document_id || '')
    if (!id) {
      toast(t('poa.noDocument'), 'err')
      return
    }
    setPreviewId(id)
  }
  return (
    <>
      <CrudPage
        title={t('nav.poa')}
        listChannel="poa:list"
        createChannel="poa:create"
        updateChannel="poa:update"
        removeChannel="poa:remove"
        createPerm="poa.manage"
        updatePerm="poa.manage"
        deletePerm="poa.manage"
        schema={poaSchema}
        onRowOpen={openPoaDoc}
        columns={[
          { key: 'poa_number', label: t('fields.poa_number') },
          { key: 'poa_type', label: t('fields.poa_type') },
          { key: 'client_name', label: t('fields.client_name') },
          { key: 'expiry_date', label: t('fields.expiry_date') },
          { key: 'status', label: t('fields.status'), status: true },
          {
            key: 'document_id',
            label: t('fields.document'),
            render: (r) =>
              r.document_id ? (
                <div className="flex items-center gap-2" data-no-row>
                  <DocumentThumb
                    id={String(r.document_id)}
                    title={String(r.poa_number || t('nav.poa'))}
                    onOpen={() => openPoaDoc(r)}
                    onOpenExternal={() =>
                      invoke('documents:open', String(r.document_id)).catch((e) => toast((e as Error).message, 'err'))
                    }
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => openPoaDoc(r)}>
                    {t('preview')}
                  </Button>
                </div>
              ) : (
                '—'
              )
          }
        ]}
        fields={[
          f(t, 'poa_number'),
          f(t, 'poa_year', { size: 'sm' }),
          f(t, 'poa_letter', { size: 'sm' }),
          f(t, 'poa_office', { type: 'combo', comboKind: 'poa_office' }),
          f(t, 'poa_type'),
          f(t, 'client_id', { lookup: 'clients' }),
          f(t, 'lawyer_id', { lookup: 'lawyers' }),
          f(t, 'issuing_authority'),
          f(t, 'issue_date', { type: 'date' }),
          f(t, 'expiry_date', { type: 'date' }),
          f(t, 'status', { type: 'combo', comboKind: 'poa_status' }),
          f(t, 'notes', { type: 'textarea' })
        ]}
        formExtra={(form, setField) => (
          <div className="space-y-2">
            {form.document_id ? (
              <Button type="button" variant="outline" onClick={() => openPoaDoc(form)}>
                {t('preview')}
              </Button>
            ) : null}
            {can('documents.upload') ? (
              <AttachDocumentControl
                docs={(form.__pending_docs as PendingDoc[]) || []}
                onChange={(docs) => setField('__pending_docs', docs)}
                owner={form.client_id ? { client_id: String(form.client_id) } : undefined}
              />
            ) : null}
          </div>
        )}
        afterSave={async ({ result, form }) => {
          const poaId = String((result as { id?: string })?.id || form.id || '')
          const clientId = String(form.client_id || '')
          try {
            await uploadPendingDocs(clientId ? { client_id: clientId } : {}, form, {
              poa_id: poaId || undefined,
              category: 'poa'
            })
          } catch (e) {
            toast((e as Error).message, 'err')
          }
        }}
      />
      <DocumentPreviewModal id={previewId} onClose={() => setPreviewId(null)} />
    </>
  )
}

export function ContractsPage() {
  const { t } = useTranslation()
  return (
    <CrudPage
      title={t('nav.contracts')}
      listChannel="contracts:list"
      createChannel="contracts:create"
      updateChannel="contracts:update"
      removeChannel="contracts:remove"
      createPerm="contracts.manage"
      updatePerm="contracts.manage"
      deletePerm="contracts.manage"
      schema={contractSchema}
      columns={[
        { key: 'contract_number', label: t('fields.contract_number') },
        { key: 'title', label: t('fields.title') },
        { key: 'client_name', label: t('fields.client_name') },
        { key: 'end_date', label: t('fields.end_date') },
        { key: 'value', label: t('fields.value'), money: true },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'title', { required: true }),
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'contract_type'),
        f(t, 'start_date', { type: 'date' }),
        f(t, 'end_date', { type: 'date' }),
        f(t, 'value', { type: 'number' }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'status', { type: 'combo', comboKind: 'contract_status' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
  )
}

export function ConsultationsPage() {
  const { t } = useTranslation()
  return (
    <CrudPage
      title={t('nav.consultations')}
      listChannel="consultations:list"
      createChannel="consultations:create"
      updateChannel="consultations:update"
      removeChannel="consultations:remove"
      createPerm="consultations.manage"
      updatePerm="consultations.manage"
      deletePerm="consultations.manage"
      schema={consultationSchema}
      columns={[
        { key: 'subject', label: t('fields.subject') },
        { key: 'client_name', label: t('fields.client_name') },
        { key: 'consultation_date', label: t('fields.consultation_date') },
        { key: 'fees', label: t('fields.fees'), money: true },
        { key: 'payment_status', label: t('fields.payment_status'), status: true }
      ]}
      fields={[
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'consultation_date', { type: 'date' }),
        f(t, 'consultation_type'),
        f(t, 'subject'),
        f(t, 'details', { type: 'textarea' }),
        f(t, 'recommendations', { type: 'textarea' }),
        f(t, 'fees', { type: 'number' }),
        f(t, 'payment_status', { type: 'select', options: st(t, ['unpaid', 'paid']) })
      ]}
    />
  )
}

export function CorrespondencePage() {
  const { t } = useTranslation()
  return (
    <CrudPage
      title={t('nav.correspondence')}
      listChannel="correspondence:list"
      createChannel="correspondence:create"
      updateChannel="correspondence:update"
      removeChannel="correspondence:remove"
      createPerm="correspondence.manage"
      updatePerm="correspondence.manage"
      deletePerm="correspondence.manage"
      schema={correspondenceSchema}
      columns={[
        { key: 'correspondence_number', label: t('fields.correspondence_number') },
        { key: 'direction', label: t('fields.direction') },
        { key: 'date', label: t('fields.date') },
        { key: 'party', label: t('fields.party') },
        { key: 'subject', label: t('fields.subject') }
      ]}
      fields={[
        f(t, 'direction', { type: 'select', options: [{ value: 'outgoing', label: t('status.outgoing') }, { value: 'incoming', label: t('status.incoming') }] }),
        f(t, 'correspondence_type', { type: 'select', options: st(t, ['letter', 'email', 'client']) }),
        f(t, 'date', { type: 'date' }),
        f(t, 'party'),
        f(t, 'subject'),
        f(t, 'case_id', { lookup: 'cases' }),
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
  )
}

export function AppointmentsPage() {
  const { t } = useTranslation()
  const { setPage, pageMeta } = useApp()
  const listFilters: Record<string, unknown> = {}
  if (pageMeta.date_from) listFilters.date_from = String(pageMeta.date_from)
  if (pageMeta.status) listFilters.status = String(pageMeta.status)
  return (
    <CrudPage
      title={t('nav.appointments')}
      listChannel="appointments:list"
      listFilters={Object.keys(listFilters).length ? listFilters : undefined}
      createChannel="appointments:create"
      updateChannel="appointments:update"
      removeChannel="appointments:remove"
      createPerm="appointments.manage"
      updatePerm="appointments.manage"
      deletePerm="appointments.manage"
      schema={appointmentSchema}
      columns={[
        { key: 'title', label: t('fields.title') },
        { key: 'appointment_type', label: t('fields.appointment_type') },
        {
          key: 'client_name',
          label: t('fields.client_name'),
          onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
        },
        { key: 'date', label: t('fields.date') },
        { key: 'time', label: t('fields.time') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'title', { required: true }),
        f(t, 'appointment_type', {
          type: 'select',
          options: st(t, ['client', 'consultation', 'meeting', 'interview', 'signing', 'payment'])
        }),
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'case_id', { lookup: 'cases' }),
        f(t, 'date', { type: 'date', required: true }),
        f(t, 'time', { type: 'time' }),
        f(t, 'location'),
        f(t, 'purpose'),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
  )
}

function ImportButton({ kind }: { kind: 'clients' | 'cases' }) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const download = async () => {
    const r = await invoke<{ canceled?: boolean }>(`${kind}:importTemplate`)
    if (!r?.canceled) toast(t('savedOk'))
  }
  const pick = async () => {
    const file = await invoke<{ name: string; data: number[] }>('files:pick')
    const preview = await invoke<{ valid: number; invalid: number }>(`${kind}:importPreview`, file.data)
    if (!confirm(t('importConfirm', { valid: preview.valid, invalid: preview.invalid }))) return
    const r = await invoke<{ created: number; skipped: number }>(`${kind}:importCommit`, file.data, false)
    toast(t('importDone', { created: r.created, skipped: r.skipped }))
  }
  return (
    <>
      <Button variant="outline" onClick={() => download().catch((e) => toast(e.message, 'err'))}>
        {t('excelTemplate')}
      </Button>
      <Button variant="outline" onClick={() => pick().catch((e) => toast(e.message, 'err'))}>
        {t('import')}
      </Button>
    </>
  )
}
