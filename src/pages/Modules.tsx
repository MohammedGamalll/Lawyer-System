import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { CaseFormExtras } from '../components/CaseFormExtras'
import { ContactActions } from '../components/ContactActions'
import { AndOthers } from '../components/AndOthers'
import { Button, Input, Select } from '../components/ui'
import { formatCourtNumber, formatProgramCode } from '../lib/courtNumber'
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
import { caseFormFields } from '../lib/caseForm'
import { clientBlankFormHtml } from '../lib/clientBlankForm'
import { StaffFormPage } from './StaffForm'
import { ClientProfilePage } from './ClientProfile'
import { CaseProfilePage } from './CaseProfile'

export { ClientProfilePage, CaseProfilePage, StaffFormPage }

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

function f(t: (k: string) => string, name: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label: t(`fields.${name}`), ...extra }
}

export function ClientsPage() {
  const { t } = useTranslation()
  const { setPage, can, toast } = useApp()
  const showContact = can('clients.unmask_contact')
  return (
    <CrudPage
      title={t('nav.clients')}
      listChannel="clients:list"
      createChannel="clients:create"
      updateChannel="clients:update"
      removeChannel="clients:remove"
      createPerm="clients.create"
      updatePerm="clients.update"
      deletePerm="clients.delete"
      schema={clientSchema}
      defaults={{ id_kind: 'national_id' }}
      columns={[
        { key: 'client_number', label: t('fields.client_number') },
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
          await uploadClientPendingDocs(id, form)
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
  const { t } = useTranslation()
  const { setPage } = useApp()
  const [draft, setDraft] = useState({ office_case_number: '', program_code: '', client_name: '', opponent_name: '' })
  const [applied, setApplied] = useState(draft)
  const runSearch = () => {
    setApplied({ ...draft })
  }
  return (
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
      pageSize={200}
      listFilters={applied}
      extraFilters={
        <div className="flex w-full flex-wrap items-end gap-2">
          <Input
            className="min-w-[10rem] flex-1"
            autoFocus
            placeholder={t('cases.searchCourtHint')}
            value={draft.office_case_number}
            onChange={(e) => setDraft({ ...draft, office_case_number: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <Input
            className="min-w-[10rem] flex-1"
            placeholder={t('fields.program_code')}
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
          render: (r) => formatProgramCode(r),
          onCellClick: (r) => setPage('caseProfile', { id: r.id })
        },
        {
          key: 'office_case_number',
          label: t('fields.court_number'),
          render: (r) => (
            <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
              {formatCourtNumber(r)}
            </span>
          )
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
      defaults={{
        received_date: new Date().toISOString().slice(0, 10),
        extra_clients: [],
        extra_opponents: []
      }}
      formPrefix={(form, setField) => <CaseFormExtras form={form} setField={setField} />}
    />
  )
}

export { HearingsPage, TasksPage } from './WorkPages'

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
      pageSize={200}
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
        { key: 'specialization', label: t('fields.specialization') },
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
      columns={[
        { key: 'full_name', label: t('fields.full_name') },
        { key: 'national_id', label: t('fields.national_id') },
        { key: 'phone', label: t('fields.phone') },
        { key: 'lawyer_name', label: t('fields.lawyer_name') },
        { key: 'lawyer_phone', label: t('fields.lawyer_phone') }
      ]}
      fields={[
        f(t, 'full_name', { required: true }),
        f(t, 'nickname'),
        f(t, 'national_id'),
        f(t, 'phone'),
        f(t, 'address'),
        f(t, 'lawyer_name'),
        f(t, 'lawyer_phone'),
        f(t, 'case_id', { lookup: 'cases' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
  )
}

export function PoaPage() {
  const { t } = useTranslation()
  return (
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
      columns={[
        { key: 'poa_number', label: t('fields.poa_number') },
        { key: 'poa_type', label: t('fields.poa_type') },
        { key: 'client_name', label: t('fields.client_name') },
        { key: 'expiry_date', label: t('fields.expiry_date') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'poa_type'),
        f(t, 'client_id', { lookup: 'clients' }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'issuing_authority'),
        f(t, 'issue_date', { type: 'date' }),
        f(t, 'expiry_date', { type: 'date' }),
        f(t, 'status', { type: 'select', options: st(t, ['active', 'expired', 'revoked']) }),
        f(t, 'notes', { type: 'textarea' })
      ]}
    />
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
        f(t, 'status', { type: 'select', options: st(t, ['active', 'expired', 'cancelled']) }),
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
  const { setPage } = useApp()
  return (
    <CrudPage
      title={t('nav.appointments')}
      listChannel="appointments:list"
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
