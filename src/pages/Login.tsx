import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { loginSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Select, PasswordInput } from '../components/ui'
import type { UserSession } from '@shared/types'
import i18n from '../i18n'
import { applyFontSize } from '../lib/uiPrefs'
import brandLogo from '../assets/brand-logo.png'

type LoginName = { username: string; full_name: string }

export function LoginPage() {
  const { t } = useTranslation()
  const { setUser, toast, applyTheme } = useApp()
  const [busy, setBusy] = useState(false)
  const [names, setNames] = useState<LoginName[]>([])

  useEffect(() => {
    applyTheme('light')
  }, [applyTheme])

  useEffect(() => {
    invoke<LoginName[]>('auth:usernames')
      .then((rows) => setNames(Array.isArray(rows) ? rows : []))
      .catch(() => setNames([]))
  }, [])

  const rhf = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onChange'
  })

  const onSubmit = rhf.handleSubmit(async (values) => {
    setBusy(true)
    try {
      const user = await invoke<UserSession>('auth:login', values.username, values.password)
      setUser(user)
      const settings = await invoke<Record<string, string>>('settings:get')
      if (settings.language) i18n.changeLanguage(settings.language)
      applyTheme(settings.theme === 'dark' ? 'dark' : 'light')
      applyFontSize(Number(settings.ui_font_size || 16))
    } catch (err) {
      toast((err as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  })

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-navy-950" dir={i18n.language === 'en' ? 'ltr' : 'rtl'}>
      <img
        src={brandLogo}
        alt=""
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(95vh,980px)] w-[min(95vh,980px)] -translate-x-1/2 -translate-y-1/2 object-contain opacity-50"
      />
      <div className="pointer-events-none absolute inset-0 bg-navy-950/40" />
      <form onSubmit={onSubmit} autoComplete="off" className="login-sheet relative z-10 w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src={brandLogo} alt="مؤسسة آل عبدالرازق للمحاماة والاستشارات القانونية" className="mx-auto mb-3 h-36 w-36 object-contain drop-shadow" />
          <div className="text-gold-600">مؤسسة آل عبدالرازق</div>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t('appName')}</h1>
          <p className="mt-2 text-sm text-navy-500">{t('loginHint')}</p>
        </div>
        <div className="space-y-3">
          <Field label={t('username')} required error={rhf.formState.errors.username?.message}>
            <Select
              autoComplete="off"
              autoFocus
              value={rhf.watch('username')}
              onChange={(e) => rhf.setValue('username', e.target.value, { shouldValidate: true })}
            >
              <option value="">{t('loginSelectUser')}</option>
              {names.map((u) => (
                <option key={u.username} value={u.username}>
                  {String(u.full_name || '').trim() || u.username}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('password')} required error={rhf.formState.errors.password?.message}>
            <PasswordInput autoComplete="off" {...rhf.register('password')} />
          </Field>
          <Button className="w-full" disabled={busy || !rhf.formState.isValid}>
            {busy ? t('loading') : t('enter')}
          </Button>
        </div>
      </form>
    </div>
  )
}
