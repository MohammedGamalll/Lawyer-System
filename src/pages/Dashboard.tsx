import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card } from '../components/ui'
import { formatDateTime, formatTime } from '../lib/datetime'

const COLORS = ['#122f4d', '#c9a227', '#3d6d9e', '#8c6b16', '#6e97c0', '#163a5f']

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { setPage, toast, can } = useApp()
  const [s, setS] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    invoke<Record<string, unknown>>('dashboard:stats').then(setS).catch((e) => toast(e.message, 'err'))
  }, [])

  if (!s) return <div className="p-10 text-navy-400">{t('loading')}</div>

  const cards: { key: string; label: string; value: unknown }[] = [
    { key: 'clients', label: t('dash.clients'), value: s.clients },
    { key: 'newClients', label: t('dash.newClients'), value: s.newClients },
    { key: 'cases', label: t('dash.cases'), value: s.cases },
    { key: 'openCases', label: t('dash.open'), value: s.openCases },
    { key: 'closedCases', label: t('dash.closed'), value: s.closedCases },
    { key: 'postponedCases', label: t('dash.postponed'), value: s.postponedCases },
    { key: 'actionCases', label: t('dash.action'), value: s.actionCases },
    { key: 'hearingsToday', label: t('dash.todayH'), value: s.hearingsToday },
    { key: 'hearingsTomorrow', label: t('dash.tomorrowH'), value: s.hearingsTomorrow },
    { key: 'hearingsWeek', label: t('dash.weekH'), value: s.hearingsWeek },
    { key: 'upcomingAppointments', label: t('dash.appts'), value: s.upcomingAppointments },
    { key: 'overdueTasks', label: t('dash.overdue'), value: s.overdueTasks },
    { key: 'todayTasks', label: t('dash.todayT'), value: s.todayTasks },
    { key: 'reminders', label: t('dash.reminders'), value: s.reminders },
    { key: 'income', label: t('dash.income'), value: Number(s.income).toLocaleString('ar-EG') },
    { key: 'expenses', label: t('dash.expenses'), value: Number(s.expenses).toLocaleString('ar-EG') },
    { key: 'profit', label: t('dash.profit'), value: Number(s.profit).toLocaleString('ar-EG') },
    { key: 'due', label: t('dash.due'), value: Number(s.due).toLocaleString('ar-EG') }
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">{t('nav.dashboard')}</h1>
        <div className="flex flex-wrap gap-2">
          {can('clients.create') && <Button variant="gold" onClick={() => setPage('clients', { create: true })}>{t('dash.newClient')}</Button>}
          {can('cases.create') && <Button onClick={() => setPage('cases', { create: true })}>{t('dash.newCase')}</Button>}
          {can('hearings.create') && <Button variant="outline" onClick={() => setPage('hearings', { create: true })}>{t('dash.newHearing')}</Button>}
          {can('appointments.manage') && <Button variant="outline" onClick={() => setPage('calendar')}>{t('dash.newAppt')}</Button>}
          {can('tasks.manage') && <Button variant="outline" onClick={() => setPage('tasks', { create: true })}>{t('dash.newTask')}</Button>}
          {can('accounts.payment') && <Button variant="outline" onClick={() => setPage('accounts', { create: true })}>{t('dash.newPay')}</Button>}
          {can('documents.upload') && <Button variant="outline" onClick={() => setPage('documents', { create: true })}>{t('dash.newDoc')}</Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.key} className="min-h-[92px]">
            <div className="text-xs text-navy-500">{c.label}</div>
            <div className="mt-1 text-2xl font-extrabold text-navy-900 dark:text-white">{String(c.value)}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.casesByMonth')}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={s.casesByMonth as object[]}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#122f4d" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.casesByType')}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={s.casesByType as { name: string; count: number }[]} dataKey="count" nameKey="name" outerRadius={80}>
                  {(s.casesByType as unknown[]).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.incomeExpense')}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={mergeMonths(s.incomeByMonth as { month: string; total: number }[], s.expenseByMonth as { month: string; total: number }[])}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="income" name={t('dash.income')} stroke="#c9a227" />
                <Line type="monotone" dataKey="expense" name={t('dash.expenses')} stroke="#122f4d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.lawyerDist')}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={s.lawyerPerf as object[]}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" name={t('fields.total')} fill="#163a5f" />
                <Bar dataKey="open_count" name={t('dash.open')} fill="#c9a227" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.todayH')}</h3>
          <ul className="space-y-2 text-sm">
            {(s.todayHearingList as { id: number; case_number: string; case_title: string; client_name: string; hearing_time: string }[]).map((h) => (
              <li key={h.id} className="rounded-lg bg-navy-50 px-3 py-2 dark:bg-navy-800">
                {formatTime(h.hearing_time, i18n.language)} — {h.case_number} {h.case_title} ({h.client_name})
              </li>
            ))}
            {!(s.todayHearingList as unknown[])?.length && <li className="text-navy-400">{t('noData')}</li>}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">{t('dash.activity')}</h3>
          <ul className="space-y-2 text-sm">
            {(s.activity as { id: number; description: string; created_at: string; username: string }[]).map((a) => (
              <li key={a.id} className="border-b border-navy-50 pb-2 dark:border-navy-800">
                <div>{a.description}</div>
                <div className="text-xs text-navy-400">
                  {a.username} — {formatDateTime(a.created_at, i18n.language)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function mergeMonths(a: { month: string; total: number }[], b: { month: string; total: number }[]) {
  const map: Record<string, { month: string; income: number; expense: number }> = {}
  for (const x of a || []) map[x.month] = { month: x.month, income: x.total, expense: 0 }
  for (const x of b || []) {
    map[x.month] = map[x.month] || { month: x.month, income: 0, expense: 0 }
    map[x.month].expense = x.total
  }
  return Object.values(map).sort((x, y) => x.month.localeCompare(y.month))
}
