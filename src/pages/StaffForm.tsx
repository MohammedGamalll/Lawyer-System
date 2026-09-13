import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { staffSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Input, MiniTable, PageHeader, Select, Textarea, UiTabs } from '../components/ui'
import { DatePicker, TimePicker } from '../components/DateTimePicker'
import { toIsoDate } from '../lib/datetime'
import { AttachDocumentControl, uploadPendingDocs, type PendingDoc } from '../components/DocumentTools'

type Role = { id: string; code: string; name_ar: string; name_en?: string }

const JOB_DEFAULTS: Record<string, string> = {
  lawyer: 'محامٍ',
  accountant: 'محاسب',
  legal_assistant: 'مساعد محامٍ',
  secretary: 'موظف إداري',
  admin: 'مدير',
  custom: 'موظف'
}

const emptyForm = (): Record<string, unknown> => ({
  status: 'active',
  is_active: 1,
  full_name: '',
  phone: '',
  email: '',
  hire_date: '',
  notes: '',
  job_title: '',
  department: '',
  salary: '',
  license_no: '',
  qualification: '',
  bar_number: '',
  bar_degree: '',
  duties: '',
  specialization: '',
  whatsapp: '',
  phone_home: '',
  phone_other: '',
  address: '',
  rating: '',
  username: '',
  password: '',
  role_id: '',
  employee_id: '',
  user_id: '',
  lawyer_id: ''
})

export function StaffFormPage() {
  const { t, i18n } = useTranslation()
  const page = useApp((s) => s.page)
  const pageMeta = useApp((s) => s.pageMeta)
  const setPage = useApp((s) => s.setPage)
  const toast = useApp((s) => s.toast)
  const can = useApp((s) => s.can)
  const canEdit = can('users.manage') || can('employees.manage')

  const lockRole = String(pageMeta.lockRole || (page === 'lawyerProfile' ? 'lawyer' : ''))
  const back = String(pageMeta.back || (page === 'lawyerProfile' ? 'lawyers' : page === 'users' ? 'users' : 'employees'))
  const employeeId = String(pageMeta.employeeId || (page === 'employeeProfile' ? pageMeta.id : '') || '')
  const lawyerId = String(pageMeta.lawyerId || (page === 'lawyerProfile' ? pageMeta.id : '') || '')
  const userId = String(pageMeta.userId || '')
  const isNew = !employeeId && !lawyerId && !userId
  const staffKey = `${employeeId}-${lawyerId}-${userId}-${lockRole}`

  const [roles, setRoles] = useState<Role[]>([])
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)
  const [photo, setPhoto] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState<{ name: string; data: number[] } | null>(null)
  const [staffDocs, setStaffDocs] = useState<{ id: string; title: string; category: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [extra, setExtra] = useState<Record<string, unknown>>({})
  const [att, setAtt] = useState({
    date: toIsoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
    check_in: '09:00',
    check_out: '17:00',
    status: 'present'
  })
  const [leave, setLeave] = useState({ leave_type: 'annual', start_date: '', end_date: '', status: 'pending' })

  const roleCode = useMemo(() => {
    if (lockRole) return lockRole
    return roles.find((r) => String(r.id) === String(form.role_id))?.code || ''
  }, [form.role_id, lockRole, roles])

  const setField = (name: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const onTypeChange = (roleId: string) => {
    const role = roles.find((r) => String(r.id) === String(roleId))
    setForm((prev) => ({
      ...prev,
      role_id: roleId,
      job_title: role ? JOB_DEFAULTS[role.code] || String(prev.job_title || '') : prev.job_title,
      department: role?.code === 'accountant' && !prev.department ? 'الحسابات' : prev.department
    }))
  }

  useEffect(() => {
    let cancelled = false
    setForm(emptyForm())
    setPhoto('')
    setPendingPhoto(null)
    setExtra({})

    const run = async () => {
      let list: Role[] = []
      try {
        const raw = await invoke<Role[] | { roles?: Role[] }>('users:roles')
        list = Array.isArray(raw) ? raw : Array.isArray(raw?.roles) ? raw.roles : []
      } catch {
        list = []
      }
      if (cancelled) return
      setRoles(list)

      if (isNew) {
        const role = lockRole ? list.find((r) => r.code === lockRole) : undefined
        setForm((prev) => ({
          ...prev,
          role_id: role?.id ?? prev.role_id,
          job_title: role ? JOB_DEFAULTS[role.code] : prev.job_title
        }))
        return
      }

      try {
        const row = await invoke<Record<string, unknown>>('employees:staff', {
          employeeId: employeeId || undefined,
          lawyerId: lawyerId || undefined,
          userId: userId || undefined
        })
        if (cancelled) return
        setExtra(row)
        const e = (row.employee as Record<string, unknown>) || {}
        const l = (row.lawyer as Record<string, unknown>) || {}
        const a = (row.account as Record<string, unknown>) || {}
        setPhoto(String(e.photo_data || l.photo_data || ''))
        const code = String(a.role_code || lockRole || '')
        setForm({
          ...emptyForm(),
          employee_id: e.id || '',
          user_id: a.id || '',
          lawyer_id: l.id || '',
          full_name: e.full_name || l.full_name || a.full_name || '',
          phone: e.phone || l.phone || a.phone || '',
          email: e.email || l.email || a.email || '',
          hire_date: e.hire_date || l.hire_date || '',
          status: e.status || l.status || 'active',
          notes: e.notes || l.notes || '',
          job_title: e.job_title || JOB_DEFAULTS[code] || '',
          department: e.department || '',
          salary: e.salary ?? l.salary ?? '',
          license_no: e.license_no || '',
          qualification: e.qualification || '',
          bar_number: l.bar_number || '',
          bar_degree: l.bar_degree || '',
          duties: l.duties || l.specialization || '',
          specialization: l.duties || l.specialization || '',
          whatsapp: e.whatsapp || l.whatsapp || '',
          phone_home: e.phone_home || l.phone_home || '',
          phone_other: e.phone_other || l.phone_other || '',
          address: e.address || l.address || '',
          rating: l.rating ?? '',
          username: a.username || '',
          password: '',
          role_id: a.role_id || '',
          is_active: a.is_active ?? 1
        })
      } catch (e) {
        if (!cancelled) toast((e as Error).message, 'err')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [staffKey])

  useEffect(() => {
    const lid = String(form.lawyer_id || '')
    const eid = String(form.employee_id || '')
    const filters = lid ? { lawyer_id: lid } : eid ? { employee_id: eid } : null
    if (!filters) {
      setStaffDocs([])
      return
    }
    invoke<{ rows: { id: string; title: string; category: string }[] }>('documents:list', {
      page: 1,
      pageSize: 40,
      filters
    })
      .then((r) => setStaffDocs(r.rows || []))
      .catch(() => setStaffDocs([]))
  }, [form.lawyer_id, form.employee_id])

  const save = async () => {
    if (!canEdit) return
    const parsed = staffSchema.safeParse({
      ...form,
      role_id: form.role_id ? String(form.role_id) : undefined,
      employee_id: form.employee_id ? String(form.employee_id) : undefined,
      user_id: form.user_id ? String(form.user_id) : undefined,
      lawyer_id: form.lawyer_id ? String(form.lawyer_id) : undefined,
      salary: form.salary === '' || form.salary == null ? undefined : Number(form.salary),
      rating: form.rating === '' || form.rating == null ? undefined : Number(form.rating),
      duties: form.duties || form.specialization
    })
    if (!parsed.success) {
      toast(parsed.error.issues[0]?.message || t('error'), 'err')
      return
    }
    setSaving(true)
    try {
      const ids = await invoke<{ lawyer_id: string; user_id: string; employee_id: string }>('lawyers:saveStaff', parsed.data)
      await uploadPendingDocs(
        ids.lawyer_id ? { lawyer_id: ids.lawyer_id } : { employee_id: ids.employee_id },
        form
      )
      if (pendingPhoto) {
        const r = await invoke<{ photo_data: string }>(
          'employees:savePhoto',
          { employeeId: ids.employee_id, lawyerId: ids.lawyer_id },
          pendingPhoto
        )
        setPhoto(r.photo_data || '')
        setPendingPhoto(null)
      }
      toast(t('savedOk'))
      setPage('staffForm', {
        employeeId: ids.employee_id,
        lawyerId: ids.lawyer_id,
        userId: ids.user_id,
        lockRole,
        back
      })
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const empId = String(form.employee_id || '')
  const roleOptions = roles.filter((r) => r && r.id != null)

  return (
    <div className="space-y-3">
      <PageHeader
        title={
          isNew
            ? lockRole === 'lawyer'
              ? t('hr.addLawyer')
              : back === 'users'
                ? t('hr.addUser')
                : t('hr.addStaff')
            : `${t('hr.staffTitle')} — ${String(form.full_name || '')}`
        }
        actions={
          <>
            {canEdit && (
            <Button type="button" onClick={() => save()} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setPage(back)}>
              {t('back')}
            </Button>
          </>
        }
      />
      <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-800 dark:border-navy-700 dark:bg-navy-900 dark:text-white">
        {t('hr.staffHint')}
      </p>
      <Card>
          <Field label={t('hr.staffType')} required>
            <Select
              value={String(form.role_id || '')}
              disabled={Boolean(lockRole)}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              <option value="">{t('pickFromList')}</option>
              {roleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {i18n.language === 'en' ? r.name_en || r.name_ar : r.name_ar}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      <div className="flex flex-wrap items-start gap-4">
        {photo ? (
          <img src={photo} alt="" className="h-32 w-32 rounded-xl object-cover ring-1 ring-navy-200 dark:ring-navy-600" />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-navy-100 text-center text-xs text-navy-500 dark:bg-navy-800 dark:text-navy-200">
            {t('settings.uploadPhoto')}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              const file = await invoke<{ name: string; data: number[] }>('files:pick')
              if (empId || lawyerId) {
                const r = await invoke<{ photo_data: string }>(
                  'employees:savePhoto',
                  { employeeId: empId || undefined, lawyerId: lawyerId || undefined },
                  file
                )
                setPhoto(r.photo_data || '')
                toast(t('savedOk'))
              } else {
                setPendingPhoto(file)
                setPhoto(URL.createObjectURL(new Blob([new Uint8Array(file.data)])))
              }
            } catch (e) {
              toast((e as Error).message, 'err')
            }
          }}
        >
          {t('settings.uploadPhoto')}
        </Button>
      </div>
      <Card>
        <h3 className="mb-3 font-bold">{t('hr.hrSection')}</h3>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div style={{ width: '28ch' }} className="max-w-full">
          <Field label={t('fields.full_name')} required>
            <Input type="text" autoComplete="off" value={String(form.full_name ?? '')} onChange={(e) => setField('full_name', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '16ch' }} className="max-w-full">
          <Field label={t('fields.phone')}>
            <Input type="text" autoComplete="off" value={String(form.phone ?? '')} onChange={(e) => setField('phone', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '22ch' }} className="max-w-full">
          <Field label={t('fields.email')}>
            <Input type="text" autoComplete="off" value={String(form.email ?? '')} onChange={(e) => setField('email', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '14ch' }} className="max-w-full">
          <Field label={t('fields.hire_date')}>
            <DatePicker value={String(form.hire_date || '')} onChange={(v) => setField('hire_date', v)} />
          </Field>
          </div>
          <div style={{ width: '18ch' }} className="max-w-full">
          <Field label={t('fields.job_title')}>
            <Input type="text" autoComplete="off" value={String(form.job_title ?? '')} onChange={(e) => setField('job_title', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '16ch' }} className="max-w-full">
          <Field label={t('fields.whatsapp')}>
            <Input dir="ltr" autoComplete="off" value={String(form.whatsapp ?? '')} onChange={(e) => setField('whatsapp', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '16ch' }} className="max-w-full">
          <Field label={t('fields.phone_home')}>
            <Input dir="ltr" autoComplete="off" value={String(form.phone_home ?? '')} onChange={(e) => setField('phone_home', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '16ch' }} className="max-w-full">
          <Field label={t('fields.phone_other')}>
            <Input dir="ltr" autoComplete="off" value={String(form.phone_other ?? '')} onChange={(e) => setField('phone_other', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '28ch' }} className="max-w-full flex-1">
          <Field label={t('fields.address')}>
            <Input autoComplete="off" value={String(form.address ?? '')} onChange={(e) => setField('address', e.target.value)} />
          </Field>
          </div>
          {roleCode !== 'lawyer' ? (
          <div style={{ width: '16ch' }} className="max-w-full">
          <Field label={t('fields.department')}>
            <Input type="text" autoComplete="off" value={String(form.department ?? '')} onChange={(e) => setField('department', e.target.value)} />
          </Field>
          </div>
          ) : null}
          <div style={{ width: '12ch' }} className="max-w-full">
          <Field label={t('fields.salary')}>
            <Input type="text" inputMode="decimal" autoComplete="off" value={String(form.salary ?? '')} onChange={(e) => setField('salary', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '12ch' }} className="max-w-full">
          <Field label={t('fields.status')}>
            <Select value={String(form.status || 'active')} onChange={(e) => setField('status', e.target.value)}>
              <option value="active">{t('status.active')}</option>
              <option value="inactive">{t('status.inactive')}</option>
            </Select>
          </Field>
          </div>
          <div className="w-full basis-full">
            <Field label={t('fields.notes')}>
              <Textarea value={String(form.notes ?? '')} onChange={(e) => setField('notes', e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>
      {roleCode === 'lawyer' && (
        <Card>
          <h3 className="mb-3 font-bold">{t('hr.lawyerSection')}</h3>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div style={{ width: '16ch' }} className="max-w-full">
            <Field label={t('fields.bar_number')}>
              <Input type="text" autoComplete="off" value={String(form.bar_number ?? '')} onChange={(e) => setField('bar_number', e.target.value)} />
            </Field>
            </div>
            <div style={{ width: '18ch' }} className="max-w-full">
            <Field label={t('fields.bar_degree')}>
              <Select value={String(form.bar_degree || '')} onChange={(e) => setField('bar_degree', e.target.value)}>
                <option value="">{t('pickFromList')}</option>
                <option value="جدول عام">{t('hr.barGeneral')}</option>
                <option value="ابتدائي">{t('hr.barFirst')}</option>
                <option value="استئناف">{t('hr.barAppeal')}</option>
                <option value="نقض">{t('hr.barCassation')}</option>
              </Select>
            </Field>
            </div>
            <div style={{ width: '22ch' }} className="max-w-full">
            <Field label={t('fields.duties')}>
              <Input type="text" autoComplete="off" value={String(form.duties ?? '')} onChange={(e) => setField('duties', e.target.value)} />
            </Field>
            </div>
            <div className="max-w-full">
            <Field label={t('party.rating')}>
              <div className="flex h-10 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const current = Number(form.rating || 0)
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!canEdit}
                      className={`text-lg ${n <= current ? 'text-gold-400' : 'text-navy-300'}`}
                      onClick={() => canEdit && setField('rating', n === current ? '' : n)}
                      aria-label={`${n}`}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
            </Field>
            </div>
          </div>
          {form.lawyer_id ? (
            <div className="mt-3">
              <AttachDocumentControl
                docs={(form.__pending_docs as PendingDoc[]) || []}
                onChange={(docs) => setField('__pending_docs', docs)}
                existing={staffDocs}
                owner={{ lawyer_id: String(form.lawyer_id) }}
                onUploaded={() => {
                  invoke<{ rows: { id: string; title: string; category: string }[] }>('documents:list', {
                    page: 1,
                    pageSize: 40,
                    filters: { lawyer_id: String(form.lawyer_id) }
                  }).then((r) => setStaffDocs(r.rows || []))
                }}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-navy-500">{t('hr.attachAfterSave')}</p>
          )}
        </Card>
      )}
      {roleCode !== 'lawyer' && form.employee_id ? (
        <Card>
          <h3 className="mb-3 font-bold">{t('docs.upload')}</h3>
          <AttachDocumentControl
            docs={(form.__pending_docs as PendingDoc[]) || []}
            onChange={(docs) => setField('__pending_docs', docs)}
            existing={staffDocs}
            owner={{ employee_id: String(form.employee_id) }}
            onUploaded={() => {
              invoke<{ rows: { id: string; title: string; category: string }[] }>('documents:list', {
                page: 1,
                pageSize: 40,
                filters: { employee_id: String(form.employee_id) }
              }).then((r) => setStaffDocs(r.rows || []))
            }}
          />
        </Card>
      ) : roleCode !== 'lawyer' ? (
        <p className="text-xs text-navy-500">{t('hr.attachAfterSave')}</p>
      ) : null}
      {roleCode === 'accountant' && (
        <Card>
          <h3 className="mb-3 font-bold">{t('hr.accountantSection')}</h3>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div style={{ width: '16ch' }} className="max-w-full">
            <Field label={t('fields.license_no')}>
              <Input type="text" autoComplete="off" value={String(form.license_no ?? '')} onChange={(e) => setField('license_no', e.target.value)} />
            </Field>
            </div>
            <div style={{ width: '22ch' }} className="max-w-full">
            <Field label={t('fields.qualification')}>
              <Input type="text" autoComplete="off" value={String(form.qualification ?? '')} onChange={(e) => setField('qualification', e.target.value)} />
            </Field>
            </div>
          </div>
        </Card>
      )}
      <Card>
        <h3 className="mb-3 font-bold">{t('hr.account')}</h3>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div style={{ width: '18ch' }} className="max-w-full">
          <Field label={t('fields.username')} required>
            <Input type="text" autoComplete="off" value={String(form.username ?? '')} onChange={(e) => setField('username', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '18ch' }} className="max-w-full">
          <Field label={`${t('fields.password')} (${t('users.passwordHint')})`} required={isNew}>
            <Input type="password" autoComplete="new-password" value={String(form.password ?? '')} onChange={(e) => setField('password', e.target.value)} />
          </Field>
          </div>
          <div style={{ width: '12ch' }} className="max-w-full">
          <Field label={t('fields.is_active')}>
            <Select value={String(form.is_active ?? 1)} onChange={(e) => setField('is_active', Number(e.target.value))}>
              <option value={1}>{t('status.yes')}</option>
              <option value={0}>{t('status.no')}</option>
            </Select>
          </Field>
          </div>
        </div>
      </Card>
      {empId ? (
        <Card>
          <UiTabs
            tabs={[
              {
                id: 'attendance',
                label: t('tabs.attendance'),
                body: (
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <DatePicker value={att.date} onChange={(d) => setAtt({ ...att, date: d })} />
                      <TimePicker value={att.check_in} onChange={(tm) => setAtt({ ...att, check_in: tm })} />
                      <TimePicker value={att.check_out} onChange={(tm) => setAtt({ ...att, check_out: tm })} />
                      <Select value={att.status} onChange={(e) => setAtt({ ...att, status: e.target.value })}>
                        <option value="present">{t('hr.present')}</option>
                        <option value="absent">{t('hr.absent')}</option>
                      </Select>
                      <Button
                        type="button"
                        onClick={async () => {
                          await invoke('employees:attendance', { ...att, employee_id: empId })
                          toast(t('savedOk'))
                        }}
                      >
                        {t('hr.checkIn')}
                      </Button>
                    </div>
                    <MiniTable rows={(extra.attendance as object[]) || []} keys={['date', 'check_in', 'check_out', 'status']} />
                  </div>
                )
              },
              {
                id: 'leaves',
                label: t('tabs.leaves'),
                body: (
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Select value={leave.leave_type} onChange={(e) => setLeave({ ...leave, leave_type: e.target.value })}>
                        <option value="annual">{t('hr.annual')}</option>
                        <option value="sick">{t('hr.sick')}</option>
                        <option value="unpaid">{t('hr.unpaid')}</option>
                      </Select>
                      <DatePicker value={leave.start_date} onChange={(d) => setLeave({ ...leave, start_date: d })} />
                      <DatePicker value={leave.end_date} onChange={(d) => setLeave({ ...leave, end_date: d })} />
                      <Button
                        type="button"
                        onClick={async () => {
                          await invoke('employees:leave', { ...leave, employee_id: empId })
                          toast(t('savedOk'))
                        }}
                      >
                        {t('hr.leave')}
                      </Button>
                    </div>
                    <MiniTable rows={(extra.leaves as object[]) || []} keys={['leave_type', 'start_date', 'end_date', 'status']} />
                  </div>
                )
              }
            ]}
          />
        </Card>
      ) : null}
      {roleCode === 'lawyer' && (form.lawyer_id || lawyerId) ? (
        <>
          <MiniTable
            rows={(extra.cases as object[]) || []}
            keys={['case_number', 'title', 'status']}
            onRowClick={(r) => r.id && setPage('caseProfile', { id: r.id })}
          />
          <MiniTable
            rows={(extra.hearings as object[]) || []}
            keys={['hearing_date', 'case_number', 'status']}
            onRowClick={(r) => {
              if (r.id) setPage('hearings', { edit_id: r.id, case_id: r.case_id })
            }}
          />
        </>
      ) : null}
    </div>
  )
}
