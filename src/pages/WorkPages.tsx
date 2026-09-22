import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { HearingFormExtras } from '../components/HearingFormExtras'
import { TaskFormExtras } from '../components/TaskFormExtras'
import { VenuePrintBar } from '../components/VenuePrintBar'
import { Button, Modal, Select } from '../components/ui'
import { DatePicker } from '../components/DateTimePicker'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { expertHearingSchema, hearingSchema, taskSchema } from '@shared/schemas'
import { formatCell } from '../lib/datetime'
import { formatProgramCode, isManualProgramCode } from '../lib/courtNumber'
import { CourtNumberText } from '../components/CourtNumberText'
import { RecordDetailsModal } from '../components/RecordDetailsModal'
import { ExpertFormExtras } from '../components/ExpertFormExtras'
import {
  applyPrintColFilters,
  executionTasksRollTableHtml,
  expertRollTableHtml,
  hearingRollTableHtml,
  sendPrint,
  taskRollTableHtml
} from '../lib/printKit'

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

function f(t: (k: string) => string, name: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label: t(`fields.${name}`), ...extra }
}

function partiesText(r: Record<string, unknown>) {
  return [r.client_name, r.opponent_name].map((v) => String(v || '').trim()).filter(Boolean).join(' / ') || '—'
}

function typeSubject(r: Record<string, unknown>) {
  return [r.case_type_name || r.case_type, r.case_title || r.case_subject || r.title]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' — ') || '—'
}

function useRowDetails() {
  const [state, setState] = useState<{ row: Record<string, unknown>; edit: () => void } | null>(null)
  return {
    row: state?.row ?? null,
    open: (row: Record<string, unknown>, edit: () => void) => setState({ row, edit }),
    close: () => setState(null),
    edit: () => {
      const fn = state?.edit
      setState(null)
      fn?.()
    }
  }
}

export function HearingsPage({ embeddedCaseId }: { embeddedCaseId?: string } = {}) {
  const { t, i18n } = useTranslation()
  const { setPage, toast, pageMeta, goBack } = useApp()
  const [adminModal, setAdminModal] = useState<{ caseId: string; rows: Record<string, unknown>[] } | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const details = useRowDetails()
  const [view, setView] = useState(() => String(pageMeta.view || 'all'))
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  useEffect(() => {
    if (pageMeta.view) setView(String(pageMeta.view))
  }, [pageMeta.view])
  const listFilters: Record<string, unknown> = {}
  if (caseId) listFilters.case_id = caseId
  if (!caseId && view !== 'all' && view !== 'range') listFilters.view = view
  if (!caseId && view === 'range') {
    if (rangeFrom) listFilters.date_from = rangeFrom
    if (rangeTo) listFilters.date_to = rangeTo
  }
  const fromCase = Boolean(caseId)

  const openAdminActions = async (row: Record<string, unknown>) => {
    const cid = String(row.case_id || '')
    const count = Number(row.case_admin_count || 0)
    if (count <= 1) {
      if (row.current_admin_task_id) setPage('tasks', { edit_id: row.current_admin_task_id, case_id: cid, work_kind: 'admin' })
      return
    }
    if (!cid) return
    setAdminLoading(true)
    setAdminModal({ caseId: cid, rows: [] })
    try {
      const res = await invoke<{ rows: Record<string, unknown>[] }>('tasks:list', {
        page: 1,
        pageSize: 200,
        filters: { case_id: cid, work_kind: 'admin' }
      })
      setAdminModal({
        caseId: cid,
        rows: (res.rows || []).filter((tk) => String(tk.status || '') !== 'cancelled')
      })
    } catch (e) {
      toast((e as Error).message, 'err')
      setAdminModal(null)
    } finally {
      setAdminLoading(false)
    }
  }

  return (
    <>
    <CrudPage
      title={fromCase ? t('caseForm.courtHearings') : t('nav.hearings')}
      listChannel="hearings:list"
      createChannel="hearings:create"
      updateChannel="hearings:update"
      removeChannel="hearings:remove"
      createPerm="hearings.create"
      updatePerm="hearings.update"
      deletePerm="hearings.delete"
      schema={hearingSchema}
      compactForm
      embedded={Boolean(embeddedCaseId)}
      defaults={{
        case_id: caseId || undefined,
        upcoming_procedures: []
      }}
      formPrefix={(form, setField) => <HearingFormExtras form={form} setField={setField} />}
      columns={[
        {
          key: 'case_number',
          label: t('fields.program_code'),
          render: (r: Record<string, unknown>) => (
            <span className={isManualProgramCode(r) ? 'font-bold text-red-600' : ''}>{formatProgramCode(r) || '—'}</span>
          ),
          onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
        },
        {
          key: 'office_case_number',
          label: t('fields.court_number'),
          render: (r: Record<string, unknown>) => <CourtNumberText row={r} />
        },
        {
          key: 'caseTypeAndSubject',
          label: t('fields.caseTypeAndSubject'),
          render: (r: Record<string, unknown>) => typeSubject(r)
        },
        {
          key: 'hearing_court',
          label: t('fields.hearingCourt'),
          render: (r: Record<string, unknown>) => String(r.court || r.court_name || r.venue || '—')
        },
        {
          key: 'parties',
          label: t('fields.parties'),
          render: (r: Record<string, unknown>) => partiesText(r)
        },
        { key: 'current_admin_status', label: t('fields.action_status'), status: true },
        { key: 'status', label: t('fields.status'), status: true },
        { key: 'hearing_date', label: t('fields.hearing_date') },
        { key: 'previous_decision', label: t('fields.previous_decision') },
        { key: 'court_decision', label: t('fields.court_decision') },
        ...(fromCase
          ? [
              {
                key: 'current_admin_action',
                label: t('fields.current_admin'),
                render: (r: Record<string, unknown>) => {
                  const n = Number(r.case_admin_count || 0)
                  const text = String(r.current_admin_action || '').trim()
                  if (!text && n <= 0) return '—'
                  return (
                    <span className="whitespace-normal">
                      {text || t('fields.adminActions')}
                      {n > 1 ? <span className="ms-1 text-navy-500">({t('fields.moreAdmin', { count: n - (text ? 1 : 0) })})</span> : null}
                    </span>
                  )
                },
                onCellClick: (r: Record<string, unknown>) => void openAdminActions(r)
              }
            ]
          : [])
      ]}
      fields={[
        f(t, 'case_id', { lookup: 'cases', required: true }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'status', { type: 'combo', comboKind: 'hearing_status' }),
        f(t, 'previous_decision'),
        f(t, 'result', { hint: t('fields.resultHint') }),
        f(t, 'court_decision', { type: 'textarea' }),
        f(t, 'postponement_reason'),
        f(t, 'what_happened', { type: 'textarea' }),
        f(t, 'required_documents', { type: 'textarea' }),
        f(t, 'next_actions', { type: 'textarea' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
      listFilters={Object.keys(listFilters).length ? listFilters : undefined}
          extraActions={
            !fromCase ? (
              <div className="flex w-full flex-wrap items-end gap-2">
                {(['all', 'mine', 'overdue', 'today', 'tomorrow', 'week', 'upcoming', 'range'] as const).map((v) => (
                  <Button key={v} variant={view === v ? 'primary' : 'outline'} onClick={() => setView(v)}>
                    {t(`hearingsViews.${v}`)}
                  </Button>
                ))}
                {view === 'range' ? (
                  <>
                    <DatePicker value={rangeFrom} onChange={setRangeFrom} />
                    <DatePicker value={rangeTo} onChange={setRangeTo} />
                  </>
                ) : null}
                <div className="ms-auto">
                  <VenuePrintBar toast={toast} />
                </div>
              </div>
            ) : fromCase && !embeddedCaseId ? (
              <Button variant="outline" onClick={() => goBack()}>
                {t('back')}
              </Button>
            ) : undefined
          }
      onPrint={async (ctx) => {
        const res = await invoke<{ rows: Record<string, unknown>[]; total: number }>('hearings:list', {
          page: 1,
          pageSize: 1000,
          print: true,
          filters: listFilters
        })
        const fetched = res.rows || []
        const rows = applyPrintColFilters(fetched, ctx.colFilters, i18n.language, t)
        const roll = hearingRollTableHtml(rows, t, i18n.language, { emptyLabel: t('noData') })
        await sendPrint('report', roll.sheetTitle, roll.html, 'hearingsRoll')
        if ((res.total || 0) > fetched.length) toast(t('printListCapped', { count: fetched.length }))
      }}
      onRowOpen={details.open}
    />
    <RecordDetailsModal
      open={Boolean(details.row)}
      title={t('details')}
      onClose={details.close}
      onEdit={details.edit}
      items={
        details.row
          ? [
              { label: t('fields.program_code'), value: formatProgramCode(details.row) },
              { label: t('fields.court_number'), value: <CourtNumberText row={details.row} /> },
              { label: t('fields.parties'), value: partiesText(details.row) },
              { label: t('fields.caseTypeAndSubject'), value: typeSubject(details.row) },
              { label: t('fields.hearingCourt'), value: String(details.row.court || details.row.court_name || details.row.venue || '') },
              { label: t('fields.circuit'), value: String(details.row.circuit || details.row.circuit_number || '') },
              { label: t('fields.hall'), value: String(details.row.hall || '') },
              { label: t('fields.floor'), value: String(details.row.floor || '') },
              { label: t('fields.action_status'), value: formatCell('status', details.row.current_admin_status, i18n.language, t) },
              { label: t('fields.status'), value: formatCell('status', details.row.status, i18n.language, t) },
              { label: t('fields.hearing_date'), value: formatCell('hearing_date', details.row.hearing_date, i18n.language, t) },
              { label: t('fields.hearing_time'), value: formatCell('hearing_time', details.row.hearing_time, i18n.language, t) },
              { label: t('fields.hearing_type'), value: String(details.row.hearing_type || '') },
              { label: t('fields.previous_decision'), value: String(details.row.previous_decision || '') },
              { label: t('fields.court_decision'), value: String(details.row.court_decision || '') },
              { label: t('fields.result'), value: String(details.row.result || '') },
              { label: t('fields.postponement_reason'), value: String(details.row.postponement_reason || '') },
              { label: t('fields.what_happened'), value: String(details.row.what_happened || '') },
              { label: t('fields.notes'), value: String(details.row.notes || '') }
            ]
          : []
      }
    />
    <Modal
      open={Boolean(adminModal)}
      wide
      title={t('fields.adminActions')}
      onClose={() => setAdminModal(null)}
    >
      {adminLoading ? (
        <div className="text-sm text-navy-500">{t('loading')}</div>
      ) : !adminModal?.rows.length ? (
        <div className="text-sm text-navy-400">{t('noData')}</div>
      ) : (
        <div className="space-y-3">
          {adminModal.rows.map((tk) => (
            <div
              key={String(tk.id)}
              className="rounded-lg border border-navy-100 p-3 text-sm dark:border-navy-700"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="font-bold text-navy-900 dark:text-white">
                  {String(tk.description || tk.title || '—')}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 shrink-0 px-2 text-xs"
                  onClick={() => {
                    setAdminModal(null)
                    setPage('tasks', { edit_id: tk.id, case_id: tk.case_id, work_kind: 'admin' })
                  }}
                >
                  {t('edit')}
                </Button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div>
                  <strong>{t('fields.due_date')}:</strong> {formatCell('due_date', tk.due_date, i18n.language, t)}
                </div>
                <div>
                  <strong>{t('fields.status')}:</strong> {formatCell('status', tk.status, i18n.language, t)}
                </div>
                <div>
                  <strong>{t('fields.venue')}:</strong> {String(tk.venue || '—')}
                </div>
                <div>
                  <strong>{t('fields.assignee_name')}:</strong> {String(tk.assignee_name || '—')}
                </div>
                <div>
                  <strong>{t('fields.priority')}:</strong> {formatCell('priority', tk.priority, i18n.language, t)}
                </div>
                <div>
                  <strong>{t('fields.case_subject')}:</strong> {String(tk.case_subject || tk.case_title || '—')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
    </>
  )
}

export function TasksPage({
  embeddedCaseId,
  embeddedClientId,
  embeddedWorkKind
}: {
  embeddedCaseId?: string
  embeddedClientId?: string
  embeddedWorkKind?: string
} = {}) {
  const { t, i18n } = useTranslation()
  const { setPage, pageMeta, goBack, toast } = useApp()
  const [view, setView] = useState(() => String(pageMeta.view || 'all'))
  const [lawyerId, setLawyerId] = useState('')
  const [lawyers, setLawyers] = useState<{ id: string; user_id: string | null; full_name: string }[]>([])
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  const workKind = String(embeddedWorkKind || pageMeta.work_kind || '')
  const fromCase = Boolean(caseId)
  useEffect(() => {
    if (pageMeta.view) setView(String(pageMeta.view))
  }, [pageMeta.view])
  useEffect(() => {
    invoke<{ rows: typeof lawyers }>('lawyers:list', { pageSize: 200 })
      .then((r) => setLawyers(r.rows))
      .catch(() => undefined)
  }, [])
  const filters: Record<string, unknown> = {}
  if (caseId) filters.case_id = caseId
  if (workKind) filters.work_kind = workKind
  if (!fromCase) {
    if (view === 'byLawyer' && lawyerId) filters.assignee_id = lawyerId
    else if (view !== 'all' && view !== 'byLawyer') filters.view = view
  }
  const comboKind = workKind === 'execution' ? 'execution_action' : 'admin_action'
  const title = workKind === 'execution' ? t('caseForm.executionWork') : fromCase ? t('caseForm.adminWork') : t('nav.tasks')
  const details = useRowDetails()

  return (
    <div>
      {!fromCase ? (
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
      ) : null}
      <CrudPage
        title={title}
        listChannel="tasks:list"
        createChannel="tasks:create"
        updateChannel="tasks:update"
        removeChannel="tasks:remove"
        createPerm="tasks.manage"
        updatePerm="tasks.manage"
        deletePerm="tasks.manage"
        schema={taskSchema}
        embedded={Boolean(embeddedCaseId)}
        listFilters={filters}
        defaults={{
          case_id: caseId || pageMeta.case_id,
          client_id: embeddedClientId || pageMeta.client_id,
          work_kind: workKind || 'admin',
          status: 'not_done',
          hearing_id: pageMeta.hearing_id,
          execution_kind: workKind === 'execution' ? 'مدني' : undefined
        }}
        formExtra={(form, setField) => <TaskFormExtras form={form} setField={setField} workKind={workKind || 'admin'} />}
        formExtraAfter="status"
        extraActions={
          <>
            {fromCase && !embeddedCaseId ? (
              <Button variant="outline" onClick={() => goBack()}>
                {t('back')}
              </Button>
            ) : null}
            <VenuePrintBar toast={toast} />
          </>
        }
        columns={
          workKind === 'execution'
            ? [
                {
                  key: 'case_number',
                  label: t('fields.program_code'),
                  render: (r: Record<string, unknown>) => (
                    <span className={isManualProgramCode(r) ? 'font-bold text-red-600' : ''}>
                      {formatProgramCode(r) || '—'}
                    </span>
                  ),
                  onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
                },
                { key: 'status', label: t('fields.status'), status: true },
                {
                  key: 'office_case_number',
                  label: t('fields.court_number'),
                  render: (r: Record<string, unknown>) => <CourtNumberText row={r} />
                },
                {
                  key: 'opponent_name',
                  label: t('fields.opponent_name'),
                  render: (r: Record<string, unknown>) => String(r.opponent_name || '').trim() || '—'
                },
                {
                  key: 'description',
                  label: t('fields.execution_action'),
                  render: (r: Record<string, unknown>) =>
                    String(r.required_action || r.description || r.title || '').trim() || '—'
                },
                { key: 'execution_kind', label: t('fields.execution_kind') },
                { key: 'police_station', label: t('fields.police_station') },
                {
                  key: 'hasr',
                  label: `${t('fields.police_report_kind')} / ${t('fields.police_report_no')}`,
                  render: (r: Record<string, unknown>) => {
                    const kind = String(r.police_report_kind || '').trim()
                    const no = String(r.police_report_no || '').trim()
                    return [kind, no].filter(Boolean).join(' — ') || '—'
                  }
                },
                { key: 'due_date', label: t('fields.due_date') },
                { key: 'venue', label: t('fields.venue') },
                { key: 'assignee_name', label: t('fields.assignee_name') }
              ]
            : [
                {
                  key: 'case_number',
                  label: t('fields.program_code'),
                  render: (r: Record<string, unknown>) => (
                    <span className={isManualProgramCode(r) ? 'font-bold text-red-600' : ''}>
                      {formatProgramCode(r) || '—'}
                    </span>
                  ),
                  onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
                },
                { key: 'status', label: t('fields.status'), status: true },
                {
                  key: 'office_case_number',
                  label: t('fields.court_number'),
                  render: (r: Record<string, unknown>) => <CourtNumberText row={r} />
                },
                {
                  key: 'parties',
                  label: t('fields.parties'),
                  render: (r: Record<string, unknown>) => partiesText(r)
                },
                {
                  key: 'description',
                  label: t('printKit.requiredAction'),
                  render: (r: Record<string, unknown>) =>
                    String(r.required_action || r.description || r.title || '').trim() || '—'
                },
                { key: 'due_date', label: t('fields.due_date') },
                { key: 'venue', label: t('fields.venue') },
                {
                  key: 'notes',
                  label: `${t('fields.notes')} / ${t('printKit.whatWasDone')}`,
                  render: (r: Record<string, unknown>) => String(r.notes || '').trim() || '—'
                }
              ]
        }
        fields={[
          f(t, 'case_id', { lookup: 'cases' }),
          f(t, 'status', { type: 'combo', comboKind: 'task_status' }),
          f(t, 'title', { hidden: true }),
          f(t, 'description', {
            type: 'combo',
            comboKind,
            required: workKind !== 'execution',
            hidden: workKind === 'execution',
            label: t('fields.description')
          }),
          f(t, 'due_date', { type: 'date', required: true }),
          f(t, 'venue', { type: 'combo', comboKind: 'venue', hidden: workKind === 'execution' }),
          f(t, 'assignee_id', { lookup: 'users', label: t('fields.lawyer_id') }),
          f(t, 'client_id', { lookup: 'clients' }),
          f(t, 'priority', { type: 'select', options: st(t, ['low', 'medium', 'high']) })
        ]}
        onRowOpen={details.open}
        onPrint={async (ctx) => {
          const res = await invoke<{ rows: Record<string, unknown>[]; total: number }>('tasks:list', {
            page: 1,
            pageSize: 1000,
            print: true,
            filters
          })
          const fetched = res.rows || []
          const rows = applyPrintColFilters(fetched, ctx.colFilters, i18n.language, t)
          const roll =
            workKind === 'execution'
              ? executionTasksRollTableHtml(rows, t, i18n.language, { emptyLabel: t('noData') })
              : taskRollTableHtml(rows, t, i18n.language, { emptyLabel: t('noData') })
          await sendPrint('report', roll.sheetTitle, roll.html, 'hearingsRoll')
          if ((res.total || 0) > fetched.length) toast(t('printListCapped', { count: fetched.length }))
        }}
      />
      <RecordDetailsModal
        open={Boolean(details.row)}
        title={t('details')}
        onClose={details.close}
        onEdit={details.edit}
        items={
          details.row
            ? [
                { label: t('fields.case_number'), value: String(details.row.case_number || details.row.case_title || '') },
                { label: t('fields.court_number'), value: <CourtNumberText row={details.row} /> },
                { label: t('fields.client_id'), value: String(details.row.client_name || '') },
                { label: t('fields.status'), value: formatCell('status', details.row.status, i18n.language, t) },
                {
                  label: workKind === 'execution' ? t('fields.execution_action') : t('fields.description'),
                  value: String(details.row.description || details.row.title || '')
                },
                { label: t('fields.due_date'), value: formatCell('due_date', details.row.due_date, i18n.language, t) },
                { label: t('fields.venue'), value: String(details.row.venue || '') },
                { label: t('fields.assignee_name'), value: String(details.row.assignee_name || '') },
                { label: t('fields.priority'), value: formatCell('priority', details.row.priority, i18n.language, t) },
                { label: t('fields.execution_kind'), value: String(details.row.execution_kind || '') },
                { label: t('fields.opponent_name'), value: String(details.row.opponent_name || '') },
                { label: t('fields.notes'), value: String(details.row.notes || '') }
              ]
            : []
        }
      />
    </div>
  )
}

export function ExecutionPage() {
  return <TasksPage embeddedWorkKind="execution" />
}

export function ExpertsPage({ embeddedCaseId }: { embeddedCaseId?: string } = {}) {
  const { t, i18n } = useTranslation()
  const { setPage, toast, pageMeta, goBack } = useApp()
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  const fromCase = Boolean(caseId)
  const details = useRowDetails()
  const listFilters: Record<string, unknown> = {}
  if (caseId) listFilters.case_id = caseId
  return (
    <>
    <CrudPage
      title={fromCase ? t('caseForm.expertHearings') : t('nav.experts')}
      listChannel="experts:list"
      createChannel="experts:create"
      updateChannel="experts:update"
      removeChannel="experts:remove"
      createPerm="hearings.create"
      updatePerm="hearings.update"
      deletePerm="hearings.delete"
      schema={expertHearingSchema}
      compactForm
      embedded={Boolean(embeddedCaseId)}
      defaults={{ case_id: caseId || undefined, status: 'upcoming' }}
      formPrefix={(form, setField) => <ExpertFormExtras form={form} setField={setField} />}
      columns={[
        {
          key: 'case_number',
          label: t('fields.program_code'),
          render: (r: Record<string, unknown>) => (
            <span className={isManualProgramCode(r) ? 'font-bold text-red-600' : ''}>{formatProgramCode(r) || '—'}</span>
          ),
          onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
        },
        {
          key: 'office_case_number',
          label: t('fields.court_number'),
          render: (r: Record<string, unknown>) => <CourtNumberText row={r} />
        },
        {
          key: 'parties',
          label: t('fields.parties'),
          render: (r: Record<string, unknown>) => partiesText(r)
        },
        { key: 'status', label: t('fields.status'), status: true },
        { key: 'hearing_date', label: t('fields.hearing_date') },
        { key: 'hearing_time', label: t('fields.hearing_time') },
        { key: 'venue', label: t('fields.venue') },
        { key: 'expert_office', label: t('fields.expert_office') },
        { key: 'expert_name', label: t('fields.expert_name') },
        { key: 'floor', label: t('fields.floor') },
        { key: 'hall', label: t('fields.hall') },
        { key: 'previous_action', label: t('fields.previous_action') },
        { key: 'current_action', label: t('fields.current_action') }
      ]}
      fields={[
        f(t, 'case_id', { lookup: 'cases', required: true }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'status', { type: 'combo', comboKind: 'hearing_status' }),
        f(t, 'previous_action', { type: 'textarea' }),
        f(t, 'current_action', { type: 'textarea' }),
        f(t, 'notes', { type: 'textarea' })
      ]}
      listFilters={Object.keys(listFilters).length ? listFilters : undefined}
      extraActions={
        <>
          {fromCase && !embeddedCaseId ? (
            <Button variant="outline" onClick={() => goBack()}>
              {t('back')}
            </Button>
          ) : null}
          {!fromCase ? <VenuePrintBar toast={toast} /> : null}
        </>
      }
      onPrint={async (ctx) => {
        const res = await invoke<{ rows: Record<string, unknown>[]; total: number }>('experts:list', {
          page: 1,
          pageSize: 1000,
          print: true,
          filters: listFilters
        })
        const fetched = res.rows || []
        const rows = applyPrintColFilters(fetched, ctx.colFilters, i18n.language, t)
        const roll = expertRollTableHtml(rows, t, i18n.language, { emptyLabel: t('noData') })
        await sendPrint('report', roll.sheetTitle, roll.html, 'hearingsRoll')
        if ((res.total || 0) > fetched.length) toast(t('printListCapped', { count: fetched.length }))
      }}
      onRowOpen={details.open}
    />
    <RecordDetailsModal
      open={Boolean(details.row)}
      title={t('details')}
      onClose={details.close}
      onEdit={details.edit}
      items={
        details.row
          ? [
              { label: t('fields.program_code'), value: formatProgramCode(details.row) },
              { label: t('fields.court_number'), value: <CourtNumberText row={details.row} /> },
              { label: t('fields.parties'), value: partiesText(details.row) },
              { label: t('fields.hearing_date'), value: formatCell('hearing_date', details.row.hearing_date, i18n.language, t) },
              { label: t('fields.hearing_time'), value: formatCell('hearing_time', details.row.hearing_time, i18n.language, t) },
              { label: t('fields.expert_office'), value: String(details.row.expert_office || '') },
              { label: t('fields.expert_name'), value: String(details.row.expert_name || '') },
              { label: t('fields.floor'), value: String(details.row.floor || '') },
              { label: t('fields.hall'), value: String(details.row.hall || '') },
              { label: t('fields.previous_action'), value: String(details.row.previous_action || '') },
              { label: t('fields.current_action'), value: String(details.row.current_action || '') },
              { label: t('fields.status'), value: formatCell('status', details.row.status, i18n.language, t) },
              { label: t('fields.notes'), value: String(details.row.notes || '') }
            ]
          : []
      }
    />
    </>
  )
}
