import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}): React.JSX.Element {
  return (
    <section className={cn('card', className)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--text)]">{title}</h3>
              {description ? (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('empty-state', compact && '!py-9')}>
      <div className="empty-icon">{icon}</div>
      <h3 className="text-[14px] font-semibold text-[var(--text)]">{title}</h3>
      {description ? (
        <p className="max-w-[360px] text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}
