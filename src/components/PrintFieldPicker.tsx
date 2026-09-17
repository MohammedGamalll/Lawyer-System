import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'
import type { PrintFieldOpt } from '../lib/printKit'

export function PrintFieldPicker({
  open,
  title,
  fields,
  extra,
  wide,
  onClose,
  onConfirm
}: {
  open: boolean
  title: string
  fields: PrintFieldOpt[]
  extra?: ReactNode
  wide?: boolean
  onClose: () => void
  onConfirm: (selected: string[]) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const next: Record<string, boolean> = {}
    for (const f of fields) next[f.id] = f.defaultOn !== false
    setSel(next)
  }, [open, fields])

  const toggle = (id: string) => setSel((s) => ({ ...s, [id]: !s[id] }))

  return (
    <Modal open={open} title={title} onClose={onClose} wide={wide}>
      <div className="space-y-3">
        {extra}
        <p className="text-sm font-semibold">{t('printKit.fields')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(sel[f.id])} onChange={() => toggle(f.id)} />
              {f.label}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(fields.filter((f) => sel[f.id]).map((f) => f.id))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('print')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
