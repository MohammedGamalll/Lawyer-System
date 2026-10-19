import { invoke } from './api'
import { formatCourtNumber, formatProgramCode } from './courtNumber'
import { formatDate } from './datetime'

export function composeWhatsAppShare(
  row: Record<string, unknown>,
  t: (key: string) => string,
  lang = 'ar'
): string {
  const code = formatProgramCode(row)
  const court = formatCourtNumber(row)
  const parties = [row.client_name, row.opponent_name].map((v) => String(v || '').trim()).filter(Boolean).join(' / ')
  const date = formatDate(String(row.hearing_date || ''), lang)
  const decision = String(row.court_decision || row.previous_decision || '').trim()
  return [
    code ? `${t('fields.program_code')}: ${code}` : '',
    court && court !== '—' ? `${t('fields.court_number')}: ${court}` : '',
    parties ? `${t('fields.parties')}: ${parties}` : '',
    date && date !== '—' ? `${t('fields.hearing_date')}: ${date}` : '',
    decision ? `${t('fields.court_decision')}: ${decision}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function openWhatsAppShare(text: string) {
  const body = String(text || '').trim()
  if (!body) return Promise.resolve()
  return invoke('files:openUrl', `https://wa.me/?text=${encodeURIComponent(body)}`)
}
