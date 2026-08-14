import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { invoke } from '../lib/api'
import { useUpdateStore } from '../store/updater'
import { Button } from './ui'

export function UpdateBanner() {
  const { t } = useTranslation()
  const { phase, version, percent, error } = useUpdateStore()

  if (phase === 'idle' || phase === 'checking') return null

  const install = async () => {
    await invoke('updater:install')
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex justify-center md:justify-start">
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-gold-400/60 bg-white p-3 shadow-xl dark:bg-navy-900 dark:text-navy-50">
        {phase === 'available' || phase === 'downloading' ? (
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 shrink-0 text-gold-500" size={18} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {t('updater.downloading', { percent: phase === 'downloading' ? percent : 0, version })}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
                <div
                  className="h-full rounded-full bg-gold-500 transition-[width] duration-300"
                  style={{ width: `${phase === 'downloading' ? percent : 2}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {phase === 'ready' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{t('updater.ready', { version })}</div>
            <Button type="button" onClick={() => void install()}>
              {t('updater.install')}
            </Button>
          </div>
        ) : null}
        {phase === 'error' ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  )
}
