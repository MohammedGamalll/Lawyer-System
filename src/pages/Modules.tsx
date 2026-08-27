import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { CaseFormExtras } from '../components/CaseFormExtras'
import { ContactActions } from '../components/ContactActions'
import { Button, Select } from '../components/ui'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { CASE_STATUSES, CLIENT_TYPES, HEARING_STATUSES, REMINDER_TYPES, TASK_STATUSES } from '@shared/types'
import {
  appointmentSchema,
  caseSchema,
  clientSchema,
  consultationSchema,
  contractSchema,
  correspondenceSchema,
  hearingSchema,
  opponentSchema,
  poaSchema,
  reminderSchema,
  taskSchema
} from '@shared/schemas'
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
  const { setPage, can } = useApp()
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
              <span dir="ltr">{String(r.phone ?? '')}</span>
              {showContact ? <ContactActions phone={String(r.phone || '')} whatsapp={String(r.whatsapp || '')} /> : null}
            </span>
          )
        },
        {
          key: 'email',
          label: t('fields.email'),
          render: (r) => (
            <span className="inline-flex items-center gap-1">
              <span dir="ltr">{String(r.email ?? '')}</span>
              {showContact ? <ContactActions email={String(r.email || '')} /> : null}
            </span>
          )
        },
        { key: 'client_type', label: t('fields.client_type'), status: true },
        { key: 'governorate', label: t('fields.governorate') }
      ]}
      fields={[
        f(t, 'full_name', { required: true }),
        f(t, 'trade_name', { type: 'combo', comboKind: 'capacity' }),
        f(t, 'national_id'),
        f(t, 'phone'),
        f(t, 'phone2'),
        f(t, 'whatsapp'),
        f(t, 'email'),
        f(t, 'address'),
        f(t, 'governorate', { type: 'combo', comboKind: 'governorate' }),
        f(t, 'district', { type: 'combo', comboKind: 'district' }),
        f(t, 'client_type', { type: 'select', options: CLIENT_TYPES.map((v) => ({ value: v, label: t(`status.${v}`) })) }),
        f(t, 'profession', { type: 'combo', comboKind: 'profession' }),
        f(t, 'birth_date', { type: 'date' }),
        f(t, 'commercial_register'),
        f(t, 'tax_id'),
        f(t, 'manager_name'),
        f(t, 'notes', { type: 'textarea' })
      ]}
      onRowOpen={(r) => setPage('clientProfile', { id: r.id })}
      extraActions={<ImportButton kind="clients" />}
    />
  )
}

export function CasesPage() {
  const { t } = useTranslation()
  const { setPage } = useApp()
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
      columns={[
        { key: 'case_number', label: t('fields.case_number'), onCellClick: (r) => setPage('caseProfile', { id: r.id }) },
        { key: 'case_year', label: t('fields.case_year') },
        { key: 'title', label: t('fields.title'), onCellClick: (r) => setPage('caseProfile', { id: r.id }) },
        {
          key: 'client_name',
          label: t('fields.client_name'),
          onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
        },
        { key: 'lawyer_name', label: t('fields.lawyer_id') },
        { key: 'case_type_name', label: t('fields.case_type_name') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'office_case_number', { label: t('fields.case_number') }),
        f(t, 'case_year'),
        f(t, 'title', { required: true, type: 'combo', comboKind: 'case_title' }),
        f(t, 'client_id', { lookup: 'clients', required: true, quickAdd: true }),
        f(t, 'primary_lawyer_id', { lookup: 'lawyers' }),
        f(t, 'assistant_lawyer_id', { lookup: 'lawyers' }),
        f(t, 'case_type_id', { lookup: 'caseTypes' }),
        f(t, 'category', { type: 'combo', comboKind: 'case_subject', label: t('fields.case_subject') }),
        f(t, 'court', { type: 'combo', comboKind: 'court' }),
        f(t, 'circuit'),
        f(t, 'court_address'),
        f(t, 'circuit_number'),
        f(t, 'litigation_degree'),
        f(t, 'first_instance_number'),
        f(t, 'first_instance_year'),
        f(t, 'appeal_number'),
        f(t, 'appeal_year'),
        f(t, 'cassation_number'),
        f(t, 'cassation_year'),
        f(t, 'extra_ref_type', { type: 'combo', comboKind: 'extra_ref_type' }),
        f(t, 'extra_ref_number'),
        f(t, 'filing_date', { type: 'date' }),
        f(t, 'received_date', { type: 'date' }),
        f(t, 'status', { type: 'select', options: st(t, CASE_STATUSES) }),
        f(t, 'case_value', { type: 'number' }),
        f(t, 'opponent_name'),
        f(t, 'opponent_lawyer'),
        f(t, 'opponent_case_number'),
        f(t, 'internal_file_number'),
        f(t, 'total_fees', { type: 'number' }),
        f(t, 'fees_due_date', { type: 'date' }),
        f(t, 'payment_method', {
          type: 'select',
          options: ['cash', 'bank', 'card', 'wallet', 'installment', 'other'].map((v) => ({
            value: v,
            label: t(`types.${v}`)
          }))
        }),
        f(t, 'installment_count', { type: 'number' }),
        f(t, 'related_case_id', { lookup: 'cases' }),
        f(t, 'link_type', {
          type: 'select',
          options: ['original', 'appeal', 'cassation', 'execution'].map((v) => ({
            value: v,
            label: t(`status.${v}`)
          }))
        }),
        f(t, 'description', { type: 'textarea' }),
        f(t, 'summary', { type: 'textarea' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
      onRowOpen={(r) => setPage('caseProfile', { id: r.id })}
      extraActions={<ImportButton kind="cases" />}
      defaults={{
        received_date: new Date().toISOString().slice(0, 10),
        case_year: String(new Date().getFullYear()),
        extra_opponents: [{ opponent_id: '', full_name: '', lawyer_name: '', lawyer_phone: '' }]
      }}
      formExtraAfter="client_id"
      formExtra={(form, setField) => <CaseFormExtras form={form} setField={setField} />}
    />
  )
}

export function HearingsPage() {
  const { t } = useTranslation()
  const { setPage, toast, pageMeta } = useApp()
  const caseId = String(pageMeta.case_id || '')
  const printList = async () => {
    const data = await invoke<{ rows: Record<string, unknown>[] }>('hearings:list', {
      page: 1,
      pageSize: 200,
      filters: caseId ? { case_id: caseId } : {}
    })
    const keys = ['hearing_date', 'case_number', 'client_name', 'hearing_type', 'venue', 'previous_decision', 'hall', 'floor', 'notes', 'status']
    const body = `<table><thead><tr>${keys.map((k) => `<th>${t(`fields.${k}`)}</th>`).join('')}</tr></thead><tbody>${(data.rows || [])
      .map(
        (r) =>
          `<tr>${keys.map((k) => `<td>${String(r[k] ?? '')}</td>`).join('')}</tr>`
      )
      .join('')}</tbody></table>`
    await invoke('print:print', 'report', t('nav.hearings'), body)
  }
  return (
    <CrudPage
      title={t('nav.hearings')}
      listChannel="hearings:list"
      createChannel="hearings:create"
      updateChannel="hearings:update"
      removeChannel="hearings:remove"
      createPerm="hearings.create"
      updatePerm="hearings.update"
      deletePerm="hearings.delete"
      schema={hearingSchema}
      columns={[
        { key: 'hearing_date', label: t('fields.hearing_date') },
        {
          key: 'case_number',
          label: t('fields.case_number'),
          onCellClick: (r) => r.case_id && setPage('caseProfile', { id: r.case_id })
        },
        {
          key: 'client_name',
          label: t('fields.client_name'),
          onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
        },
        { key: 'hearing_type', label: t('fields.hearing_type') },
        { key: 'venue', label: t('fields.venue') },
        { key: 'previous_decision', label: t('fields.previous_decision') },
        { key: 'hall', label: t('fields.hall') },
        { key: 'floor', label: t('fields.floor') },
        { key: 'notes', label: t('fields.notes') },
        { key: 'court', label: t('fields.court') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'case_id', { lookup: 'cases', required: true }),
        f(t, 'hearing_date', { type: 'date', required: true }),
        f(t, 'hearing_type', { type: 'combo', comboKind: 'hearing_type' }),
        f(t, 'venue', { type: 'combo', comboKind: 'venue' }),
        f(t, 'previous_decision'),
        f(t, 'hall'),
        f(t, 'floor'),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'status', { type: 'select', options: st(t, HEARING_STATUSES) }),
        f(t, 'result'),
        f(t, 'court_decision', { type: 'textarea' }),
        f(t, 'postponement_reason'),
        f(t, 'next_hearing_date', { type: 'date' }),
        f(t, 'what_happened', { type: 'textarea' }),
        f(t, 'required_documents', { type: 'textarea' }),
        f(t, 'next_actions', { type: 'textarea' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
      listFilters={caseId ? { case_id: caseId } : undefined}
      extraActions={
        <Button
          variant="outline"
          onClick={() => printList().catch((e) => toast((e as Error).message, 'err'))}
        >
          {t('print')}
        </Button>
      }
      rowActions={(r) =>
        r.client_id ? (
          <Button variant="ghost" onClick={() => setPage('clientProfile', { id: r.client_id })}>
            {t('nav.clients')}
          </Button>
        ) : null
      }
    />
  )
}

export function TasksPage() {
  const { t } = useTranslation()
  const { setPage } = useApp()
  const [view, setView] = useState('all')
  const [lawyerId, setLawyerId] = useState('')
  const [lawyers, setLawyers] = useState<{ id: string; user_id: string | null; full_name: string }[]>([])
  useEffect(() => {
    invoke<{ rows: typeof lawyers }>('lawyers:list', { pageSize: 200 })
      .then((r) => setLawyers(r.rows))
      .catch(() => undefined)
  }, [])
  const filters: Record<string, unknown> = {}
  if (view === 'byLawyer' && lawyerId) filters.assignee_id = lawyerId
  else if (view !== 'all' && view !== 'byLawyer') filters.view = view

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'mine', 'overdue', 'today', 'upcoming', 'byLawyer'] as const).map((v) => (
          <Button key={v} variant={view === v ? 'primary' : 'outline'} onClick={() => setView(v)}>
            {t(`tasksViews.${v}`)}
          </Button>
        ))}
        {view === 'byLawyer' && (
          <Select value={lawyerId} onChange={(e) => setLawyerId(e.target.value)} className="max-w-xs">
            <option value="">—</option>
            {lawyers.map((l) => (
              <option key={l.id} value={l.user_id || l.id}>
                {l.full_name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <CrudPage
        title={t('nav.tasks')}
        listChannel="tasks:list"
        createChannel="tasks:create"
        updateChannel="tasks:update"
        removeChannel="tasks:remove"
        createPerm="tasks.manage"
        updatePerm="tasks.manage"
        deletePerm="tasks.manage"
        schema={taskSchema}
        listFilters={filters}
        columns={[
          { key: 'title', label: t('fields.title') },
          {
            key: 'case_number',
            label: t('fields.case_number'),
            onCellClick: (r) => r.case_id && setPage('caseProfile', { id: r.case_id })
          },
          {
            key: 'client_name',
            label: t('fields.client_name'),
            onCellClick: (r) => r.client_id && setPage('clientProfile', { id: r.client_id })
          },
          { key: 'case_subject', label: t('fields.case_subject') },
          { key: 'venue', label: t('fields.venue') },
          { key: 'assignee_name', label: t('fields.assignee_name') },
          { key: 'due_date', label: t('fields.due_date') },
          { key: 'priority', label: t('fields.priority'), status: true },
          { key: 'status', label: t('fields.status'), status: true },
          { key: 'progress', label: t('fields.progress') }
        ]}
        fields={[
          f(t, 'title', { required: true, type: 'combo', comboKind: 'admin_action' }),
          f(t, 'case_subject', { type: 'combo', comboKind: 'case_subject' }),
          f(t, 'venue', { type: 'combo', comboKind: 'venue' }),
          f(t, 'description', { type: 'textarea' }),
          f(t, 'assignee_id', { lookup: 'users' }),
          f(t, 'case_id', { lookup: 'cases' }),
          f(t, 'client_id', { lookup: 'clients' }),
          f(t, 'start_date', { type: 'date' }),
          f(t, 'due_date', { type: 'date' }),
          f(t, 'priority', { type: 'select', options: st(t, ['low', 'medium', 'high']) }),
          f(t, 'status', { type: 'select', options: st(t, TASK_STATUSES) }),
          f(t, 'progress', { type: 'number' })
        ]}
      />
    </div>
  )
}

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
  const { setPage, can } = useApp()
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
        { key: 'specialization', label: t('fields.specialization') },
        { key: 'phone', label: t('fields.phone') },
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[]}
      onRowOpen={(r) =>
        setPage('staffForm', {
          employeeId: r.employee_id,
          lawyerId: r.id,
          lockRole: 'lawyer',
          back: 'lawyers'
        })
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
