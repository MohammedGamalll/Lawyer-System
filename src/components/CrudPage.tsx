import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { invoke } from '../lib/api'
import { ApiError } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Select, Textarea, Modal, PageHeader, StatusBadge, ConfirmBar, RowMenu } from './ui'
import { DatePicker, DateTimePicker, TimePicker } from './DateTimePicker'
import { EntitySelect } from './EntitySelect'
import { LookupCombo } from './LookupCombo'
import { formatCell } from '../lib/datetime'
import { formatProgramCode } from '../lib/courtNumber'
import type { LookupKind } from '../lib/lookups'
import { emailSchema, msg, nationalIdSchema, phoneSchema } from '@shared/schemas'
import { TableVirtuoso } from 'react-virtuoso'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { getListCache, listCacheKey, setListCache } from '../lib/listCache'
import { SimilarClientModal } from './SimilarClientModal'
import { defaultWidthCh } from '../lib/fieldWidth'
import { hydrateCaseForm } from '../lib/caseForm'
import { onDataChanged } from '../lib/bus'

export type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'date' | 'time' | 'number' | 'password' | 'datetime-local' | 'combo'
  required?: boolean
  options?: { value: string | number; label: string }[]
  comboKind?: string
  quickAdd?: boolean
  lookup?:
    | 'clients'
    | 'cases'
    | 'lawyers'
    | 'users'
    | 'cashboxes'
    | 'caseTypes'
    | 'expenseCategories'
    | 'roles'
    | 'opponents'
    | 'employees'
    | 'hearings'
    | 'contracts'
  size?: 'sm' | 'xs'
  widthCh?: number
}

export function schemaFromFields(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    if (f.name === 'national_id') shape[f.name] = nationalIdSchema
    else if (f.name === 'phone' || f.name === 'phone2' || f.name === 'whatsapp' || f.name === 'phone_home' || f.name === 'phone_work') shape[f.name] = phoneSchema
    else if (f.name === 'email') shape[f.name] = emailSchema
    else if (f.required && f.type === 'number') shape[f.name] = z.coerce.number({ required_error: msg.required, invalid_type_error: msg.required })
    else if (f.required) shape[f.name] = z.string({ required_error: msg.required }).min(1, msg.required)
    else shape[f.name] = z.any().optional()
  }
  return z.object(shape).passthrough()
}

export function FormFields({
  fields,
  values,
  onChange,
  errors,
  register,
  extra,
  extraAfter,
  compact
}: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors?: Record<string, string>
  register?: (name: string) => Record<string, unknown>
  extra?: React.ReactNode
  extraAfter?: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'flex flex-wrap items-start gap-x-2 gap-y-1' : 'flex flex-wrap items-start gap-x-3 gap-y-2'}>
      {fields.map((f) => {
        const opts = f.options
        const val = (values[f.name] as string | number | undefined) ?? ''
        const full = f.type === 'textarea'
        const ch = defaultWidthCh({ type: f.type, size: f.size, widthCh: f.widthCh, lookup: f.lookup, name: f.name })
        const err = errors?.[f.name]
        const reg = (register ? register(f.name) : {}) as {
          onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
        }
        return (
          <React.Fragment key={f.name}>
          <div className={full ? 'w-full basis-full' : 'max-w-full'} style={full ? undefined : { width: `${ch}ch` }}>
            <Field label={f.label} required={f.required} error={err}>
              {f.type === 'textarea' ? (
                <Textarea {...reg} value={String(val)} onChange={(e) => { reg.onChange?.(e); onChange(f.name, e.target.value) }} />
              ) : f.lookup ? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <EntitySelect
                      kind={f.lookup as LookupKind}
                      value={val}
                      clientId={f.lookup === 'cases' ? (values.client_id as string | number | undefined) : undefined}
                      onChange={(v) => onChange(f.name, v === '' ? '' : v)}
                    />
                  </div>
                  {f.quickAdd ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 shrink-0 px-0 text-lg"
                      title="+"
                      onClick={() => onChange('__quick_client', !values.__quick_client)}
                    >
                      +
                    </Button>
                  ) : null}
                </div>
              ) : f.type === 'combo' && f.comboKind ? (
                <LookupCombo kind={f.comboKind} value={String(val)} onChange={(v) => onChange(f.name, v)} />
              ) : f.type === 'select' ? (
                <Select {...reg} value={String(val)} onChange={(e) => { reg.onChange?.(e); onChange(f.name, e.target.value) }}>
                  <option value="">—</option>
                  {(opts ?? []).map((o) => (
                    <option key={String(o.value)} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'date' ? (
                <DatePicker value={String(val || '')} onChange={(iso) => onChange(f.name, iso)} />
              ) : f.type === 'time' ? (
                <TimePicker value={String(val || '')} onChange={(hhmm) => onChange(f.name, hhmm)} />
              ) : f.type === 'datetime-local' ? (
                <DateTimePicker value={String(val || '')} onChange={(iso) => onChange(f.name, iso)} />
              ) : (
                <Input
                  type={f.type || 'text'}
                  autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                  {...reg}
                  value={String(val)}
                    onChange={(e) => {
                      reg.onChange?.(e)
                      onChange(f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)
                    }}
                />
              )}
            </Field>
          </div>
          {extraAfter === f.name && extra ? <div className="w-full basis-full">{extra}</div> : null}
          </React.Fragment>
        )
      })}
      {!extraAfter && extra ? <div className="w-full basis-full">{extra}</div> : null}
    </div>
  )
}

export type Column = {
  key: string
  label: string
  status?: boolean
  money?: boolean
  render?: (row: Record<string, unknown>) => React.ReactNode
  onCellClick?: (row: Record<string, unknown>) => void
}

export function CrudPage({
  title,
  listChannel,
  createChannel,
  updateChannel,
  removeChannel,
  createPerm,
  updatePerm,
  deletePerm,
  columns,
  fields,
  schema,
  createSchema,
  updateSchema,
  extraFilters,
  listFilters,
  onRowOpen,
  extraActions,
  rowActions,
  formExtra,
  formExtraAfter,
  formPrefix,
  formBody,
  afterSave,
  onEditRow,
  defaults,
  idleUntilSearch,
  hideQuickSearch,
  emptyHint,
  compactForm,
  onRowsLoaded,
  pageSize: pageSizeProp,
  embedded
}: {
  title: string
  listChannel: string
  createChannel?: string
  updateChannel?: string
  removeChannel?: string
  createPerm?: string
  updatePerm?: string
  deletePerm?: string
  columns: Column[]
  fields: FieldDef[]
  schema?: z.ZodTypeAny
  createSchema?: z.ZodTypeAny
  updateSchema?: z.ZodTypeAny
  extraFilters?: React.ReactNode
  listFilters?: Record<string, unknown>
  onRowOpen?: (row: Record<string, unknown>) => void
  extraActions?: React.ReactNode
  rowActions?: (row: Record<string, unknown>, reload: () => Promise<void>) => React.ReactNode
  formExtra?: (form: Record<string, unknown>, setField: (name: string, value: unknown) => void) => React.ReactNode
  formExtraAfter?: string
  formPrefix?: (form: Record<string, unknown>, setField: (name: string, value: unknown) => void) => React.ReactNode
  formBody?: (
    form: Record<string, unknown>,
    setField: (name: string, value: unknown) => void,
    errors: Record<string, string>
  ) => React.ReactNode
  afterSave?: (info: { created: boolean; result: unknown; form: Record<string, unknown> }) => void | Promise<void>
  onEditRow?: (row: Record<string, unknown>) => void
  defaults?: Record<string, unknown>
  idleUntilSearch?: boolean
  hideQuickSearch?: boolean
  emptyHint?: string
  compactForm?: boolean
  onRowsLoaded?: (rows: Record<string, unknown>[], total: number) => void
  pageSize?: number
  embedded?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { toast, can, pageMeta, page: appPage, setPage: setAppPage } = useApp()
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 300)
  const [page, setPage] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number; pageSize: number }>({ rows: [], total: 0, pageSize: 20 })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [del, setDel] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [similar, setSimilar] = useState<{ id: string; client_number: string; full_name: string } | null>(null)
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const zodSchema = (editing ? updateSchema : createSchema) ?? schema ?? schemaFromFields(fields)
  const rhf = useForm<Record<string, unknown>>({ resolver: zodResolver(zodSchema as never), values: form, mode: 'onChange' })

  const hasListFilter = Object.values(listFilters || {}).some((v) => String(v ?? '').trim())
  const listPageSize = Math.min(pageSizeProp || 50, 100)
  const queryPayload = {
    page,
    pageSize: listPageSize,
    search: debouncedQ,
    filters: listFilters || {},
    sortBy: sortKey || undefined,
    sortDir
  }

  const load = async () => {
    if (idleUntilSearch && !debouncedQ.trim() && !hasListFilter) {
      setData({ rows: [], total: 0, pageSize: listPageSize })
      return
    }
    const key = listCacheKey(listChannel, queryPayload)
    const cached = getListCache<{ rows: Record<string, unknown>[]; total: number; pageSize: number }>(key)
    if (cached) {
      setData(cached)
      onRowsLoaded?.(cached.rows, cached.total)
    }
    const res = await invoke<{ rows: Record<string, unknown>[]; total: number; pageSize: number }>(listChannel, queryPayload)
    setListCache(key, res)
    setData(res)
    onRowsLoaded?.(res.rows, res.total)
  }

  const printList = async () => {
    setPrinting(true)
    try {
      const res = await invoke<{ rows: Record<string, unknown>[]; total: number }> (listChannel, {
        page: 1,
        pageSize: 500,
        print: true,
        search: debouncedQ,
        filters: listFilters || {},
        sortBy: sortKey || undefined,
        sortDir
      })
      const rows = res.rows || []
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('')
      const bodyRows = rows
        .map(
          (r) =>
            `<tr>${columns
              .map((c) => `<td>${esc(formatCell(c.key, r[c.key], i18n.language, t) || String(r[c.key] ?? ''))}</td>`)
              .join('')}</tr>`
        )
        .join('')
      const body = `<h2>${esc(title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${bodyRows || `<tr><td>${t('noData')}</td></tr>`}</tbody></table>`
      await invoke('print:print', 'report', title, body)
      if ((res.total || 0) > rows.length) toast(t('printListCapped', { count: rows.length }))
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setPrinting(false)
    }
  }

  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [page, debouncedQ, listChannel, JSON.stringify(listFilters), sortKey, sortDir, idleUntilSearch])

  useEffect(() => onDataChanged(() => {
    load().catch(() => undefined)
  }), [listChannel, page, debouncedQ, JSON.stringify(listFilters), sortKey, sortDir])

  useEffect(() => {
    if (!pageMeta.edit_id) return
    const editId = String(pageMeta.edit_id)
    const fromList = data.rows.find((r) => String(r.id) === editId)
    const rest = { ...pageMeta }
    delete rest.edit_id
    setAppPage(appPage, rest, { replace: true })
    if (fromList) {
      startEdit(fromList)
      return
    }
    const getChannel = listChannel.replace(/:list$/, ':get')
    invoke<Record<string, unknown>>(getChannel, editId)
      .then((row) => startEdit(row))
      .catch((e) => toast((e as Error).message, 'err'))
  }, [pageMeta.edit_id])

  useEffect(() => {
    if (!pageMeta.create) return
    const prefill: Record<string, unknown> = {}
    if (pageMeta.case_id) prefill.case_id = pageMeta.case_id
    if (pageMeta.client_id) prefill.client_id = pageMeta.client_id
    if (pageMeta.work_kind) prefill.work_kind = pageMeta.work_kind
    if (pageMeta.prefill && typeof pageMeta.prefill === 'object') Object.assign(prefill, pageMeta.prefill)
    startCreate(prefill)
    const rest = { ...pageMeta }
    delete rest.create
    setAppPage(appPage, rest, { replace: true })
  }, [pageMeta.create])

  const startCreate = (prefill: Record<string, unknown> = {}) => {
    setEditing(null)
    const next = { ...(defaults || {}), ...prefill }
    setForm(next)
    rhf.reset(next)
    setOpen(true)
  }
  const startEdit = (row: Record<string, unknown>) => {
    void (async () => {
    setEditing(row)
    let next: Record<string, unknown> = { ...row, password: '' }
    delete next.password_hash
    if (listChannel === 'clients:list' && row.id) {
      try {
        const full = await invoke<Record<string, unknown>>('clients:get', row.id)
        next = { ...next, ...full }
        if (next.address2) next.__show_address2 = true
      } catch {
        /* keep list row */
      }
    }
    if (listChannel === 'cases:list' && row.id) {
      try {
        const full = await invoke<Record<string, unknown>>('cases:get', row.id)
        next = hydrateCaseForm(next, full)
      } catch {
        /* keep list row */
      }
    }
    if (!next.office_case_number && typeof next.case_number === 'string') {
      const m = String(next.case_number).match(/^(.*)\/(\d{2,4})$/)
      if (m && !String(next.case_number).startsWith('CS-')) {
        next.office_case_number = m[1]
        if (!next.case_year) next.case_year = m[2]
      }
    }
    setForm(next)
    rhf.reset(next)
    setOpen(true)
    })()
  }
  const save = rhf.handleSubmit(async (values) => {
    setSaving(true)
    const payload: Record<string, unknown> = { ...form, ...(values as Record<string, unknown>) }
    let result: unknown
    try {
      const pwd = String(payload.password ?? form.password ?? '').trim()
      if (pwd) payload.password = pwd
      else delete payload.password
      for (const k of Object.keys(payload)) {
        if (k.startsWith('__')) delete payload[k]
      }
      if (!editing && createChannel === 'users:create' && !payload.password) {
        toast(t('users.passwordRequired'), 'err')
        setSaving(false)
        return
      }
      if (editing && updateChannel) result = await invoke(updateChannel, editing.id, payload)
      else if (createChannel) result = await invoke(createChannel, payload)
      await afterSave?.({ created: !editing, result, form })
      const extra = result as { followUp?: string; autoHearing?: boolean; autoTasks?: number } | undefined
      if (extra?.autoHearing) toast(t('hearings.autoCreated'))
      if (extra?.autoTasks) toast(t('hearings.autoTasks', { count: extra.autoTasks }))
      if (extra?.followUp) toast(extra.followUp)
      toast(t('savedOk'))
      setOpen(false)
      setSimilar(null)
      setPendingPayload(null)
      await load()
    } catch (e) {
      const err = e as ApiError
      if (err.fieldErrors?._similar) {
        try {
          setSimilar(JSON.parse(err.fieldErrors._similar))
          setPendingPayload(payload)
        } catch {
          toast(err.message, 'err')
        }
        return
      }
      toast(err.message, 'err')
      if (err.fieldErrors) {
        for (const [k, v] of Object.entries(err.fieldErrors)) {
          rhf.setError(k as never, { message: v })
        }
      }
    } finally {
      setSaving(false)
    }
  })
  const doDelete = async () => {
    if (!del || !removeChannel) return
    try {
      await invoke(removeChannel, del.id)
      toast(t('deletedOk'))
      setDel(null)
      await load()
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / (data.pageSize || 20)))
  const fieldErrors: Record<string, string> = {}
  for (const [k, v] of Object.entries(rhf.formState.errors)) {
    const msgText = (v as { message?: string })?.message
    if (msgText) fieldErrors[k] = msgText
  }

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') setSortDir('desc')
    else {
      setSortKey(null)
      setSortDir('asc')
    }
  }

  const displayRows = useMemo(() => {
    let rows = [...data.rows]
    for (const [k, v] of Object.entries(colFilters)) {
      const s = v.trim().toLowerCase()
      if (!s) continue
      rows = rows.filter((r) => formatCell(k, r[k], i18n.language, t).toLowerCase().includes(s) || String(r[k] ?? '').toLowerCase().includes(s))
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const an = Number(av)
        const bn = Number(bv)
        let cmp = 0
        if (av == null && bv == null) cmp = 0
        else if (av == null) cmp = 1
        else if (bv == null) cmp = -1
        else if (!Number.isNaN(an) && !Number.isNaN(bn) && String(av) !== '' && String(bv) !== '') cmp = an - bn
        else cmp = String(av).localeCompare(String(bv), i18n.language === 'en' ? 'en' : 'ar', { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [data.rows, colFilters, sortKey, sortDir, i18n.language, t])

  const rowCells = (row: Record<string, unknown>) => (
    <>
      {columns.map((c) => (
        <td
          key={c.key}
          className={`whitespace-nowrap px-3 py-2 text-start align-middle leading-relaxed text-navy-900 dark:text-white ${c.onCellClick ? 'cursor-pointer underline decoration-navy-300' : ''}`}
          onClick={(e) => {
            if (!c.onCellClick) return
            e.stopPropagation()
            c.onCellClick(row)
          }}
        >
          {c.render ? (
            c.render(row)
          ) : c.status ? (
            <StatusBadge value={String(row[c.key] ?? '')} />
          ) : c.money ? (
            Number(row[c.key] ?? 0).toLocaleString(i18n.language === 'en' ? 'en-EG' : 'ar-EG')
          ) : (
            formatCell(c.key, row[c.key], i18n.language, t)
          )}
        </td>
      ))}
      <td className="w-12 px-1 py-2 text-center align-middle" data-no-row onClick={(e) => e.stopPropagation()}>
        <RowMenu
          items={[
            ...(onRowOpen ? [{ label: t('details'), onClick: () => onRowOpen(row) }] : []),
            ...(onEditRow || (updateChannel && (!updatePerm || can(updatePerm)))
              ? [{ label: t('edit'), onClick: () => (onEditRow ? onEditRow(row) : startEdit(row)) }]
              : []),
            ...(removeChannel && (!deletePerm || can(deletePerm))
              ? [{ label: t('delete'), onClick: () => setDel(row), danger: true }]
              : [])
          ]}
          extra={rowActions?.(row, load)}
        />
      </td>
    </>
  )

  const headerRows = (
    <>
      <tr>
        {columns.map((c) => (
          <th key={c.key} className="whitespace-nowrap px-3 py-2 text-start font-semibold">
            <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(c.key)}>
              {c.label}
              <span className="text-[10px] opacity-80">
                {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
              </span>
            </button>
          </th>
        ))}
        <th className="w-12 px-2 py-2 text-center">{t('actions')}</th>
      </tr>
      <tr className="bg-navy-700">
        {columns.map((c) => (
          <th key={c.key} className="px-2 py-1.5">
            <input
              className="h-7 w-full rounded border-0 bg-white/95 px-2 text-xs font-normal text-navy-900 outline-none dark:bg-navy-800 dark:text-white"
              placeholder={t('filter')}
              value={colFilters[c.key] || ''}
              onChange={(e) => setColFilters((prev) => ({ ...prev, [c.key]: e.target.value }))}
            />
          </th>
        ))}
        <th />
      </tr>
    </>
  )

  const onRowClick = (e: React.MouseEvent, row: Record<string, unknown>) => {
    const el = e.target as HTMLElement
    if (el.closest('button, a, input, textarea, select, [data-no-row]')) return
    if (onRowOpen) onRowOpen(row)
    else if (updateChannel && (!updatePerm || can(updatePerm))) startEdit(row)
    else if (onEditRow) onEditRow(row)
  }

  return (
    <div>
      {embedded ? (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          {extraActions}
          <Button type="button" variant="outline" disabled={printing} onClick={() => printList()}>
            {t('print')}
          </Button>
          {createChannel && (!createPerm || can(createPerm)) && (
            <Button variant="gold" onClick={() => startCreate()}>
              {t('add')}
            </Button>
          )}
        </div>
      ) : (
        <PageHeader
          title={title}
          actions={
            <>
              {extraActions}
              <Button type="button" variant="outline" disabled={printing} onClick={() => printList()}>
                {t('print')}
              </Button>
              {createChannel && (!createPerm || can(createPerm)) && (
                <Button variant="gold" onClick={() => startCreate()}>
                  {t('add')}
                </Button>
              )}
            </>
          }
        />
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        {!hideQuickSearch ? (
          <Input placeholder={t('search')} value={q} onChange={(e) => { setPage(1); setQ(e.target.value) }} className="max-w-sm" />
        ) : null}
        {extraFilters}
      </div>
      <div className="data-table-wrap overflow-y-auto overflow-x-auto rounded-xl border border-navy-100 bg-white dark:bg-navy-900 dark:border-navy-800">
        {displayRows.length > 50 ? (
          <TableVirtuoso
            style={{ height: 520 }}
            data={displayRows}
            className="border-collapse text-sm"
            fixedHeaderContent={() => headerRows}
            itemContent={(_i, row) => rowCells(row)}
            components={{
              Table: (props) => <table {...props} className="border-collapse text-sm" />,
              TableRow: (props) => {
                const row = displayRows[props['data-index'] as number]
                return (
                  <tr
                    {...props}
                    className="cursor-pointer border-t border-navy-50 hover:bg-navy-50/60 dark:border-navy-800 dark:hover:bg-navy-800/60"
                    onClick={(e) => row && onRowClick(e, row)}
                  />
                )
              },
              TableHead: (props) => <thead {...props} className="bg-navy-800 text-white" />
            }}
          />
        ) : (
        <table className="border-collapse text-sm">
          <thead className="bg-navy-800 text-white">{headerRows}</thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-navy-400">
                  {idleUntilSearch && !q.trim() && !hasListFilter ? emptyHint || t('cases.searchFirst') : t('noData')}
                </td>
              </tr>
            )}
            {displayRows.map((row) => (
              <tr
                key={String(row.id)}
                className="cursor-pointer border-t border-navy-50 hover:bg-navy-50/60 dark:border-navy-800 dark:hover:bg-navy-800/60"
                onClick={(e) => onRowClick(e, row)}
              >
                {rowCells(row)}
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-navy-600 dark:text-navy-200">
        <span>
          {t('page')} {page} {t('of')} {pages} — {data.total}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('prev')}
          </Button>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t('next')}
          </Button>
        </div>
      </div>

      <Modal open={open} title={editing ? t('edit') : t('add')} onClose={() => setOpen(false)} wide>
        <form onSubmit={save}>
          {listChannel === 'cases:list' ? (
            <div className="mb-3 text-center text-4xl font-black text-red-600">
              {editing ? formatProgramCode(editing) : '0'}
            </div>
          ) : null}
          {formPrefix?.(form, (n, v) => {
            setForm((prev) => ({ ...prev, [n]: v }))
            rhf.setValue(n as never, v as never, { shouldValidate: true })
          })}
          {formBody ? (
            formBody(
              form,
              (n, v) => {
                setForm((prev) => ({ ...prev, [n]: v }))
                rhf.setValue(n as never, v as never, { shouldValidate: true })
              },
              fieldErrors
            )
          ) : (
          <FormFields
            fields={fields}
            values={form}
            errors={fieldErrors}
            register={rhf.register as never}
            compact={compactForm}
            extraAfter={formExtraAfter}
            extra={formExtra?.(form, (n, v) => {
              setForm((prev) => ({ ...prev, [n]: v }))
              rhf.setValue(n as never, v as never, { shouldValidate: true })
            })}
            onChange={(n, v) => {
              setForm((prev) => ({ ...prev, [n]: v }))
              rhf.setValue(n as never, v as never, { shouldValidate: true })
            }}
          />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !rhf.formState.isValid}>
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!del} title={t('delete')} onClose={() => setDel(null)}>
        <p>{t('confirmDelete')}</p>
        <ConfirmBar onCancel={() => setDel(null)} onConfirm={doDelete} />
      </Modal>
      <SimilarClientModal
        open={!!similar}
        name={similar?.full_name}
        code={similar?.client_number}
        saving={saving}
        onClose={() => setSimilar(null)}
        onOpenExisting={() => {
          if (similar) useApp.getState().setPage('clientProfile', { id: similar.id })
          setSimilar(null)
          setOpen(false)
        }}
        onAddAsNew={async () => {
          if (!pendingPayload || !createChannel) return
          setSaving(true)
          try {
            if (editing && updateChannel) await invoke(updateChannel, editing.id, { ...pendingPayload, force_similar: true })
            else await invoke(createChannel, { ...pendingPayload, force_similar: true })
            toast(t('savedOk'))
            setSimilar(null)
            setPendingPayload(null)
            setOpen(false)
            await load()
          } catch (e) {
            const err = e as ApiError
            if (err.fieldErrors?._similar) return
            toast(err.message, 'err')
          } finally {
            setSaving(false)
          }
        }}
      />
    </div>
  )
}
