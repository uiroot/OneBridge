import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

export interface DropdownItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

export function Dropdown({
  items,
  trigger,
  align = 'right',
  width = 210,
  className
}: {
  items: DropdownItem[]
  trigger: ReactNode
  align?: 'left' | 'right'
  width?: number
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback((): void => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const rect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const gap = 6
    const edge = 8
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight

    const preferredLeft = align === 'right' ? rect.right - width : rect.left
    const left = Math.min(Math.max(edge, preferredLeft), Math.max(edge, viewportWidth - width - edge))
    let top = rect.bottom + gap

    if (top + menuRect.height > viewportHeight - edge) {
      const above = rect.top - menuRect.height - gap
      top = above >= edge ? above : Math.max(edge, viewportHeight - menuRect.height - edge)
    }

    setPosition({ top, left })
  }, [align, width])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    updatePosition()
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    // The menu is rendered in a portal so it cannot be clipped by scrollable
    // tables or cards. Keep it anchored to the trigger as the page moves.
    const handleViewportChange = (): void => updatePosition()
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updatePosition])

  return (
    <div className={cn('relative inline-flex', className)} ref={triggerRef}>
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="menu"
              style={{
                position: 'fixed',
                width,
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? 'visible' : 'hidden'
              }}
              role="menu"
            >
              {items.map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  {item.separatorBefore ? <div className="menu-divider" /> : null}
                  <button
                    type="button"
                    className={cn('menu-item', item.danger && 'danger')}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false)
                      item.onClick()
                    }}
                    role="menuitem"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export function DropdownChevron({
  onClick,
  className
}: {
  onClick?: () => void
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn('btn btn-icon btn-sm', className)}
      onClick={onClick}
      aria-label="更多操作"
    >
      <ChevronDown size={14} />
    </button>
  )
}
