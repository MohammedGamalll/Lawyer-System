import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { useSyncStore, type SyncSnapshot } from '../store/sync'
import { Button, Field, Input, Modal } from './ui'

export function AuthLockModal({
  open,
  onVerified
}: {
  open: boolean
  onVerified: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!password) return
    setBusy(true)
    try {
      const snap = await invoke<SyncSnapshot>('auth:confirmRemotePassword', password)
      useSyncStore.getState().setSnapshot(snap)
      setPassword('')
      onVerified()
      toast(t('sync.reverifyOk'))
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} locked title={t('sync.reverifyTitle')} onClose={() => undefined}>
      <p className="mb-4 text-sm text-navy-700 dark:text-navy-100">{t('sync.reverifyBody')}</p>
      <Field label={t('password')} required>
        <Input
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </Field>
      <Button className="mt-4 w-full" disabled={busy || !password} onClick={() => void submit()}>
        {busy ? t('loading') : t('sync.reverifySubmit')}
      </Button>
    </Modal>
  )
}
