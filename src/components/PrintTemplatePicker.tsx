import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Select } from './ui'

export function PrintTemplatePicker({
  caseId,
  clientId,
  fallback
}: {
  caseId?: string
  clientId?: string
  fallback?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [rows, setRows] = useState<{ id: string; name: string }[]>([])
  const [id, setId] = useState('')

  useEffect(() => {
    invoke<{ id: string; name: string }[]>('printTemplates:list')
      .then((list) => {
        setRows(list)
        setId(list[0]?.id || '')
      })
      .catch(() => undefined)
  }, [])

  const run = async () => {
    try {
      if (id) await invoke('printTemplates:print', id, { caseId, clientId })
      else fallback?.()
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select className="h-9 min-w-[10rem]" value={id} onChange={(e) => setId(e.target.value)}>
        {fallback ? <option value="">{t('printDesigner.builtinSheet')}</option> : null}
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <Button type="button" variant="outline" onClick={() => void run()}>
        <Printer className="me-1 inline h-4 w-4" />
        {t('print')}
      </Button>
    </div>
  )
}
