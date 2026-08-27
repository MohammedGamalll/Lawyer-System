import { useEffect, useId, useState } from 'react'
import { invoke } from '../lib/api'
import { Input } from './ui'

export function LookupCombo({
  kind,
  value,
  onChange,
  placeholder
}: {
  kind: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [opts, setOpts] = useState<string[]>([])
  const listId = `lookup-${kind}-${useId().replace(/:/g, '')}`
  useEffect(() => {
    invoke<{ value: string }[]>('lookups:list', kind)
      .then((rows) => setOpts(rows.map((r) => r.value)))
      .catch(() => undefined)
  }, [kind])
  const remember = (v: string) => {
    const t = v.trim()
    if (!t) return
    invoke('lookups:remember', kind, t).catch(() => undefined)
    setOpts((prev) => (prev.includes(t) ? prev : [...prev, t].sort((a, b) => a.localeCompare(b, 'ar'))))
  }
  return (
    <>
      <Input
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => remember(value)}
      />
      <datalist id={listId}>
        {opts.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}
