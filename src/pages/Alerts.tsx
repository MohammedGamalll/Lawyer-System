import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Modal, PageHeader, Textarea } from '../components/ui'
import { formatCell, formatDateTime } from '../lib/datetime'
import { CourtNumberText } from '../components/CourtNumberText'
import { onDataChanged } from '../lib/bus'
import { cairoAddDays, cairoTodayIso } from '@shared/cairoDate'
import { stripBidiMarks } from '@shared/rtlBidi'

type Note = {
  id: string
  title: string
  body?: string | null
  type?: string | null
  related_type?: string | null
  related_id?: string | null
  is_read: number
  created_at: string
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

function partiesLine(row: TaskRow) {
  return [row.client_name, row.opponent_name].map((v) => String(v || '').trim()).filter(Boolean).join(' / ')
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

  const load = () =>
    invoke<Note[]>('notifications:list')
      .then(setRows)
      .catch((e) => toast((e as Error).message, 'err'))

  useEffect(() => {
    load()
  }, [])
  useEffect(() => onDataChanged(() => load(), ['notifications', 'tasks']), [])

  const visible = hideDone ? rows.filter((n) => !n.is_read) : rows

  const toggle = async (n: Note, done: boolean) => {
    try {
      if (done) await invoke('notifications:read', n.id, true)
      else await invoke('notifications:read', n.id, false)
      setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: done ? 1 : 0 } : x)))
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
          </span>
        }
      />
      <Card>
        <ul className="divide-y divide-navy-100 dark:divide-navy-800">
          {visible.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 px-1 py-3 ${n.is_read ? 'opacity-50' : ''}`}
            >
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(n.is_read)}
                  onChange={(e) => void toggle(n, e.target.checked)}
                />
                <span className="sr-only">{t('alerts.done')}</span>
              </label>
              <button
                type="button"
                className="min-w-0 flex-1 text-start"
                onClick={() => (isTaskNote(n) ? void openTask(n) : openRelated(n, setPage))}
              >
                <div className="font-semibold">{n.title}</div>
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
              <strong>{t('fields.case_number')}:</strong>{' '}
              {String(task.case_number || '').replace(/^(CS|CL)-/i, '') || '—'}
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
