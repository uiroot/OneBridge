import { useEffect, useState } from 'react'
import { Moon, Power, TimerReset, X } from 'lucide-react'
import { POST_ACTION_META } from '@shared/constants'
import { useAppStore } from '../store/app'
import { useNow } from '../lib/utils'

export function PowerCountdownModal(): React.JSX.Element | null {
  const countdown = useAppStore((state) => state.powerCountdown)
  const cancelShutdown = useAppStore((state) => state.cancelShutdown)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow(500)

  useEffect(() => {
    if (!countdown) {
      setDeadline(null)
      return
    }
    setDeadline(Date.now() + Math.max(1, countdown.seconds) * 1000)
  }, [countdown])

  if (!countdown || !deadline) return null

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000))
  const total = Math.max(1, countdown.seconds)
  const percent = Math.max(0, Math.min(100, (remaining / total) * 100))
  const isShutdown = countdown.action === 'shutdown'
  const Icon = isShutdown ? Power : Moon

  const cancel = async (): Promise<void> => {
    setBusy(true)
    try {
      await cancelShutdown()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 90 }}>
      <div className="modal-panel max-w-[420px]" role="alertdialog" aria-modal="true">
        <div className="flex flex-col items-center px-7 pb-2 pt-8 text-center">
          <span
            className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border"
            style={{
              borderColor: 'rgba(251,191,36,.26)',
              background:
                'radial-gradient(circle at 30% 25%, rgba(251,191,36,.2), rgba(251,113,133,.07))'
            }}
          >
            <Icon size={30} className="text-[var(--warning-text)]" />
            <span className="absolute inset-0 animate-ping rounded-full border border-amber-300/10" />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            {isShutdown ? '即将自动关机' : `即将${POST_ACTION_META[countdown.action].shortLabel}`}
          </h2>
          <p className="mt-1.5 max-w-[300px] text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            「{countdown.jobName}」已完成传输。
            {isShutdown ? '电脑将在倒计时结束后关闭。' : '系统操作即将执行。'}
          </p>

          <div className="relative mt-6 flex h-[132px] w-[132px] items-center justify-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="rgba(148,163,184,.12)"
                strokeWidth="6"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#powerGradient)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(percent / 100) * 327} 327`}
                style={{ transition: 'stroke-dasharray .5s linear' }}
              />
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#fb7185" />
                </linearGradient>
              </defs>
            </svg>
            <div className="text-center">
              <div className="font-mono text-[36px] font-semibold leading-none tracking-[-0.04em] text-[var(--text)]">
                {remaining}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                秒
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer !justify-center !border-t-0 !bg-transparent !pb-7">
          <button type="button" className="btn btn-lg" onClick={() => void cancel()} disabled={busy}>
            <X size={14} />
            {busy ? '正在取消…' : '取消操作'}
          </button>
          <button
            type="button"
            className="btn btn-lg btn-soft"
            onClick={() => void cancel()}
            disabled={busy}
          >
            <TimerReset size={14} />
            保持开机
          </button>
        </div>
      </div>
    </div>
  )
}
