import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Select } from './ui'
import { AutoFitInput } from './AutoFitInput'
import { LookupCombo } from './LookupCombo'
import { UploadSourceMenu, type PickedFile } from './DocumentTools'
import { clientBlankFormHtml } from '../lib/clientBlankForm'

type Props = {
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors?: Record<string, string>
  clientId?: string
}

function Fit({
  label,
  ch,
  required,
  error,
  children
}: {
  label: string
  ch: number
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="max-w-full" style={{ width: `${ch}ch` }}>
      <Field label={label} required={required} error={error}>
        {children}
      </Field>
    </div>
  )
}

export function ClientForm({ values, onChange, errors, clientId }: Props) {
  const { t } = useTranslation()
  const { toast, can } = useApp()
  const v = (k: string) => String(values[k] ?? '')
  const kind = v('id_kind') || 'national_id'
  const showAddress2 = Boolean(v('address2')) || Boolean(values.__show_address2)
  const pendingId = values.__pending_id as PickedFile | undefined
  const pendingPoa = values.__pending_poa as PickedFile | undefined
  const [existing, setExisting] = useState<{ id?: string; poa?: string }>({})

  useEffect(() => {
    if (!clientId) {
      setExisting({})
      return
    }
    invoke<{ rows: { title: string; category: string }[] }>('documents:list', {
      page: 1,
      pageSize: 40,
      filters: { client_id: clientId }
    })
      .then((r) => {
        const id = r.rows.find((d) => d.category === 'id')
        const poa = r.rows.find((d) => d.category === 'poa')
        setExisting({ id: id?.title, poa: poa?.title })
      })
      .catch(() => setExisting({}))
  }, [clientId])

  const printBlank = () => {
    invoke('print:print', 'a4', t('clients.blankForm'), clientBlankFormHtml()).catch((e) =>
      toast((e as Error).message, 'err')
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {can('documents.upload') ? (
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[12rem] rounded-lg border border-navy-200 p-2 dark:border-navy-700">
              <div className="mb-1 text-xs font-bold">{t('clients.attachId')}</div>
              <UploadSourceMenu onFile={(f) => onChange('__pending_id', f)} />
              <p className="mt-1 text-xs text-navy-500">{pendingId?.name || existing.id || '—'}</p>
            </div>
            <div className="min-w-[12rem] rounded-lg border border-navy-200 p-2 dark:border-navy-700">
              <div className="mb-1 text-xs font-bold">{t('clients.attachPoa')}</div>
              <UploadSourceMenu onFile={(f) => onChange('__pending_poa', f)} />
              <p className="mt-1 text-xs text-navy-500">{pendingPoa?.name || existing.poa || '—'}</p>
            </div>
          </div>
        ) : (
          <span />
        )}
        <Button type="button" variant="outline" onClick={printBlank}>
          {t('clients.printBlank')}
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Fit label={t('fields.full_name')} ch={30} required error={errors?.full_name}>
          <AutoFitInput maxCh={30} value={v('full_name')} onChange={(s) => onChange('full_name', s)} />
        </Fit>
        <Fit label={t('fields.nickname')} ch={20} error={errors?.nickname}>
          <AutoFitInput maxCh={20} value={v('nickname')} onChange={(s) => onChange('nickname', s)} />
        </Fit>
        <Fit label={t('fields.id_kind')} ch={14}>
          <Select value={kind} onChange={(e) => onChange('id_kind', e.target.value)}>
            <option value="national_id">{t('fields.national_id')}</option>
            <option value="passport">{t('fields.passport')}</option>
          </Select>
        </Fit>
        <Fit
          label={kind === 'passport' ? t('fields.passport') : t('fields.national_id')}
          ch={kind === 'passport' ? 16 : 14}
          error={errors?.national_id}
        >
          <Input
            dir="ltr"
            maxLength={kind === 'passport' ? 20 : 14}
            value={v('national_id')}
            onChange={(e) => onChange('national_id', e.target.value)}
          />
        </Fit>
        {kind === 'passport' ? (
          <Fit label={t('fields.passport_country')} ch={16} error={errors?.passport_country}>
            <Input value={v('passport_country')} onChange={(e) => onChange('passport_country', e.target.value)} />
          </Fit>
        ) : null}
        <Fit label={t('fields.notes')} ch={22} error={errors?.notes}>
          <Input value={v('notes')} onChange={(e) => onChange('notes', e.target.value)} />
        </Fit>
      </div>

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Fit label={t('fields.whatsapp')} ch={16} error={errors?.whatsapp}>
          <Input dir="ltr" maxLength={16} value={v('whatsapp')} onChange={(e) => onChange('whatsapp', e.target.value)} />
        </Fit>
        <Fit label={t('fields.phone_other')} ch={16} error={errors?.phone}>
          <Input dir="ltr" maxLength={16} value={v('phone')} onChange={(e) => onChange('phone', e.target.value)} />
        </Fit>
        <Fit label={t('fields.phone_home')} ch={16} error={errors?.phone_home}>
          <Input dir="ltr" maxLength={16} value={v('phone_home')} onChange={(e) => onChange('phone_home', e.target.value)} />
        </Fit>
        <Fit label={t('fields.phone_work')} ch={16} error={errors?.phone_work}>
          <Input dir="ltr" maxLength={16} value={v('phone_work')} onChange={(e) => onChange('phone_work', e.target.value)} />
        </Fit>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-[20rem] flex-1">
          <Field label={t('fields.address')} error={errors?.address}>
            <Input value={v('address')} onChange={(e) => onChange('address', e.target.value)} />
          </Field>
        </div>
        {!showAddress2 ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 px-0"
            title={t('clients.addAddress')}
            onClick={() => onChange('__show_address2', true)}
          >
            +
          </Button>
        ) : null}
        <Fit label={t('fields.email')} ch={22} error={errors?.email}>
          <Input dir="ltr" value={v('email')} onChange={(e) => onChange('email', e.target.value)} />
        </Fit>
      </div>
      {showAddress2 ? (
        <Field label={t('fields.address2')} error={errors?.address2}>
          <Input value={v('address2')} onChange={(e) => onChange('address2', e.target.value)} />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Fit label={t('fields.profession')} ch={16}>
          <LookupCombo kind="profession" value={v('profession')} onChange={(s) => onChange('profession', s)} />
        </Fit>
        <Fit label={t('fields.commercial_register')} ch={18} error={errors?.commercial_register}>
          <Input dir="ltr" value={v('commercial_register')} onChange={(e) => onChange('commercial_register', e.target.value)} />
        </Fit>
        <Fit label={t('fields.tax_id')} ch={18} error={errors?.tax_id}>
          <Input dir="ltr" value={v('tax_id')} onChange={(e) => onChange('tax_id', e.target.value)} />
        </Fit>
      </div>
    </div>
  )
}

export async function uploadClientPendingDocs(clientId: string, form: Record<string, unknown>) {
  const idFile = form.__pending_id as PickedFile | undefined
  const poaFile = form.__pending_poa as PickedFile | undefined
  if (idFile?.data) {
    await invoke('documents:upload', { client_id: clientId, title: idFile.name || 'بطاقة', category: 'id' }, idFile)
  }
  if (poaFile?.data) {
    await invoke('documents:upload', { client_id: clientId, title: poaFile.name || 'توكيل', category: 'poa' }, poaFile)
  }
}
