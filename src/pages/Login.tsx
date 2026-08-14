import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { loginSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Input, Field } from '../components/ui'
import type { UserSession } from '@shared/types'
import i18n from '../i18n'

export function LoginPage() {
  const { t } = useTranslation()
  const { setUser, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const rhf = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: 'admin', password: 'Admin@123' },
    mode: 'onChange'
  })

  const onSubmit = rhf.handleSubmit(async (values) => {
    setBusy(true)
    try {
      const user = await invoke<UserSession>('auth:login', values.username, values.password)
      setUser(user)
      const settings = await invoke<Record<string, string>>('settings:get')
      if (settings.language) i18n.changeLanguage(settings.language)
      if (settings.theme === 'dark') document.documentElement.classList.add('dark')
    } catch (err) {
      toast((err as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  })

  return (
    <div className="flex h-full items-center justify-center bg-navy-950" dir={i18n.language === 'en' ? 'ltr' : 'rtl'}>
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-gold-500">Law Office Management</div>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t('appName')}</h1>
          <p className="mt-2 text-sm text-navy-500">{t('loginHint')}</p>
        </div>
        <div className="space-y-3">
          <Field label={t('username')} required error={rhf.formState.errors.username?.message}>
            <Input {...rhf.register('username')} autoFocus />
          </Field>
          <Field label={t('password')} required error={rhf.formState.errors.password?.message}>
            <Input type="password" {...rhf.register('password')} />
          </Field>
          <Button className="w-full" disabled={busy || !rhf.formState.isValid}>
            {busy ? t('loading') : t('enter')}
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-navy-400">{t('defaultAccount')}</p>
      </form>
    </div>
  )
}
