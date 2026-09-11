import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'

export function SimilarClientModal({
  open,
  name,
  code,
  saving,
  isEdit = false,
  onClose,
  onOpenExisting,
  onAddAsNew,
  canOpenExisting = true
}: {
  open: boolean
  name?: string
  code?: string
  saving?: boolean
  isEdit?: boolean
  onClose: () => void
  onOpenExisting: () => void
  onAddAsNew: () => void
  canOpenExisting?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={t('clients.similarTitle')} onClose={onClose}>
      <p className="leading-relaxed">{t(isEdit ? 'clients.similarAskEdit' : 'clients.similarAsk', { name, code })}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="button" variant="outline" onClick={onOpenExisting} disabled={!canOpenExisting}>
          {t('clients.openExisting')}
        </Button>
        <Button type="button" disabled={saving} onClick={onAddAsNew}>
          {t(isEdit ? 'clients.saveOnCurrent' : 'clients.addAsNew')}
        </Button>
      </div>
    </Modal>
  )
}
