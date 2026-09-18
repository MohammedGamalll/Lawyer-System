import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { HearingFormExtras } from '../components/HearingFormExtras'
import { TaskFormExtras } from '../components/TaskFormExtras'
import { VenuePrintBar } from '../components/VenuePrintBar'
import { Button, Modal, Select } from '../components/ui'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { hearingSchema, taskSchema } from '@shared/schemas'
import { formatCell } from '../lib/datetime'
import {
  applyPrintColFilters,
  executionTasksRollTableHtml,
  hearingRollTableHtml,
  sendPrint,
  taskRollTableHtml
} from '../lib/printKit'

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

function f(t: (k: string) => string, name: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label: t(`fields.${name}`), ...extra }
}

export function HearingsPage({ embeddedCaseId }: { embeddedCaseId?: string } = {}) {
  const { t, i18n } = useTranslation()
  const { setPage, toast, pageMeta, goBack } = useApp()
  const [adminModal, setAdminModal] = useState<{ caseId: string; rows: Record<string, unknown>[] } | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  const expert = !embeddedCaseId && pageMeta.hearing_kind === 'expert'
  const listFilters: Record<string, unknown> = {}
  if (caseId) listFilters.case_id = caseId
  if (expert) listFilters.hearing_kind = 'expert'
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
      title={expert ? t('caseForm.expertHearings') : fromCase ? t('caseForm.courtHearings') : t('nav.hearings')}
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
        hearing_type: expert ? 'جلسة خبير' : undefined,
        upcoming_procedures: []
      }}
      formPrefix={(form, setField) => <HearingFormExtras form={form} setField={setField} />}
      columns={[
        { key: 'hearing_date', label: t('fields.hearing_date') },
        ...(!fromCase
          ? [
              {
                key: 'case_number',
                label: t('fields.case_number'),
                onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
              }
            ]
          : []),
        { key: 'hearing_type', label: t('fields.hearing_type') },
        { key: 'venue', label: t('fields.venue') },
        { key: 'previous_decision', label: t('fields.previous_decision') },
        { key: 'court_decision', label: t('fields.court_decision') },
        { key: 'status', label: t('fields.status'), status: true },
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
        f(t, 'result'),
        f(t, 'court_decision', { type: 'textarea' }),
        f(t, 'postponement_reason'),
        f(t, 'what_happened', { type: 'textarea' }),
        f(t, 'required_documents', { type: 'textarea' }),
        f(t, 'next_actions', { type: 'textarea' }),
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
          <VenuePrintBar toast={toast} />
        </>
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
  const [view, setView] = useState('all')
  const [lawyerId, setLawyerId] = useState('')
  const [lawyers, setLawyers] = useState<{ id: string; user_id: string | null; full_name: string }[]>([])
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  const workKind = String(embeddedWorkKind || pageMeta.work_kind || '')
  const fromCase = Boolean(caseId)
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
        formPrefix={(form, setField) => <TaskFormExtras form={form} setField={setField} workKind={workKind || 'admin'} />}
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
        columns={[
          {
            key: workKind === 'execution' ? 'description' : 'title',
            label: workKind === 'execution' ? t('fields.execution_action') : t('fields.title')
          },
          ...(!fromCase
            ? [
                {
                  key: 'case_number',
                  label: t('fields.case_number'),
                  onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
                }
              ]
            : []),
          ...(workKind === 'execution'
            ? []
            : [{ key: 'description', label: t('fields.description') }]),
          { key: 'venue', label: t('fields.venue') },
          ...(workKind === 'execution'
            ? [
                { key: 'execution_kind', label: t('fields.execution_kind') },
                { key: 'police_report_kind', label: t('fields.police_report_kind') },
                { key: 'police_report_no', label: t('fields.police_report_no') },
                { key: 'police_station', label: t('fields.police_station') },
                { key: 'opponent_name', label: t('fields.opponent_name') }
              ]
            : []),
          { key: 'assignee_name', label: t('fields.assignee_name') },
          { key: 'due_date', label: t('fields.due_date') },
          { key: 'status', label: t('fields.status'), status: true }
        ]}
        fields={[
          f(t, 'title', {
            required: workKind !== 'execution',
            type: 'combo',
            comboKind,
            hidden: workKind === 'execution'
          }),
          f(t, 'description', {
            type: 'combo',
            comboKind,
            required: true,
            label: workKind === 'execution' ? t('fields.execution_action') : t('fields.description')
          }),
          f(t, 'due_date', { type: 'date', required: true }),
          f(t, 'venue', { type: 'combo', comboKind: 'venue', hidden: workKind === 'execution' }),
          f(t, 'assignee_id', { lookup: 'users', label: t('fields.lawyer_id') }),
          f(t, 'case_id', { lookup: 'cases' }),
          f(t, 'client_id', { lookup: 'clients' }),
          f(t, 'status', { type: 'combo', comboKind: 'task_status' }),
          f(t, 'priority', { type: 'select', options: st(t, ['low', 'medium', 'high']) })
        ]}
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
    </div>
  )
}

export function ExecutionPage() {
  return <TasksPage embeddedWorkKind="execution" />
}
