import { useTranslation } from 'react-i18next'
import { Button } from './ui'

export function ReorderList({
  items,
  onChange
}: {
  items: { id: string; label: string }[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = items.map((x) => x.id)
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <ol className="max-w-md space-y-1">
      {items.map((item, i) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-2 rounded border border-navy-100 px-2 py-1 dark:border-navy-800"
        >
          <span className="truncate">{item.label}</span>
          <span className="flex gap-1">
            <Button type="button" variant="outline" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
          </span>
        </li>
      ))}
      {!items.length ? <li className="text-sm text-navy-400">{t('noData')}</li> : null}
    </ol>
  )
}
