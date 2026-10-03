import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'
import { invoke } from '../lib/api'
import {
  cancelPendingPrint,
  confirmPendingPrint,
  getPendingPrint,
  subscribePrintPreview
} from '../lib/printKit'

export function PrintPreviewModal() {
  const { t } = useTranslation()
  const [tick, setTick] = useState(0)
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const job = getPendingPrint()

  useEffect(() => subscribePrintPreview(() => setTick((n) => n + 1)), [])

  useEffect(() => {
    if (!job) {
      setHtml('')
      return
    }
    let cancelled = false
    setHtml('')
    invoke<string>('print:html', job.kind, job.title, job.body, job.layout)
      .then((doc) => {
        if (!cancelled) setHtml(doc)
      })
      .catch(() => {
        if (!cancelled) setHtml(`<div style="padding:24px;font-family:sans-serif">${job.body}</div>`)
      })
    return () => {
      cancelled = true
    }
  }, [job, tick])

  if (!job) return null

  return (
    <Modal open title={t('printKit.preview')} onClose={cancelPendingPrint} wide>
      <div className="flex min-h-0 flex-col gap-3">
        <iframe
          title={job.title}
          className="h-[70vh] w-full rounded border border-navy-100 bg-white dark:border-navy-800"
          sandbox="allow-same-origin"
          srcDoc={html || undefined}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={cancelPendingPrint}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void confirmPendingPrint().finally(() => setBusy(false))
            }}
          >
            {t('print')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
