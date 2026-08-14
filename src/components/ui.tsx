import React from 'react'
import { useTranslation } from 'react-i18next'
import { cva, type VariantProps } from 'class-variance-authority'
import * as Dialog from '@radix-ui/react-dialog'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils'
import { formatCell } from '../lib/datetime'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-navy-800 text-white hover:bg-navy-700',
        gold: 'bg-gold-400 text-navy-950 hover:bg-gold-300 font-semibold',
        ghost: 'hover:bg-navy-50 dark:hover:bg-navy-800 text-navy-800 dark:text-navy-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        outline: 'border border-navy-200 bg-white hover:bg-navy-50 text-navy-800 dark:bg-navy-900 dark:border-navy-700'
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-4'
      }
    },
    defaultVariants: { variant: 'primary', size: 'default' }
  }
)

export function Button({
  children,
  variant = 'primary',
  className,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'flex h-9 w-full rounded-md border border-navy-200 bg-white px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-navy-900 dark:border-navy-700',
        props.className
      )}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'flex min-h-[88px] w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-navy-900 dark:border-navy-700',
        props.className
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'flex h-9 w-full rounded-md border border-navy-200 bg-white px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-navy-900 dark:border-navy-700',
        props.className
      )}
    />
  )
}

export function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <div className="block space-y-1">
      <span className="text-xs font-semibold text-navy-600 dark:text-navy-200">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </div>
  )
}

export function Badge({ children, tone = 'navy' }: { children: React.ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' | 'slate' }) {
  const map = {
    navy: 'bg-navy-100 text-navy-800',
    gold: 'bg-gold-100 text-gold-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-700'
  }
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', map[tone])}>{children}</span>
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-navy-100 bg-white p-4 shadow-card dark:bg-navy-900 dark:border-navy-800', className)}>
      {children}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-950/50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border bg-white p-5 shadow-xl dark:bg-navy-900',
            wide ? 'w-[min(920px,94vw)]' : 'w-[min(520px,94vw)]'
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold text-navy-900 dark:text-white">{title}</Dialog.Title>
            <Dialog.Close className="text-navy-400 hover:text-navy-800">✕</Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function StatusBadge({ value }: { value?: string | null }) {
  const { t } = useTranslation()
  if (!value) return null
  const tone =
    value === 'closed' || value === 'completed' || value === 'paid' || value === 'active' || value === 'done'
      ? 'green'
      : value === 'overdue' || value === 'cancelled'
        ? 'red'
        : value === 'postponed' || value === 'upcoming'
          ? 'gold'
          : 'navy'
  return <Badge tone={tone}>{t(`status.${value}`, { defaultValue: t(`types.${value}`, { defaultValue: value }) })}</Badge>
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

export function ConfirmBar({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>
        {t('cancel')}
      </Button>
      <Button variant="danger" onClick={onConfirm}>
        {t('delete')}
      </Button>
    </div>
  )
}

export function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-navy-100 dark:border-navy-800">
      {items.map((it, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] border-b border-navy-50 last:border-b-0 dark:border-navy-800"
        >
          <div className="bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-600 dark:bg-navy-800 dark:text-navy-200">
            {it.label}
          </div>
          <div className="min-w-0 break-words px-3 py-2 text-sm">{it.value || '—'}</div>
        </div>
      ))}
    </div>
  )
}

export function MiniTable({
  rows,
  keys,
  labels,
  onRowClick
}: {
  rows?: object[]
  keys: string[]
  labels?: string[]
  onRowClick?: (row: Record<string, unknown>) => void
}) {
  const { t, i18n } = useTranslation()
  if (!rows?.length) return <div className="text-sm text-navy-400">{t('noData')}</div>
  const cols = `repeat(${keys.length}, minmax(0, 1fr))`
  const cell = 'min-w-0 overflow-hidden px-3 py-2 text-start align-middle'
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-navy-100 dark:border-navy-800">
      <div className="grid w-full min-w-[480px] text-sm" style={{ gridTemplateColumns: cols }}>
        {keys.map((k, i) => (
          <div
            key={`h-${k}`}
            className={cn(cell, 'border-b border-navy-100 bg-navy-50 font-semibold text-navy-600 dark:border-navy-800 dark:bg-navy-800 dark:text-navy-200')}
          >
            {labels?.[i] || t(`fields.${k}`)}
          </div>
        ))}
        {rows.map((r, ri) =>
          keys.map((k) => {
            const rec = r as Record<string, unknown>
            return (
              <div
                key={`${ri}-${k}`}
                className={cn(
                  cell,
                  'border-b border-navy-50 dark:border-navy-800',
                  onRowClick && 'cursor-pointer hover:bg-navy-50 dark:hover:bg-navy-800'
                )}
                onClick={() => onRowClick?.(rec)}
              >
                {k === 'status' ? (
                  <StatusBadge value={String(rec[k] ?? '')} />
                ) : (
                  formatCell(k, rec[k], i18n.language, t)
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function UiTabs({
  tabs,
  value,
  onValueChange
}: {
  tabs: { id: string; label: string; body: React.ReactNode }[]
  value?: string
  onValueChange?: (v: string) => void
}) {
  const [active, setActive] = React.useState(value || tabs[0]?.id)
  React.useEffect(() => {
    if (value) setActive(value)
  }, [value])
  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={(v) => {
        setActive(v)
        onValueChange?.(v)
      }}
    >
      <TabsPrimitive.List className="mb-3 flex flex-wrap gap-1 rounded-lg bg-navy-50 p-1 dark:bg-navy-800">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.id}
            value={t.id}
            className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:shadow-sm dark:data-[state=active]:bg-navy-900"
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((t) => (
        <TabsPrimitive.Content key={t.id} value={t.id}>
          {t.body}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
