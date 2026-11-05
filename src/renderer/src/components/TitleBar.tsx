import { Copy, Minus, Square, X } from 'lucide-react'
import logo from '../assets/logo.png'
import { PAGE_TITLES } from '@shared/constants'
import { useAppStore } from '../store/app'
import { cn, isActiveStatus } from '../lib/utils'

export function TitleBar(): React.JSX.Element {
  const {
    page,
    config,
    rclone,
    jobs,
    windowMaximized,
    setPage
  } = useAppStore()
  const account = config?.account
  const activeJobs = jobs.filter((job) => isActiveStatus(job.status)).length
  const connected = Boolean(account)
  const engineMissing = rclone?.installed === false

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <img src={logo} alt="" className="h-[22px] w-[22px] rounded-[6px] shadow-lg" />
        <span className="text-[13px] font-[680] tracking-[-0.015em] text-[var(--text)]">
          OneBridge
        </span>
        <span className="badge ml-auto h-[17px] px-1.5 text-[8.5px] tracking-wider">BETA</span>
      </div>

      <div
        className="drag-region flex min-w-0 flex-1 items-center gap-3 px-4"
        onDoubleClick={() => void window.api.toggleMaximizeWindow()}
      >
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          {PAGE_TITLES[page].title}
        </span>
        {activeJobs > 0 ? (
          <button
            type="button"
            className="badge badge-info no-drag transition hover:brightness-110"
            onClick={() => setPage('transfers')}
          >
            <span className="pulse-dot !h-[5px] !w-[5px]" />
            {activeJobs} 个传输任务
          </button>
        ) : null}
        {engineMissing ? (
          <button
            type="button"
            className="badge badge-warning no-drag"
            onClick={() => setPage('settings')}
          >
            传输引擎未安装
          </button>
        ) : null}
      </div>

      <div className="no-drag flex items-stretch">
        <button
          type="button"
          className="flex max-w-[230px] items-center gap-2 px-3 text-[11px] text-[var(--text-soft)] transition-colors hover:bg-[var(--panel-hover)] hover:text-[var(--text)]"
          onClick={() => setPage('settings')}
          title={account?.email || (connected ? 'OneDrive 账户' : '未连接 OneDrive')}
        >
          <span
            className={cn('h-[6px] w-[6px] shrink-0 rounded-full', connected ? 'bg-emerald-400' : 'bg-slate-500')}
            style={connected ? { boxShadow: '0 0 8px rgba(52,211,153,.8)' } : undefined}
          />
          <span className="truncate">
            {connected ? account?.displayName || account?.email || 'OneDrive' : '未连接'}
          </span>
        </button>

        <button
          type="button"
          className="window-control"
          onClick={() => void window.api.minimizeWindow()}
          aria-label="最小化"
        >
          <Minus size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="window-control"
          onClick={() => void window.api.toggleMaximizeWindow()}
          aria-label={windowMaximized ? '还原' : '最大化'}
        >
          {windowMaximized ? (
            <Copy size={13} strokeWidth={1.6} />
          ) : (
            <Square size={12} strokeWidth={1.6} />
          )}
        </button>
        <button
          type="button"
          className="window-control window-control-close"
          onClick={() => void window.api.closeWindow()}
          aria-label="关闭"
        >
          <X size={15} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  )
}
