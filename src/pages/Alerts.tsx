import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, PageHeader } from '../components/ui'
import { formatDateTime } from '../lib/datetime'
import { onDataChanged } from '../lib/bus'

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

function openRelated(n: Note, setPage: (p: string, m?: Record<string, unknown>) => void) {
  const kind = String(n.related_type || n.type || '')
  const id = String(n.related_id || '')
  if (kind === 'case' && id) setPage('caseProfile', { id })
  else if (kind === 'hearing' && id) setPage('hearings', { edit_id: id })
  else if (kind === 'task' && id) setPage('tasks', { edit_id: id })
  else if (kind === 'appointment') setPage('appointments')
  else if (kind === 'client' && id) setPage('clientProfile', { id })
  else if (kind === 'poa') setPage('poa')
  else if (kind === 'reminder') setPage('reminders')
}

export function AlertsPage() {
  const { t, i18n } = useTranslation()
  const { toast, setPage } = useApp()
  const [rows, setRows] = useState<Note[]>([])
  const [hideDone, setHideDone] = useState(true)

  const load = () =>
    invoke<Note[]>('notifications:list')
      .then(setRows)
      .catch((e) => toast((e as Error).message, 'err'))

  useEffect(() => {
    load()
  }, [])
  useEffect(() => onDataChanged(() => load(), ['notifications']), [])

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
                onClick={() => openRelated(n, setPage)}
              >
                <div className="font-semibold">{n.title}</div>
                {n.body ? <div className="text-sm text-navy-600 dark:text-navy-300">{n.body}</div> : null}
                <div className="text-xs text-navy-400">{formatDateTime(n.created_at, i18n.language)}</div>
              </button>
            </li>
          ))}
          {!visible.length ? <li className="px-1 py-8 text-center text-navy-400">{t('noData')}</li> : null}
        </ul>
      </Card>
    </div>
  )
}
