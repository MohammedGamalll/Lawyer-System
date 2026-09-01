import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { cleanPartyName } from '../lib/partyName'

export function AndOthers({
  primary,
  extraNames,
  extraCount
}: {
  primary: string
  extraNames?: unknown
  extraCount?: unknown
}) {
  const { t } = useTranslation()
  const names = String(extraNames ?? '')
    .split(/[،,]/)
    .map((s) => cleanPartyName(s.trim()))
    .filter(Boolean)
  const shown = cleanPartyName(primary)
  const n = Number(extraCount ?? names.length) || names.length
  if (!shown) return <span>—</span>
  if (n <= 0 && names.length === 0) return <span>{shown}</span>
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-1">
      <span className="truncate">{shown}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            data-no-row
            className="shrink-0 rounded bg-navy-100 px-1.5 py-0.5 text-[11px] font-bold text-navy-800 hover:bg-gold-200 dark:bg-navy-800 dark:text-white"
          >
            {t('andOthers')}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 max-w-xs rounded-md border border-navy-100 bg-white p-2 text-sm shadow-lg dark:border-navy-700 dark:bg-navy-900"
          >
            {names.length ? (
              names.map((name) => (
                <div key={name} className="px-1 py-0.5">
                  {name}
                </div>
              ))
            ) : (
              <div className="px-1 text-navy-500">{n}</div>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  )
}
