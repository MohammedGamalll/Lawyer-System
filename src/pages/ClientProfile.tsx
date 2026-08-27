import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { contactSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, InfoGrid, Input, MiniTable, PageHeader, UiTabs } from '../components/ui'
import { ContactActions } from '../components/ContactActions'
import type { FieldDef } from '../components/CrudPage'
import { formatCell } from '../lib/datetime'
import { onDataChanged } from '../lib/bus'

export function ClientProfilePage() {
  const { t, i18n } = useTranslation()
  const { pageMeta, goBack, toast, can } = useApp()
  const [p, setP] = useState<Record<string, unknown> | null>(null)
  const [contact, setContact] = useState({ name: '', position: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const id = String(pageMeta.id || '')
  const rhf = useForm({ resolver: zodResolver(contactSchema), values: contact, mode: 'onChange' })

  const load = () =>
    invoke<Record<string, unknown>>('clients:profile', id).then(setP).catch((e) => toast(e.message, 'err'))
  useEffect(() => {
    load()
  }, [id])
  useEffect(() => onDataChanged(() => load()), [id])

  if (!p) return <div>{t('loading')}</div>
  const c = p.client as Record<string, unknown>
  const contacts = (c.contacts as object[]) || []

  const addContact = rhf.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await invoke('clients:addContact', id, values)
      toast(t('savedOk'))
      rhf.reset({ name: '', position: '', phone: '', email: '' })
      setContact({ name: '', position: '', phone: '', email: '' })
      await load()
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  })

  const personalFields: FieldDef[] = [
    { name: 'full_name', label: t('fields.full_name') },
    { name: 'national_id', label: t('fields.national_id') },
    { name: 'phone', label: t('fields.phone') },
    { name: 'phone2', label: t('fields.phone2') },
    { name: 'whatsapp', label: t('fields.whatsapp') },
    { name: 'email', label: t('fields.email') },
    { name: 'address', label: t('fields.address') },
    { name: 'governorate', label: t('fields.governorate') },
    { name: 'client_type', label: t('fields.client_type') },
    { name: 'profession', label: t('fields.profession') },
    { name: 'commercial_register', label: t('fields.commercial_register') },
    { name: 'tax_id', label: t('fields.tax_id') },
    { name: 'manager_name', label: t('fields.manager_name') },
    { name: 'notes', label: t('fields.notes'), type: 'textarea' }
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t('nav.clients')} — ${c.full_name}`}
        actions={
          <Button variant="outline" onClick={() => goBack()}>
            {t('back')}
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="min-w-0">
          <div className="text-xs text-navy-500">{t('number')}</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-bold">{String(c.client_number)}</div>
        </Card>
        <Card className="min-w-0">
          <div className="text-xs text-navy-500">{t('phone')}</div>
          <div className="flex items-center gap-2 font-bold" dir="ltr">
            <span>{String(c.phone ?? '—')}</span>
            {can('clients.unmask_contact') ? (
            <ContactActions
              phone={String(c.phone || '')}
              whatsapp={String(c.whatsapp || '')}
              email={String(c.email || '')}
            />
            ) : null}
          </div>
        </Card>
        <Card className="min-w-0">
          <div className="text-xs text-navy-500">{t('type')}</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-bold">
            {t(`status.${c.client_type}`, { defaultValue: String(c.client_type) })}
          </div>
        </Card>
        {can('accounts.view') && (
        <Card className="min-w-0">
          <div className="text-xs text-navy-500">{t('due')}</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-bold tabular-nums">{Number(p.due).toLocaleString('ar-EG')}</div>
        </Card>
        )}
      </div>
      <Card>
        <UiTabs
          tabs={[
            {
              id: 'personal',
              label: t('tabs.personal'),
              body: (
                <InfoGrid
                  items={personalFields.map((f) => {
                    const text = formatCell(f.name, c[f.name], i18n.language, t)
                    if (f.name === 'phone' || f.name === 'whatsapp') {
                      return {
                        label: f.label,
                        value: (
                          <span className="inline-flex items-center gap-2">
                            <span dir="ltr">{text}</span>
                            {can('clients.unmask_contact') ? (
                            <ContactActions
                              phone={String(c.phone || '')}
                              whatsapp={String(c.whatsapp || c.phone || '')}
                            />
                            ) : null}
                          </span>
                        )
                      }
                    }
                    if (f.name === 'email') {
                      return {
                        label: f.label,
                        value: (
                          <span className="inline-flex items-center gap-2">
                            <span dir="ltr">{text}</span>
                            {can('clients.unmask_contact') ? <ContactActions email={String(c.email || '')} /> : null}
                          </span>
                        )
                      }
                    }
                    return { label: f.label, value: text }
                  })}
                />
              )
            },
            {
              id: 'cases',
              label: t('tabs.cases'),
              body: (
                <MiniTable
                  rows={p.cases as object[]}
                  keys={['case_number', 'title', 'status']}
                  onRowClick={(r) => useApp.getState().setPage('caseProfile', { id: r.id })}
                />
              )
            },
            ...(can('accounts.view')
              ? [
                  {
                    id: 'finance',
                    label: t('tabs.finance'),
                    body: (
                      <div className="space-y-4">
                        <MiniTable rows={p.payments as object[]} keys={['payment_number', 'amount', 'payment_date']} />
                        <MiniTable rows={p.expenses as object[]} keys={['expense_number', 'amount']} />
                      </div>
                    )
                  }
                ]
              : []),
            {
              id: 'documents',
              label: t('tabs.documents'),
              body: (
                <MiniTable
                  rows={p.documents as object[]}
                  keys={['title', 'category']}
                  onRowClick={(r) => invoke('documents:open', r.id).catch((e) => toast((e as Error).message, 'err'))}
                />
              )
            },
            {
              id: 'staff',
              label: t('tabs.staff'),
              body: (
                <div>
                  {(c.client_type === 'company' || c.client_type === 'institution') && (
                    <form onSubmit={addContact} className="mb-4 grid gap-2 md:grid-cols-4">
                      <Field label={t('fields.name')} required error={rhf.formState.errors.name?.message}>
                        <Input
                          {...rhf.register('name')}
                          value={contact.name}
                          onChange={(e) => {
                            setContact({ ...contact, name: e.target.value })
                            rhf.setValue('name', e.target.value, { shouldValidate: true })
                          }}
                        />
                      </Field>
                      <Field label={t('fields.position')}>
                        <Input
                          value={contact.position}
                          onChange={(e) => {
                            setContact({ ...contact, position: e.target.value })
                            rhf.setValue('position', e.target.value)
                          }}
                        />
                      </Field>
                      <Field label={t('fields.phone')} error={rhf.formState.errors.phone?.message}>
                        <Input
                          value={contact.phone}
                          onChange={(e) => {
                            setContact({ ...contact, phone: e.target.value })
                            rhf.setValue('phone', e.target.value, { shouldValidate: true })
                          }}
                        />
                      </Field>
                      <Field label={t('fields.email')} error={rhf.formState.errors.email?.message}>
                        <Input
                          value={contact.email}
                          onChange={(e) => {
                            setContact({ ...contact, email: e.target.value })
                            rhf.setValue('email', e.target.value, { shouldValidate: true })
                          }}
                        />
                      </Field>
                      <Button type="submit" disabled={saving || !rhf.formState.isValid}>
                        {saving ? t('saving') : t('add')}
                      </Button>
                    </form>
                  )}
                  <MiniTable rows={contacts} keys={['name', 'position', 'phone', 'email']} />
                  {contacts.map((row) => (
                    <Button
                      key={String((row as { id: string }).id)}
                      variant="ghost"
                      className="mt-1"
                      onClick={async () => {
                        await invoke('clients:removeContact', (row as { id: string }).id)
                        toast(t('deletedOk'))
                        load()
                      }}
                    >
                      {t('delete')} — {String((row as { name: string }).name)}
                    </Button>
                  ))}
                </div>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}
