import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import multiMonthPlugin from '@fullcalendar/multimonth'
import arLocale from '@fullcalendar/core/locales/ar'
import type { EventDropArg, EventInput } from '@fullcalendar/core'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, InfoGrid, Modal, PageHeader } from '../components/ui'
import { FormFields, FieldDef } from '../components/CrudPage'
import { appointmentSchema } from '@shared/schemas'
import { formatCell, toIsoDate } from '../lib/datetime'

type CalEvent = {
  id: string
  date: string
  time?: string
  title?: string
  case_number?: string
  case_id?: string
  kind: string
}

export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const { toast, setPage } = useApp()
  const [events, setEvents] = useState<EventInput[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({ date: isoDate(new Date()), appointment_type: 'client' })
  const [range, setRange] = useState({ from: isoDate(new Date()), to: isoDate(new Date()) })
  const [detail, setDetail] = useState<{ kind: string; data: Record<string, unknown> } | null>(null)

  const load = async (from = range.from, to = range.to) => {
    const rows = await invoke<CalEvent[]>('calendar:events', from, to)
    setEvents(
      rows.map((ev) => ({
        id: `${ev.kind}:${ev.id}`,
        title: ev.kind === 'hearing' ? `${ev.case_number || ''} — ${ev.title || ''}`.trim() : String(ev.title || ev.case_number || ''),
        start: ev.time ? `${String(ev.date).slice(0, 10)}T${String(ev.time).slice(0, 5)}` : String(ev.date).slice(0, 10),
        allDay: !ev.time,
        editable: true,
        extendedProps: { kind: ev.kind, entityId: ev.id, case_id: ev.case_id }
      }))
    )
  }

  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [range.from, range.to])

  const onDrop = async (info: EventDropArg) => {
    const [kind, id] = String(info.event.id).split(':')
    const start = info.event.start
    if (!start) return
    const date = isoDate(start)
    const time = info.event.allDay ? undefined : start.toTimeString().slice(0, 5)
    try {
      await invoke('calendar:move', kind, String(id), date, time)
      toast(t('cal.moved'))
    } catch (e) {
      toast((e as Error).message, 'err')
      info.revert()
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.calendar')}
        actions={
          <Button variant="gold" onClick={() => setOpen(true)}>
            {t('cal.newAppt')}
          </Button>
        }
      />
      <div className="law-calendar rounded-xl border bg-white p-3 dark:bg-navy-900 dark:border-navy-700">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            start: 'prev,next today',
            center: 'title',
            end: 'timeGridDay,timeGridWeek,dayGridMonth,multiMonthYear'
          }}
          buttonText={{
            today: t('cal.today'),
            day: t('cal.day'),
            week: t('cal.week'),
            month: t('cal.month'),
            year: t('cal.year')
          }}
          locale={i18n.language === 'ar' ? arLocale : 'en'}
          direction={i18n.language === 'ar' ? 'rtl' : 'ltr'}
          editable
          droppable
          events={events}
          eventDrop={onDrop}
          eventClick={async (info) => {
            const kind = String(info.event.extendedProps.kind || String(info.event.id).split(':')[0])
            const entityId = String(info.event.extendedProps.entityId || String(info.event.id).split(':')[1] || '')
            const channel =
              kind === 'hearing'
                ? 'hearings:get'
                : kind === 'task'
                  ? 'tasks:get'
                  : kind === 'appointment'
                    ? 'appointments:get'
                    : kind === 'reminder'
                      ? 'reminders:get'
                      : ''
            if (!channel || !entityId) return
            try {
              const data = await invoke<Record<string, unknown>>(channel, entityId)
              setDetail({ kind, data })
            } catch (e) {
              toast((e as Error).message, 'err')
            }
          }}
          datesSet={(arg) => {
            const from = isoDate(arg.start)
            const to = isoDate(new Date(arg.end.getTime() - 86400000))
            setRange((prev) => (prev.from === from && prev.to === to ? prev : { from, to }))
          }}
          height="auto"
          dayMaxEvents={3}
          eventDisplay="block"
        />
      </div>
      <Modal
        open={!!detail}
        title={t('details')}
        onClose={() => setDetail(null)}
        wide
      >
        {detail && (
          <div className="space-y-3">
            <InfoGrid
              items={Object.entries(detail.data)
                .filter(([k, v]) => !k.endsWith('_id') || k === 'case_id')
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .slice(0, 16)
                .map(([k, v]) => ({
                  label: t(`fields.${k}`, { defaultValue: k }),
                  value: formatCell(k, v, i18n.language, t)
                }))}
            />
            <div className="flex justify-end gap-2">
              {detail.data.case_id ? (
                <Button
                  variant="gold"
                  onClick={() => {
                    setPage('caseProfile', { id: String(detail.data.case_id) })
                    setDetail(null)
                  }}
                >
                  {t('nav.cases')}
                </Button>
              ) : null}
              {detail.kind === 'hearing' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPage('hearings')
                    setDetail(null)
                  }}
                >
                  {t('nav.hearings')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal open={open} title={t('cal.newAppt')} onClose={() => setOpen(false)} wide>
        <FormFields
          fields={apptFields(t)}
          values={form}
          onChange={(n, v) => setForm({ ...form, [n]: v })}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={async () => {
              const parsed = appointmentSchema.safeParse(form)
              if (!parsed.success) {
                toast(parsed.error.issues[0]?.message || t('error'), 'err')
                return
              }
              await invoke('appointments:create', parsed.data)
              toast(t('savedOk'))
              setOpen(false)
              load()
            }}
          >
            {t('save')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function isoDate(d: Date) {
  return toIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function apptFields(t: (k: string) => string): FieldDef[] {
  return [
    { name: 'title', label: t('fields.title'), required: true },
    {
      name: 'appointment_type',
      label: t('fields.appointment_type'),
      type: 'select',
      options: ['client', 'consultation', 'meeting', 'interview', 'signing', 'payment'].map((v) => ({
        value: v,
        label: t(`status.${v}`)
      }))
    },
    { name: 'client_id', label: t('fields.client_id'), lookup: 'clients' },
    { name: 'lawyer_id', label: t('fields.lawyer_id'), lookup: 'lawyers' },
    { name: 'case_id', label: t('fields.case_id'), lookup: 'cases' },
    { name: 'date', label: t('fields.date'), type: 'date', required: true },
    { name: 'time', label: t('fields.time'), type: 'time' },
    { name: 'location', label: t('fields.location') },
    { name: 'purpose', label: t('fields.purpose') },
    { name: 'notes', label: t('fields.notes'), type: 'textarea' }
  ]
}
