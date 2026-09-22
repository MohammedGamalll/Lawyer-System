import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { formatCell, formatDateTime } from '../lib/datetime'
import { formatProgramCode, courtParts } from '../lib/courtNumber'
import { CourtNumberText } from '../components/CourtNumberText'
import { onDataChanged } from '../lib/bus'
import { cairoAddDays, cairoTodayIso } from '@shared/cairoDate'
import { stripBidiMarks } from '@shared/rtlBidi'
import { compactTableHtml, courtNumberPrint, escPrint, sendPrint } from '../lib/printKit'
import { DatePicker } from '../components/DateTimePicker'

type Note = {
  id: string
  title: string
  body?: string | null
  type?: string | null
  related_type?: string | null
  related_id?: string | null
  is_read: number
  created_at: string
  client_name?: string | null
  opponent_name?: string | null
  case_number?: string | null
  office_case_number?: string | null
  case_year?: string | null
  first_instance_number?: string | null
  first_instance_year?: string | null
  appeal_number?: string | null
  appeal_year?: string | null
  cassation_number?: string | null
  cassation_year?: string | null
}

type TaskRow = Record<string, unknown>

function isTaskNote(n: Note) {
  return String(n.related_type || n.type || '') === 'task' && Boolean(n.related_id)
}

function openRelated(n: Note, setPage: (p: string, m?: Record<string, unknown>) => void) {
  const kind = String(n.related_type || n.type || '')
  const id = String(n.related_id || '')
  if (kind === 'case' && id) setPage('caseProfile', { id })
  else if (kind === 'hearing' && id) setPage('hearings', { edit_id: id })
  else if (kind === 'appointment') setPage('appointments')
  else if (kind === 'client' && id) setPage('clientProfile', { id })
  else if (kind === 'poa') setPage('poa')
  else if (kind === 'reminder') setPage('reminders')
}

function partiesLine(row: TaskRow | Note) {
  return [row.client_name, row.opponent_name].map((v) => String(v || '').trim()).filter(Boolean).join(' / ')
}

function alertKind(n: Note) {
  return String(n.related_type || n.type || '')
}

function alertKindLabel(n: Note, t: (key: string, opts?: { defaultValue?: string }) => string) {
  const k = alertKind(n)
  if (!k) return ''
  return t(`types.${k}`, { defaultValue: k })
}

function AlertBodyText({ text }: { text: string }) {
  const parts = String(text || '').split(/\s+[—–]\s+/)
  return (
    <span className="text-sm text-navy-600 dark:text-navy-300">
      {parts.map((part, i) => {
        const raw = stripBidiMarks(part)
        const m = raw.match(/^(\d{1,7})\s*\/\s*(\d{2,4})$/)
        return (
          <span key={`${i}-${raw}`}>
            {i > 0 ? ' — ' : null}
            {m ? (
              <CourtNumberText row={{ office_case_number: m[1], case_year: m[2] }} />
            ) : /^(CS|CL)-/i.test(raw) ? (
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                {raw}
              </span>
            ) : (
              raw
            )}
          </span>
        )
      })}
    </span>
  )
}

function TaskAlertActions({
  busy,
  onPostpone,
  onEdit,
  onComplete
}: {
  busy: boolean
  onPostpone: () => void
  onEdit?: () => void
  onComplete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={onPostpone}>
        {t('alerts.postponeTomorrow')}
      </Button>
      {onEdit ? (
        <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={onEdit}>
          {t('alerts.editStatement')}
        </Button>
      ) : null}
      <Button type="button" className="h-8 px-2 text-xs" disabled={busy} onClick={onComplete}>
        {t('alerts.complete')}
      </Button>
    </div>
  )
}

export function AlertsPage() {
  const { t, i18n } = useTranslation()
  const { toast, setPage } = useApp()
  const [rows, setRows] = useState<Note[]>([])
  const [hideDone, setHideDone] = useState(true)
  const [taskNote, setTaskNote] = useState<Note | null>(null)
  const [task, setTask] = useState<TaskRow | null>(null)
  const [statement, setStatement] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [typeFilter, setTypeFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = () =>
    invoke<Note[]>('notifications:list')
      .then(setRows)
      .catch((e) => toast((e as Error).message, 'err'))

  useEffect(() => {
    load()
  }, [])
  useEffect(() => onDataChanged(() => load(), ['notifications', 'tasks']), [])

  const visible = useMemo(() => {
    return rows.filter((n) => {
      if (hideDone && n.is_read) return false
      if (typeFilter && alertKind(n) !== typeFilter && String(n.type || '') !== typeFilter) return false
      const day = String(n.created_at || '').slice(0, 10)
      if (from && day && day < from) return false
      if (to && day && day > to) return false
      return true
    })
  }, [rows, hideDone, typeFilter, from, to])

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const n of rows) {
      const k = alertKind(n)
      if (k) set.add(k)
    }
    return [...set]
  }, [rows])

  const togglePick = (id: string, on: boolean) => setPicked((p) => ({ ...p, [id]: on }))

  const printPicked = async () => {
    const selected = visible.filter((n) => picked[n.id])
    const chosen = selected.length ? selected : visible
    if (!chosen.length) return
    const html = compactTableHtml({
      columns: [
        { label: t('alerts.colTitle') },
        { label: t('fields.program_code') },
        { label: t('fields.client_id') },
        { label: t('fields.opponent_name') },
        { label: t('fields.court_number') },
        { label: t('alerts.colType') },
        { label: t('alerts.colDate') }
      ],
      rows: chosen.map((n) => [
        escPrint(n.title),
        escPrint(formatProgramCode(n)),
        escPrint(n.client_name || ''),
        escPrint(n.opponent_name || ''),
        courtNumberPrint(n),
        escPrint(alertKindLabel(n, t)),
        escPrint(formatDateTime(n.created_at, i18n.language))
      ]),
      notesLabel: t('fields.notes'),
      emptyLabel: t('noData'),
      subtitle: selected.length ? t('alerts.printSelected') : t('printSelected')
    })
    try {
      await sendPrint('report', t('nav.alerts'), html, 'landscape')
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const openTask = async (n: Note) => {
    setTaskNote(n)
    setTask(null)
    setStatement('')
    try {
      const row = await invoke<TaskRow>('tasks:get', String(n.related_id))
      setTask(row)
      setStatement(String(row.description || row.title || ''))
    } catch (e) {
      toast((e as Error).message, 'err')
      setTaskNote(null)
    }
  }

  const saveTask = async (patch: Record<string, unknown>, closeAlert = false, note = taskNote, row = task) => {
    if (!note || !row) return
    setBusy(true)
    try {
      await invoke('tasks:update', String(row.id), { ...row, ...patch })
      if (closeAlert) await invoke('notifications:read', note.id, true)
      toast(t('savedOk'))
      if (closeAlert) {
        setTaskNote(null)
        setTask(null)
      } else if (taskNote?.id === note.id) {
        const next = await invoke<TaskRow>('tasks:get', String(row.id))
        setTask(next)
        setStatement(String(next.description || next.title || ''))
      }
      load()
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const actFromRow = async (n: Note, kind: 'postpone' | 'complete' | 'edit') => {
    if (kind === 'edit') {
      await openTask(n)
      return
    }
    setBusy(true)
    try {
      const row = await invoke<TaskRow>('tasks:get', String(n.related_id))
      if (kind === 'postpone') {
        await saveTask(
          {
            due_date: cairoAddDays(cairoTodayIso(), 1),
            status: String(row.status) === 'overdue' ? 'not_done' : row.status
          },
          false,
          n,
          row
        )
      } else {
        await saveTask({ status: 'completed' }, true, n, row)
      }
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.alerts')}
        actions={
          <span className="flex flex-wrap gap-2">
            <Button variant={hideDone ? 'primary' : 'outline'} onClick={() => setHideDone(true)}>
              {t('alerts.openOnly')}
            </Button>
            <Button variant={!hideDone ? 'primary' : 'outline'} onClick={() => setHideDone(false)}>
              {t('alerts.all')}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await invoke('notifications:readAll')
                  toast(t('savedOk'))
                  load()
                } catch (e) {
                  toast((e as Error).message, 'err')
                }
              }}
            >
              {t('alerts.markAll')}
            </Button>
            <Button
              variant="outline"
              disabled={!visible.length}
              onClick={() => void printPicked()}
            >
              {t('alerts.printSelected')}
            </Button>
          </span>
        }
      />
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Field label={t('alerts.filterType')}>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">{t('alerts.allTypes')}</option>
                {types.map((k) => (
                  <option key={k} value={k}>
                    {t(`types.${k}`, { defaultValue: k })}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('alerts.dateFrom')}>
            <DatePicker value={from} onChange={setFrom} />
          </Field>
          <Field label={t('alerts.dateTo')}>
            <DatePicker value={to} onChange={setTo} />
          </Field>
        </div>
        <ul className="divide-y divide-navy-100 dark:divide-navy-800">
          {visible.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-1 py-3 ${n.is_read ? 'opacity-50' : ''}`}
            >
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(picked[n.id])}
                  onChange={(e) => togglePick(n.id, e.target.checked)}
                />
                <span className="sr-only">{t('alerts.selectRow')}</span>
              </label>
              <button
                type="button"
                className="min-w-0 flex-1 text-start"
                onClick={() => (isTaskNote(n) ? void openTask(n) : openRelated(n, setPage))}
              >
                <div className="font-semibold">{n.title}</div>
                <div className="text-sm font-bold">
                  <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                    {formatProgramCode(n) || '—'}
                  </span>
                </div>
                {partiesLine(n) ? <div className="text-sm">{partiesLine(n)}</div> : null}
                {courtParts(n).office ? (
                  <div className="text-sm">
                    <CourtNumberText row={n} />
                  </div>
                ) : null}
                {n.body ? <AlertBodyText text={n.body} /> : null}
                <div className="text-xs text-navy-400">{formatDateTime(n.created_at, i18n.language)}</div>
              </button>
              {isTaskNote(n) ? (
                <TaskAlertActions
                  busy={busy}
                  onPostpone={() => void actFromRow(n, 'postpone')}
                  onEdit={() => void actFromRow(n, 'edit')}
                  onComplete={() => void actFromRow(n, 'complete')}
                />
              ) : null}
            </li>
          ))}
          {!visible.length ? <li className="px-1 py-8 text-center text-navy-400">{t('noData')}</li> : null}
        </ul>
      </Card>
      <Modal
        open={Boolean(taskNote)}
        title={t('alerts.taskDetails')}
        onClose={() => {
          setTaskNote(null)
          setTask(null)
        }}
        wide
      >
        {task ? (
          <div className="space-y-3 text-sm">
            <div>
              <strong>{t('fields.program_code')}:</strong>{' '}
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                {formatProgramCode(task) || '—'}
              </span>
              {' — '}
              <CourtNumberText row={task} />
            </div>
            <div>
              <strong>{t('fields.parties')}:</strong> {partiesLine(task) || '—'}
            </div>
            <div>
              <strong>{t('fields.hearingCourt')}:</strong> {String(task.court || task.venue || '—')}
            </div>
            <div>
              <strong>{t('fields.due_date')}:</strong> {formatCell('due_date', task.due_date, i18n.language, t)}
            </div>
            <div>
              <strong>{t('fields.status')}:</strong> {formatCell('status', task.status, i18n.language, t)}
            </div>
            {task.notes ? (
              <div>
                <strong>{t('fields.notes')}:</strong> {String(task.notes)}
              </div>
            ) : null}
            <Field label={t('alerts.editStatement')}>
              <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <TaskAlertActions
                busy={busy}
                onPostpone={() =>
                  void saveTask({
                    due_date: cairoAddDays(cairoTodayIso(), 1),
                    status: String(task.status) === 'overdue' ? 'not_done' : task.status
                  })
                }
                onComplete={() => void saveTask({ status: 'completed', description: statement.trim() || task.description }, true)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || !statement.trim()}
                onClick={() => void saveTask({ description: statement.trim() })}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-navy-500">{t('loading')}</div>
        )}
      </Modal>
    </div>
  )
}
