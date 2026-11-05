import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

export interface ModalProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  widthClass?: string
  bodyClass?: string
  closeOnBackdrop?: boolean
  hideClose?: boolean
  zIndex?: number
}

export function Modal({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  widthClass = 'max-w-[600px]',
  bodyClass,
  closeOnBackdrop = true,
  hideClose = false,
  zIndex
}: ModalProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const timer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
      )
      focusable?.focus()
    }, 80)
    return () => clearTimeout(timer)
  }, [])

  return createPortal(
    <div
      className="modal-backdrop"
      style={zIndex ? { zIndex } : undefined}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={cn('modal-panel', widthClass)}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <div className="shrink-0">{icon}</div> : null}
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                {title}
              </h2>
              {subtitle ? (
                <div className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          {hideClose ? null : (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm shrink-0"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className={cn('modal-body', bodyClass)}>{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
