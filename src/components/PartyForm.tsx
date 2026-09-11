import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Select } from './ui'
import { AutoFitInput } from './AutoFitInput'
import { LookupCombo } from './LookupCombo'
import { AttachDocumentControl, uploadPendingDocs, type PendingDoc } from './DocumentTools'
import { clientBlankFormHtml } from '../lib/clientBlankForm'

type Props = {
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors?: Record<string, string>
  partyId?: string
  entity?: 'client' | 'opponent'
}

function Fit({
  label,
  ch,
  required,
  error,
  grow,
  children
}: {
  label: string
  ch: number
  required?: boolean
  error?: string
  grow?: boolean
  children: ReactNode
}) {
  return (
    <div className={grow ? 'min-w-[16rem] max-w-full flex-1' : 'max-w-full'} style={grow ? { minWidth: `${ch}ch` } : { width: `${ch}ch` }}>
      <Field label={label} required={required} error={error}>
        {children}
      </Field>
    </div>
  )
}

export function PartyForm({ values, onChange, errors, partyId, entity = 'client' }: Props) {
  const { t } = useTranslation()
  const { toast, can } = useApp()
  const v = (k: string) => String(values[k] ?? '')
  const kind = v('id_kind') || 'national_id'
  const showAddress2 = Boolean(v('address2')) || Boolean(values.__show_address2)
  const pending = (values.__pending_docs as PendingDoc[] | undefined) || []
  const [existing, setExisting] = useState<{ id: string; title: string; category: string }[]>([])

  const loadDocs = () => {
    if (!partyId) {
      setExisting([])
      return
    }
    const filters = entity === 'opponent' ? { opponent_id: partyId } : { client_id: partyId }
    invoke<{ rows: { id: string; title: string; category: string }[] }>('documents:list', {
      page: 1,
      pageSize: 40,
      filters
    })
      .then((r) => setExisting(r.rows))
      .catch(() => setExisting([]))
  }

  useEffect(() => {
    loadDocs()
  }, [partyId, entity])

  const printBlank = () => {
    invoke('print:print', 'a4', t('clients.blankForm'), clientBlankFormHtml()).catch((e) =>
      toast((e as Error).message, 'err')
    )
  }

  const onIdChange = (raw: string) => {
    if (kind === 'passport') {
      onChange('national_id', raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 20))
      return
    }
    onChange('national_id', raw.replace(/[^\d٠-٩۰-۹]/g, '').slice(0, 14))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        {entity === 'client' ? (
          <Button type="button" variant="outline" onClick={printBlank}>
            {t('clients.printBlank')}
          </Button>
        ) : (
          <span />
        )}
        {can('documents.upload') ? (
          <AttachDocumentControl
            docs={pending}
            existing={existing}
            owner={partyId ? (entity === 'opponent' ? { opponent_id: partyId } : { client_id: partyId }) : undefined}
            onChange={(docs) => onChange('__pending_docs', docs)}
            onUploaded={loadDocs}
          />
        ) : null}
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
          ch={kind === 'passport' ? 22 : 24}
          grow
          error={errors?.national_id}
        >
          <Input
            dir="ltr"
            className="tracking-widest"
            maxLength={kind === 'passport' ? 20 : 14}
            value={v('national_id')}
            onChange={(e) => onIdChange(e.target.value)}
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
        <Fit label={t('fields.poa_number')} ch={14} error={errors?.poa_number}>
          <Input dir="ltr" value={v('poa_number')} onChange={(e) => onChange('poa_number', e.target.value)} />
        </Fit>
        <Fit label={t('fields.poa_year')} ch={8} error={errors?.poa_year}>
          <Input dir="ltr" maxLength={4} value={v('poa_year')} onChange={(e) => onChange('poa_year', e.target.value)} />
        </Fit>
        <Fit label={t('fields.poa_letter')} ch={8} error={errors?.poa_letter}>
          <Input value={v('poa_letter')} onChange={(e) => onChange('poa_letter', e.target.value)} />
        </Fit>
        <Fit label={t('fields.poa_office')} ch={22} grow error={errors?.poa_office}>
          <Input value={v('poa_office')} onChange={(e) => onChange('poa_office', e.target.value)} />
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

      {entity === 'client' ? (
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
      ) : (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <Fit label={t('fields.lawyer_name')} ch={22} error={errors?.lawyer_name}>
            <Input value={v('lawyer_name')} onChange={(e) => onChange('lawyer_name', e.target.value)} />
          </Fit>
          <Fit label={t('fields.lawyer_phone')} ch={16} error={errors?.lawyer_phone}>
            <Input dir="ltr" value={v('lawyer_phone')} onChange={(e) => onChange('lawyer_phone', e.target.value)} />
          </Fit>
        </div>
      )}
    </div>
  )
}

export const ClientForm = (props: Omit<Props, 'entity'> & { clientId?: string }) => (
  <PartyForm {...props} partyId={props.partyId || props.clientId} entity="client" />
)

export async function uploadClientPendingDocs(clientId: string, form: Record<string, unknown>) {
  await uploadPendingDocs({ client_id: clientId }, form)
}

export async function uploadOpponentPendingDocs(opponentId: string, form: Record<string, unknown>) {
  await uploadPendingDocs({ opponent_id: opponentId }, form)
}
