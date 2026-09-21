import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'

export type DetailItem = { label: string; value?: ReactNode }

function hasValue(v: ReactNode) {
  if (v === undefined || v === null || v === false) return false
  if (typeof v === 'string') return v.trim() !== '' && v !== '—'
  return true
}

export function RecordDetailsModal({
  open,
  title,
  items,
  onClose,
  onEdit
}: {
  open: boolean
  title: string
  items: DetailItem[]
  onClose: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const shown = items.filter((i) => hasValue(i.value))
  return (
    <Modal open={open} title={title} onClose={onClose} wide>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {(shown.length ? shown : items).map((i) => (
          <div key={i.label} className="rounded-md border border-navy-100 px-2 py-1.5 dark:border-navy-700">
            <div className="text-[11px] font-semibold text-navy-500">{i.label}</div>
            <div className="whitespace-pre-wrap break-words font-medium">{i.value ?? '—'}</div>
          </div>
        ))}
      </div>
      {onEdit ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onEdit}>
            {t('edit')}
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}
