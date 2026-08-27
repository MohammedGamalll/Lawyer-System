import { Mail, MessageCircle } from 'lucide-react'
import { invoke } from '../lib/api'

function digits(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0') && d.length === 11) return `20${d.slice(1)}`
  return d
}

export function ContactActions({
  phone,
  whatsapp,
  email
}: {
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
}) {
  const waSrc = String(whatsapp || phone || '').trim()
  const mail = String(email || '').trim()
  const wa = waSrc && !waSrc.includes('*') ? digits(waSrc) : ''
  const open = (url: string) => invoke('files:openUrl', url).catch(() => undefined)
  return (
    <span className="inline-flex items-center gap-1">
      {wa ? (
        <button
          type="button"
          title="واتساب"
          className="rounded p-1 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
          onClick={() => open(`https://wa.me/${wa}`)}
        >
          <MessageCircle size={16} />
        </button>
      ) : null}
      {mail && !mail.includes('*') ? (
        <button
          type="button"
          title="بريد"
          className="rounded p-1 text-navy-700 hover:bg-navy-50 dark:text-navy-200"
          onClick={() => open(`mailto:${mail}`)}
        >
          <Mail size={16} />
        </button>
      ) : null}
    </span>
  )
}
