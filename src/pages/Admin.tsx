import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { DatePicker } from '../components/DateTimePicker'
import { CrudPage } from '../components/CrudPage'
import i18n from '../i18n'
import { formatCell } from '../lib/datetime'
import { wipeAllBusinessData } from '../lib/wipeData'
import { applyFontSize, clampFontSize, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../lib/uiPrefs'
import type { SyncSnapshot } from '../store/sync'

const REPORT_KEYS = [
  'clients',
  'cases',
  'cases_by_type',
  'cases_by_court',
  'cases_by_lawyer',
  'open_cases',
  'closed_cases',
  'delayed_cases',
  'hearings',
  'poa',
  'contracts',
  'tasks',
  'income',
  'expenses',
  'profit',
  'due',
  'payments',
  'lawyer_performance'
] as const

export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const { toast } = useApp()
  const [type, setType] = useState('cases')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<object[]>([])
  const headerKeys = rows[0] ? Object.keys(rows[0]).slice(0, 8) : []
  const colLabel = (k: string) => t(`fields.${k}`, { defaultValue: t(`reports.${k}`, { defaultValue: k }) })
  const cell = (k: string, v: unknown) => (typeof v === 'object' && v !== null ? '' : formatCell(k, v, i18n.language, t))

  const run = () => invoke<object[]>('reports:run', { type, from, to }).then(setRows).catch((e) => toast(e.message, 'err'))
  useEffect(() => {
    run()
  }, [type, from, to])
  const exp = async (format: 'xlsx' | 'csv') => {
    const r = await invoke<{ canceled?: boolean }>('reports:export', { type, from, to }, format)
    if (!r?.canceled) toast(t('savedOk'))
  }
  const print = async () => {
    const keys = rows[0] ? Object.keys(rows[0]) : []
    const body = `<table><thead><tr>${keys.map((k) => `<th>${colLabel(k)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${keys.map((k) => `<td>${cell(k, (r as Record<string, unknown>)[k])}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`
    await invoke('print:print', 'report', t(`reports.${type}`), body)
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('reports.title')} />
      <Card>
        <div className="flex flex-wrap gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`reports.${k}`)}
              </option>
            ))}
          </Select>
          <DatePicker value={from} onChange={setFrom} />
          <DatePicker value={to} onChange={setTo} />
          <Button onClick={run}>{t('reports.show')}</Button>
          <Button variant="outline" onClick={() => exp('xlsx')}>
            Excel
          </Button>
          <Button variant="outline" onClick={() => exp('csv')}>
            CSV
          </Button>
          <Button variant="outline" onClick={() => print().catch((e) => toast(e.message, 'err'))}>
            {t('print')}
          </Button>
        </div>
      </Card>
      <Card>
        <div className="data-table-wrap overflow-x-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {headerKeys.map((k) => (
                      <th key={k} className="px-3 py-2 text-start">
                        {colLabel(k)}
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {headerKeys.map((k) => (
                      <td key={k} className="min-w-0 px-3 py-2 text-start align-middle leading-relaxed text-navy-900 dark:text-white">
                        {cell(k, (r as Record<string, unknown>)[k])}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export function ArchivePage() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [rows, setRows] = useState<{ rows: { id: string; case_number: string; title: string }[] }>({ rows: [] })
  useEffect(() => {
    invoke<typeof rows>('cases:list', { pageSize: 50, archived: 1 }).then(setRows).catch((e) => toast(e.message, 'err'))
  }, [])
  return (
    <div>
      <PageHeader title={t('nav.archive')} />
      <Card>
        {rows.rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between border-b py-2">
            <div>
              {r.case_number} — {r.title}
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await invoke('cases:restore', r.id)
                toast(t('savedOk'))
              }}
            >
              {t('restore')}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function UsersPage() {
  const { t } = useTranslation()
  const { toast, setPage } = useApp()
  const [permOpen, setPermOpen] = useState<{ id: string; username: string; full_name: string } | null>(null)
  const [all, setAll] = useState<{ code: string; name_ar: string }[]>([])
  const [selected, setSelected] = useState<string[]>([])

  const openPerms = async (r: Record<string, unknown>) => {
    const id = String(r.id || '')
    const u = await invoke<{ permissions: string[] }>('users:get', id)
    const cat = await invoke<{ permissions: { code: string; name_ar: string }[] }>('users:permissions')
    setAll(cat.permissions)
    setSelected(u.permissions)
    setPermOpen({ id, username: String(r.username || ''), full_name: String(r.full_name || '') })
  }

  return (
    <div>
      <CrudPage
        title={t('nav.users')}
        listChannel="users:list"
        removeChannel="users:remove"
        extraActions={
          <Button variant="gold" onClick={() => setPage('staffForm', { hideType: true, back: 'users' })}>
            {t('hr.addUser')}
          </Button>
        }
        columns={[
          { key: 'username', label: t('fields.username') },
          { key: 'full_name', label: t('fields.full_name') },
          { key: 'role_name', label: t('fields.role_name') },
          { key: 'is_active', label: t('fields.is_active') },
          { key: 'last_login_at', label: t('fields.last_login_at') }
        ]}
        fields={[]}
        onRowOpen={(r) =>
          setPage('staffForm', {
            userId: r.id,
            employeeId: r.employee_id,
            lawyerId: r.lawyer_id,
            hideType: true,
            back: 'users'
          })
        }
        rowActions={(r) => (
          <Button variant="ghost" onClick={() => openPerms(r).catch((e) => toast((e as Error).message, 'err'))}>
            {t('users.perms')}
          </Button>
        )}
      />
      {permOpen && (
        <Card className="mt-4">
          <h3 className="mb-2 font-bold">
            {t('users.permsFor', { name: permOpen.full_name || permOpen.username, username: permOpen.username })}
          </h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {all.map((p) => (
              <label key={p.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(p.code)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, p.code] : selected.filter((c) => c !== p.code))
                  }
                />
                {p.name_ar}
              </label>
            ))}
          </div>
          <Button
            className="mt-3"
            onClick={async () => {
              await invoke('users:setPermissions', permOpen.id, selected)
              toast(t('savedOk'))
              setPermOpen(null)
            }}
          >
            {t('users.savePerms')}
          </Button>
        </Card>
      )}
    </div>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  return (
    <CrudPage
      title={t('nav.audit')}
      listChannel="audit:list"
      removeChannel="audit:remove"
      deletePerm="audit.delete"
      columns={[
        { key: 'created_at', label: t('fields.created_at') },
        { key: 'username', label: t('fields.username') },
        { key: 'action', label: t('fields.action') },
        { key: 'entity_type', label: t('fields.entity_type') },
        { key: 'description', label: t('fields.description') }
      ]}
      fields={[]}
    />
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { toast, setUser, user } = useApp()
  const [s, setS] = useState<Record<string, string>>({})
  const [pw, setPw] = useState({ current: '', next: '' })
  const [types, setTypes] = useState<{ id: string; name_ar: string }[]>([])
  const [printers, setPrinters] = useState<{ name: string }[]>([])
  const [newType, setNewType] = useState('')
  const [wiping, setWiping] = useState(false)

  useEffect(() => {
    invoke<Record<string, string>>('settings:get').then(setS)
    invoke<{ id: string; name_ar: string }[]>('caseTypes:list').then(setTypes)
    invoke<{ name: string }[]>('print:printers')
      .then(setPrinters)
      .catch(() => setPrinters([]))
  }, [])

  const save = async () => {
    await invoke('settings:set', s)
    i18n.changeLanguage(s.language || 'ar')
    document.documentElement.classList.toggle('dark', s.theme === 'dark')
    document.documentElement.dir = s.language === 'en' ? 'ltr' : 'rtl'
    applyFontSize(Number(s.ui_font_size || 16))
    toast(t('savedOk'))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.settings')}
        actions={
          <Button onClick={() => save().catch((e) => toast(e.message, 'err'))}>{t('save')}</Button>
        }
      />
      <Card>
        <h3 className="mb-3 font-bold">{t('settings.office')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {['office_name', 'office_address', 'office_phone', 'office_email', 'currency'].map((k) => (
            <Field key={k} label={t(`settings.${k}`)}>
              <Input value={s[k] || ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label={t('settings.language')}>
            <Select value={s.language || 'ar'} onChange={(e) => setS({ ...s, language: e.target.value })}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t('settings.theme')}>
            <Select value={s.theme || 'light'} onChange={(e) => setS({ ...s, theme: e.target.value })}>
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
            </Select>
          </Field>
          <Field label={t('settings.logo')}>
            <Button
              variant="outline"
              type="button"
              onClick={async () => {
                const file = await invoke<{ name: string; data: number[] }>('files:pick')
                await invoke('settings:saveLogo', file)
                toast(t('savedOk'))
              }}
            >
              {t('settings.uploadLogo')}
            </Button>
          </Field>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3">{t('settings.appearance')}</h3>
        <Field label={`${t('settings.fontSize')} (${clampFontSize(Number(s.ui_font_size || 16))}px)`}>
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            className="h-2 w-full max-w-md cursor-pointer accent-gold-400"
            value={clampFontSize(Number(s.ui_font_size || 16))}
            onChange={(e) => {
              const ui_font_size = e.target.value
              setS({ ...s, ui_font_size })
              applyFontSize(Number(ui_font_size))
            }}
          />
          <p className="mt-1 text-sm text-navy-500">{t('settings.fontSizeHint')}</p>
        </Field>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">{t('sync.title')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('sync.url')}>
            <Input value={s.supabase_url || ''} readOnly disabled className="opacity-80" />
          </Field>
          <Field label={t('sync.anonKey')}>
            <Input type="password" autoComplete="off" value={s.supabase_anon_key || ''} readOnly disabled className="opacity-80" />
          </Field>
        </div>
        <p className="mt-2 text-sm text-navy-500">{t('sync.hint')}</p>
        <div className="mt-3">
          <Button
            variant="outline"
            type="button"
            onClick={async () => {
              await invoke('settings:set', s)
              const snap = await invoke<SyncSnapshot>('sync:now')
              if (snap.status === 'synced') toast(t('sync.doneOk'))
              else if (snap.error) toast(snap.error, 'err')
              else toast(t('sync.stillPending', { count: snap.pendingCount }))
            }}
          >
            {t('sync.now')}
          </Button>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">{t('settings.printing')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.a4Printer')}>
            <Select value={s.print_a4_printer || ''} onChange={(e) => setS({ ...s, print_a4_printer: e.target.value })}>
              <option value="">{t('settings.defaultPrinter')}</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.thermalPrinter')}>
            <Select
              value={s.print_thermal_printer || ''}
              onChange={(e) => setS({ ...s, print_thermal_printer: e.target.value })}
            >
              <option value="">{t('settings.defaultPrinter')}</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.silentPrint')}>
            <Select value={s.silent_print || 'false'} onChange={(e) => setS({ ...s, silent_print: e.target.value })}>
              <option value="false">{t('status.no')}</option>
              <option value="true">{t('status.yes')}</option>
            </Select>
          </Field>
          <Field label={t('settings.checkUpdates')}>
            <Select value={s.auto_update || 'true'} onChange={(e) => setS({ ...s, auto_update: e.target.value })}>
              <option value="true">{t('status.yes')}</option>
              <option value="false">{t('status.no')}</option>
            </Select>
          </Field>
          <Field label={t('settings.updateFeedUrl')}>
            <Input
              value={s.update_feed_url || ''}
              onChange={(e) => setS({ ...s, update_feed_url: e.target.value })}
              placeholder=""
            />
          </Field>
          <p className="text-sm text-navy-500 md:col-span-2">{t('settings.updateFeedHint')}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const r = await invoke<{ none?: boolean; error?: string }>('updater:check')
              if (r?.error) toast(r.error, 'err')
              else if (r?.none) toast(t('settings.noUpdates'))
              else toast(t('settings.checkUpdates'))
            }}
          >
            {t('settings.checkUpdates')}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const r = await invoke<{ file: string }>('backup:create')
              toast(r.file)
            }}
          >
            {t('settings.backupNow')}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const r = await invoke<{ deleted: number }>('files:gc')
              toast(String(r.deleted))
            }}
          >
            {t('settings.gc')}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await invoke('demo:seed')
              toast(t('savedOk'))
            }}
          >
            {t('settings.demo')}
          </Button>
          <Button
            variant="gold"
            onClick={async () => {
              const r = await invoke<{ canceled?: boolean }>('print:manual')
              if (!r?.canceled) toast(t('savedOk'))
            }}
          >
            {t('settings.downloadManual')}
          </Button>
          <Button
            variant="danger"
            disabled={wiping}
            onClick={async () => {
              if (!confirm(t('settings.wipeConfirm'))) return
              setWiping(true)
              try {
                await wipeAllBusinessData()
                toast(t('settings.wiped'))
              } catch (e) {
                toast((e as Error).message, 'err')
              } finally {
                setWiping(false)
              }
            }}
          >
            {wiping ? t('loading') : t('settings.wipeData')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-navy-500">{t('settings.wipeDataHint')}</p>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">{t('settings.caseTypes')}</h3>
        <div className="flex gap-2">
          <Input value={newType} onChange={(e) => setNewType(e.target.value)} />
          <Button
            onClick={async () => {
              await invoke('caseTypes:create', newType)
              setTypes(await invoke('caseTypes:list'))
              setNewType('')
            }}
          >
            {t('add')}
          </Button>
        </div>
        <ul className="mt-2 columns-2 text-sm">
          {types.map((x) => (
            <li key={x.id}>{x.name_ar}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 font-bold">{t('settings.password')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('currentPassword')}>
            <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label={t('newPassword')}>
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
        </div>
        <Button
          className="mt-2"
          onClick={async () => {
            await invoke('auth:changePassword', pw.current, pw.next)
            toast(t('savedOk'))
          }}
        >
          {t('changePassword')}
        </Button>
        <Button
          className="mt-2 mr-2"
          variant="danger"
          onClick={async () => {
            await invoke('auth:logout')
            setUser(null)
          }}
        >
          {t('logout')} ({user?.username})
        </Button>
      </Card>
      <BackupRestore />
    </div>
  )
}

function BackupRestore() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [list, setList] = useState<{ name: string; path: string; mtime: string }[]>([])
  useEffect(() => {
    invoke<typeof list>('backup:list')
      .then(setList)
      .catch(() => undefined)
  }, [])
  return (
    <Card>
      <h3 className="mb-3 font-bold">{t('settings.backup')}</h3>
      {list.map((b) => (
        <div key={b.path} className="flex items-center justify-between border-b py-2 text-sm">
          <span>
            {b.name} — {b.mtime.slice(0, 16)}
          </span>
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm(t('settings.restoreConfirm'))) return
              await invoke('backup:restore', b.path)
              toast(t('settings.restored'))
            }}
          >
            {t('restore')}
          </Button>
        </div>
      ))}
    </Card>
  )
}
