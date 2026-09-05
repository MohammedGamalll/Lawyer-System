import { useLayoutEffect, useRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Input } from './ui'

export function AutoFitInput({
  value,
  onChange,
  maxCh,
  minPx = 12,
  maxPx = 16,
  dir,
  error,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  maxCh: number
  minPx?: number
  maxPx?: number
  dir?: string
  error?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const sizes = [maxPx, 14, minPx]
    for (const px of sizes) {
      el.style.fontSize = `${px}px`
      if (el.scrollWidth <= el.clientWidth + 1) break
    }
  }, [value, maxCh, minPx, maxPx])
  return (
    <Input
      {...rest}
      ref={ref}
      dir={dir}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={error ? 'border-red-500' : undefined}
    />
  )
}
