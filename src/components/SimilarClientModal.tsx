import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'

export function SimilarClientModal({
  open,
  name,
  code,
  saving,
  onClose,
  onOpenExisting,
  onAddAsNew
}: {
  open: boolean
  name?: string
  code?: string
  saving?: boolean
  onClose: () => void
  onOpenExisting: () => void
  onAddAsNew: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={t('clients.similarTitle')} onClose={onClose}>
      <p className="leading-relaxed">{t('clients.similarAsk', { name, code })}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="button" variant="outline" onClick={onOpenExisting}>
          {t('clients.openExisting')}
        </Button>
        <Button type="button" disabled={saving} onClick={onAddAsNew}>
          {t('clients.addAsNew')}
        </Button>
      </div>
    </Modal>
  )
}
