import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrudPage, FieldDef } from '../components/CrudPage'
import { HearingFormExtras } from '../components/HearingFormExtras'
import { VenuePrintBar } from '../components/VenuePrintBar'
import { Button, Select } from '../components/ui'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { HEARING_STATUSES, TASK_STATUSES } from '@shared/types'
import { hearingSchema, taskSchema } from '@shared/schemas'

const st = (t: (k: string) => string, arr: readonly string[]) => arr.map((v) => ({ value: v, label: t(`status.${v}`) }))

function f(t: (k: string) => string, name: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, label: t(`fields.${name}`), ...extra }
}

export function HearingsPage({ embeddedCaseId }: { embeddedCaseId?: string } = {}) {
  const { t } = useTranslation()
  const { setPage, toast, pageMeta, goBack } = useApp()
  const caseId = String(embeddedCaseId || pageMeta.case_id || '')
  const expert = !embeddedCaseId && pageMeta.hearing_kind === 'expert'
  const listFilters: Record<string, unknown> = {}
  if (caseId) listFilters.case_id = caseId
  if (expert) listFilters.hearing_kind = 'expert'
  const fromCase = Boolean(caseId)
  return (
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
        { key: 'status', label: t('fields.status'), status: true }
      ]}
      fields={[
        f(t, 'case_id', { lookup: 'cases', required: true }),
        f(t, 'lawyer_id', { lookup: 'lawyers' }),
        f(t, 'status', { type: 'select', options: st(t, HEARING_STATUSES) }),
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
    />
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
  const { t } = useTranslation()
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
          status: 'not_done'
        }}
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
          { key: 'title', label: t('fields.title') },
          ...(!fromCase
            ? [
                {
                  key: 'case_number',
                  label: t('fields.case_number'),
                  onCellClick: (r: Record<string, unknown>) => r.case_id && setPage('caseProfile', { id: r.case_id })
                }
              ]
            : []),
          { key: 'description', label: t('fields.description') },
          { key: 'venue', label: t('fields.venue') },
          { key: 'assignee_name', label: t('fields.assignee_name') },
          { key: 'due_date', label: t('fields.due_date') },
          { key: 'status', label: t('fields.status'), status: true }
        ]}
        fields={[
          f(t, 'title', { required: true, type: 'combo', comboKind }),
          f(t, 'description', { type: 'textarea', required: true }),
          f(t, 'due_date', { type: 'date', required: true }),
          f(t, 'venue', { type: 'combo', comboKind: 'venue' }),
          f(t, 'assignee_id', { lookup: 'users', label: t('fields.lawyer_id') }),
          f(t, 'case_id', { lookup: 'cases' }),
          f(t, 'client_id', { lookup: 'clients' }),
          f(t, 'status', { type: 'select', options: st(t, TASK_STATUSES) }),
          f(t, 'priority', { type: 'select', options: st(t, ['low', 'medium', 'high']) })
        ]}
      />
    </div>
  )
}
