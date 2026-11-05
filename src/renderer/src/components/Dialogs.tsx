import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Modal } from './Modal'

export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onClose
}: {
  title: ReactNode
  message: ReactNode
  detail?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      title={title}
      icon={
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{
            borderColor: danger ? 'rgba(251,113,133,.24)' : 'rgba(56,189,248,.22)',
            background: danger ? 'rgba(251,113,133,.09)' : 'rgba(56,189,248,.08)',
            color: danger ? 'var(--danger-text)' : 'var(--brand-text)'
          }}
        >
          {danger ? <AlertTriangle size={17} /> : <Info size={17} />}
        </span>
      }
      onClose={() => {
        if (!busy) onClose()
      }}
      widthClass="max-w-[440px]"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await onConfirm()
                onClose()
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-[var(--text-soft)]">{message}</div>
      {detail ? (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {detail}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 break-words rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[11px] text-[var(--danger-text)]">
          {error.replace(/^Error invoking remote method '[^']+':\s*/i, '')}
        </div>
      ) : null}
    </Modal>
  )
}

export function PromptDialog({
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = '确定',
  onConfirm,
  onClose
}: {
  title: ReactNode
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  onConfirm: (value: string) => void | Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const submit = async (): Promise<void> => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('请输入名称')
      return
    }
    if (/[\\/]/.test(trimmed)) {
      setError('名称不能包含斜杠')
      return
    }
    setBusy(true)
    try {
      await onConfirm(trimmed)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose()
      }}
      widthClass="max-w-[420px]"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <label className="label">{label}</label>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit()
        }}
        autoFocus
      />
      {error ? <div className="mt-2 text-[11.5px] text-[var(--danger-text)]">{error}</div> : null}
    </Modal>
  )
}
