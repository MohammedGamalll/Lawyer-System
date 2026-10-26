import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Button, Card, Field, Select } from './ui'
import { parseSheetFontSize, parseSheetHideCols, SHEET_HIDE_COLS, type SheetFontSize, type SheetHideCol } from '@shared/printSheetPrefs'

export function WorkSheetPrintPrefs() {
  const { t } = useTranslation()
  const [font, setFont] = useState<SheetFontSize>('md')
  const [hidden, setHidden] = useState<SheetHideCol[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    invoke<Record<string, string>>('settings:get')
      .then((s) => {
        setFont(parseSheetFontSize(s.print_sheet_font))
        setHidden(parseSheetHideCols(s.print_sheet_hide_cols))
      })
      .catch(() => undefined)
  }, [])

  const toggle = (id: SheetHideCol) => {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const save = async () => {
    setSaving(true)
    try {
      const cur = await invoke<Record<string, string>>('settings:get')
      await invoke('settings:set', {
        ...cur,
        print_sheet_font: font,
        print_sheet_hide_cols: JSON.stringify(hidden)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 space-y-3 p-3">
      <h3 className="font-bold">{t('printSheetPrefs.title')}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('printSheetPrefs.fontSize')}>
          <Select value={font} onChange={(e) => setFont(parseSheetFontSize(e.target.value))}>
            <option value="sm">{t('printSheetPrefs.sm')}</option>
            <option value="md">{t('printSheetPrefs.md')}</option>
            <option value="lg">{t('printSheetPrefs.lg')}</option>
          </Select>
        </Field>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
      <div className="text-sm font-semibold">{t('printSheetPrefs.columns')}</div>
      <div className="flex flex-wrap gap-3 text-sm">
        {SHEET_HIDE_COLS.map((id) => (
          <label key={id} className="flex items-center gap-1">
            <input type="checkbox" checked={!hidden.includes(id)} onChange={() => toggle(id)} />
            {t(`printSheetPrefs.col.${id}`)}
          </label>
        ))}
      </div>
      <p className="text-xs text-navy-500">{t('printSheetPrefs.hint')}</p>
    </Card>
  )
}
