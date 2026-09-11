import { useTranslation } from 'react-i18next'
import { Field, Input } from './ui'

export function PartyRatingCard({
  rating,
  blacklisted,
  note,
  onChange,
  canEdit
}: {
  rating: number
  blacklisted: boolean
  note: string
  onChange: (patch: { rating?: number; is_blacklisted?: number; blacklist_note?: string }) => void
  canEdit?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 rounded-lg border border-navy-100 p-3 dark:border-navy-800">
      <div className="text-xs font-bold text-navy-500">{t('party.rating')}</div>
      <div className="flex flex-wrap items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!canEdit}
            className={`text-lg ${n <= rating ? 'text-gold-400' : 'text-navy-300'}`}
            onClick={() => canEdit && onChange({ rating: n === rating ? 0 : n })}
            aria-label={`${n}`}
          >
            ★
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={blacklisted}
          onChange={(e) => canEdit && onChange({ is_blacklisted: e.target.checked ? 1 : 0 })}
        />
        {t('party.blacklist')}
      </label>
      {blacklisted ? (
        <Field label={t('party.blacklistNote')}>
          <Input
            disabled={!canEdit}
            value={note}
            onChange={(e) => onChange({ blacklist_note: e.target.value })}
          />
        </Field>
      ) : null}
      {blacklisted ? (
        <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {t('party.blacklistWarn')}
        </p>
      ) : null}
    </div>
  )
}

export function BlacklistBanner({ show, name }: { show: boolean; name?: string }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      {t('party.blacklistPick', { name: name || '' })}
    </div>
  )
}
