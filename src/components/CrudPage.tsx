import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { invoke } from '../lib/api'
import { ApiError } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Select, Textarea, Modal, PageHeader, StatusBadge, ConfirmBar } from './ui'
import { DatePicker, DateTimePicker, TimePicker } from './DateTimePicker'
import { EntitySelect } from './EntitySelect'
import { formatCell } from '../lib/datetime'
import type { LookupKind } from '../lib/lookups'
import { emailSchema, msg, nationalIdSchema, phoneSchema } from '@shared/schemas'
import { onDataChanged } from '../lib/bus'

export type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'date' | 'time' | 'number' | 'password' | 'datetime-local'
  required?: boolean
  options?: { value: string | number; label: string }[]
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
}

export function schemaFromFields(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    if (f.name === 'national_id') shape[f.name] = nationalIdSchema
    else if (f.name === 'phone' || f.name === 'phone2' || f.name === 'whatsapp') shape[f.name] = phoneSchema
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
  register
}: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors?: Record<string, string>
  register?: (name: string) => Record<string, unknown>
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {fields.map((f) => {
        const opts = f.options
        const val = (values[f.name] as string | number | undefined) ?? ''
        const span = f.type === 'textarea' ? 'md:col-span-2' : ''
        const err = errors?.[f.name]
        const reg = (register ? register(f.name) : {}) as {
          onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
        }
        return (
          <div key={f.name} className={span}>
            <Field label={f.label} required={f.required} error={err}>
              {f.type === 'textarea' ? (
                <Textarea {...reg} value={String(val)} onChange={(e) => { reg.onChange?.(e); onChange(f.name, e.target.value) }} />
              ) : f.lookup ? (
                <EntitySelect
                  kind={f.lookup as LookupKind}
                  value={val}
                  clientId={f.lookup === 'cases' ? (values.client_id as string | number | undefined) : undefined}
                  onChange={(v) => onChange(f.name, v === '' ? '' : Number(v))}
                />
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
        )
      })}
    </div>
  )
}

export type Column = { key: string; label: string; status?: boolean; money?: boolean }

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
  formExtra
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
}) {
  const { t, i18n } = useTranslation()
  const { toast, can } = useApp()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number; pageSize: number }>({ rows: [], total: 0, pageSize: 20 })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [del, setDel] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const zodSchema = (editing ? updateSchema : createSchema) ?? schema ?? schemaFromFields(fields)
  const rhf = useForm<Record<string, unknown>>({ resolver: zodResolver(zodSchema as never), values: form, mode: 'onChange' })

  const hasColFilter = Object.values(colFilters).some((v) => v.trim())
  const load = async () => {
    const res = await invoke<{ rows: Record<string, unknown>[]; total: number; pageSize: number }>(listChannel, {
      page: hasColFilter || sortKey ? 1 : page,
      pageSize: hasColFilter || sortKey ? 400 : 20,
      search: q,
      filters: listFilters || {},
      sortBy: sortKey || undefined,
      sortDir
    })
    setData(res)
  }

  useEffect(() => {
    load().catch((e) => toast(e.message, 'err'))
  }, [page, q, listChannel, JSON.stringify(listFilters), hasColFilter, sortKey, sortDir])

  useEffect(() => onDataChanged(() => {
    load().catch(() => undefined)
  }), [listChannel, page, q, JSON.stringify(listFilters)])

  const startCreate = () => {
    setEditing(null)
    setForm({})
    rhf.reset({})
    setOpen(true)
  }
  const startEdit = (row: Record<string, unknown>) => {
    setEditing(row)
    const next: Record<string, unknown> = { ...row, password: '' }
    delete next.password_hash
    setForm(next)
    rhf.reset(next)
    setOpen(true)
  }
  const save = rhf.handleSubmit(async (values) => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form, ...(values as Record<string, unknown>) }
      const pwd = String(payload.password ?? form.password ?? '').trim()
      if (pwd) payload.password = pwd
      else delete payload.password
      if (!editing && createChannel === 'users:create' && !payload.password) {
        toast(t('users.passwordRequired'), 'err')
        setSaving(false)
        return
      }
      if (editing && updateChannel) await invoke(updateChannel, editing.id, payload)
      else if (createChannel) await invoke(createChannel, payload)
      toast(t('savedOk'))
      setOpen(false)
      await load()
    } catch (e) {
      const err = e as ApiError
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

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          <>
            {extraActions}
            {createChannel && (!createPerm || can(createPerm)) && (
              <Button variant="gold" onClick={startCreate}>
                {t('add')}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder={t('search')} value={q} onChange={(e) => { setPage(1); setQ(e.target.value) }} className="max-w-sm" />
        {extraFilters}
      </div>
      <div className="overflow-auto rounded-xl border border-navy-100 bg-white dark:bg-navy-900 dark:border-navy-800">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead className="bg-navy-800 text-white">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-start font-semibold">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="text-[10px] opacity-80">
                      {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
              ))}
              <th className="w-44 px-3 py-2 text-start">{t('actions')}</th>
            </tr>
            <tr className="bg-navy-700">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5">
                  <input
                    className="h-7 w-full rounded border-0 bg-white/95 px-2 text-xs font-normal text-navy-900 outline-none"
                    placeholder={t('filter')}
                    value={colFilters[c.key] || ''}
                    onChange={(e) => setColFilters((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  />
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-navy-400">
                  {t('noData')}
                </td>
              </tr>
            )}
            {displayRows.map((row) => (
              <tr key={String(row.id)} className="border-t border-navy-50 hover:bg-navy-50/60 dark:border-navy-800">
                {columns.map((c) => (
                  <td key={c.key} className="min-w-0 overflow-hidden px-3 py-2 text-start align-middle">
                    {c.status ? (
                      <StatusBadge value={String(row[c.key] ?? '')} />
                    ) : c.money ? (
                      Number(row[c.key] ?? 0).toLocaleString(i18n.language === 'en' ? 'en-EG' : 'ar-EG')
                    ) : (
                      formatCell(c.key, row[c.key], i18n.language, t)
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">
                  {onRowOpen && (
                    <Button variant="ghost" onClick={() => onRowOpen(row)}>
                      {t('details')}
                    </Button>
                  )}
                  {updateChannel && (!updatePerm || can(updatePerm)) && (
                    <Button variant="ghost" onClick={() => startEdit(row)}>
                      {t('edit')}
                    </Button>
                  )}
                  {removeChannel && (!deletePerm || can(deletePerm)) && (
                    <Button variant="ghost" onClick={() => setDel(row)}>
                      {t('delete')}
                    </Button>
                  )}
                  {rowActions?.(row, load)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-navy-600">
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
          <FormFields
            fields={fields}
            values={form}
            errors={fieldErrors}
            register={rhf.register as never}
            onChange={(n, v) => {
              setForm((prev) => ({ ...prev, [n]: v }))
              rhf.setValue(n as never, v as never, { shouldValidate: true })
            }}
          />
          {formExtra?.(form, (n, v) => {
            setForm((prev) => ({ ...prev, [n]: v }))
            rhf.setValue(n as never, v as never, { shouldValidate: true })
          })}
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
    </div>
  )
}
