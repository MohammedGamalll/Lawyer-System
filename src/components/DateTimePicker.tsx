import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { daysInMonth, parseDateParts, parseTimeParts, toIsoDate, toIsoTime } from '../lib/datetime'
import { Button, Select } from './ui'

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
]
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function DatePicker({
  value,
  onChange
}: {
  value?: string | number
  onChange: (iso: string) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ar'
  const months = lang === 'en' ? MONTHS_EN : MONTHS_AR
  const now = new Date()
  const parsed = parseDateParts(value ? String(value) : '')
  const empty = !parsed
  const y = parsed?.y ?? now.getFullYear()
  const m = parsed?.m ?? now.getMonth() + 1
  const d = parsed?.d ?? now.getDate()
  const dim = daysInMonth(y, m)
  const day = Math.min(d, dim)
  const years = useMemo(() => {
    const out: number[] = []
    for (let i = now.getFullYear() + 5; i >= 1940; i--) out.push(i)
    return out
  }, [now.getFullYear()])

  const set = (ny: number, nm: number, nd: number) => {
    const max = daysInMonth(ny, nm)
    onChange(toIsoDate(ny, nm, Math.min(nd, max)))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select className="w-[80px]" value={empty ? '' : String(day)} onChange={(e) => set(y, m, Number(e.target.value))}>
        {empty && <option value="">{t('cal.pickDay')}</option>}
        {Array.from({ length: dim }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <Select className="min-w-[120px] flex-1" value={empty ? '' : String(m)} onChange={(e) => set(y, Number(e.target.value), day)}>
        {empty && <option value="">{t('cal.pickMonth')}</option>}
        {months.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </Select>
      <Select className="w-[100px]" value={empty ? '' : String(y)} onChange={(e) => set(Number(e.target.value), m, day)}>
        {empty && <option value="">{t('cal.pickYear')}</option>}
        {years.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))}>
        {t('cal.today')}
      </Button>
    </div>
  )
}

export function TimePicker({
  value,
  onChange
}: {
  value?: string | number
  onChange: (hhmm: string) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ar'
  const parsed = parseTimeParts(value ? String(value) : '')
  const empty = !parsed
  const h = parsed?.h ?? 9
  const min = parsed?.min ?? 0
  const isPm = h >= 12
  const h12 = h % 12 || 12

  const set = (hour12: number, minute: number, pm: boolean) => {
    let hh = hour12 % 12
    if (pm) hh += 12
    onChange(toIsoTime(hh, minute))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select className="w-[80px]" value={empty ? '' : String(h12)} onChange={(e) => set(Number(e.target.value), min, isPm)}>
        {empty && <option value="">{t('cal.hour')}</option>}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <span className="text-navy-400">:</span>
      <Select className="w-[80px]" value={empty ? '' : String(min)} onChange={(e) => set(h12, Number(e.target.value), isPm)}>
        {empty && <option value="">{t('cal.minute')}</option>}
        {Array.from({ length: 60 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </Select>
      <Select className="w-[110px]" value={empty ? '' : isPm ? 'pm' : 'am'} onChange={(e) => set(h12, min, e.target.value === 'pm')}>
        {empty && <option value="">{t('cal.period')}</option>}
        <option value="am">{lang === 'en' ? 'AM' : 'صباحاً'}</option>
        <option value="pm">{lang === 'en' ? 'PM' : 'مساءً'}</option>
      </Select>
    </div>
  )
}

export function DateTimePicker({
  value,
  onChange
}: {
  value?: string | number
  onChange: (iso: string) => void
}) {
  const raw = value ? String(value) : ''
  const datePart = parseDateParts(raw) ? raw.slice(0, 10) : ''
  const timeParsed = parseTimeParts(raw)
  const timePart = timeParsed ? toIsoTime(timeParsed.h, timeParsed.min) : ''
  const fallbackTime = timePart || '09:00'
  const fallbackDate = datePart || toIsoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())
  return (
    <div className="space-y-2">
      <DatePicker value={datePart} onChange={(d) => onChange(`${d}T${fallbackTime}`)} />
      <TimePicker value={timePart} onChange={(tm) => onChange(`${fallbackDate}T${tm}`)} />
    </div>
  )
}
