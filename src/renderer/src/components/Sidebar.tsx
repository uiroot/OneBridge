import {
  ArrowUpDown,
  Cloud,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  Sparkles
} from 'lucide-react'
import { useAppStore } from '../store/app'
import { cn, formatBytes, isActiveStatus } from '../lib/utils'
import { Avatar, StorageBar } from './Visuals'

const NAV_ITEMS = [
  { id: 'dashboard' as const, label: '概览', icon: LayoutDashboard },
  { id: 'tasks' as const, label: '同步任务', icon: RefreshCw },
  { id: 'files' as const, label: '云端文件', icon: Cloud },
  { id: 'transfers' as const, label: '传输队列', icon: ArrowUpDown }
]

export function Sidebar(): React.JSX.Element {
  const {
    page,
    config,
    jobs,
    rclone,
    setPage,
    setTaskGroupFilter,
    taskGroupFilter,
    startLogin
  } = useAppStore()
  const account = config?.account
  const groups = config?.groups || []
  const tasks = config?.tasks || []
  const activeJobs = jobs.filter((job) => isActiveStatus(job.status)).length
  const quota = account?.quota
  const percent = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0

  const handleGroupClick = (groupId: string): void => {
    setTaskGroupFilter(groupId)
    setPage('tasks')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <nav aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={cn('nav-item', active && 'active')}
                onClick={() => setPage(item.id)}
              >
                <Icon size={17} className="nav-icon" strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === 'tasks' && tasks.length > 0 ? (
                  <span className="nav-badge">{tasks.length}</span>
                ) : null}
                {item.id === 'transfers' && activeJobs > 0 ? (
                  <span className="nav-badge">{activeJobs}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-section-title">
          <span>任务分组</span>
          {groups.length > 0 ? (
            <button
              type="button"
              className="rounded p-0.5 text-[10px] font-medium normal-case tracking-normal text-[var(--text-muted)] transition-colors hover:text-[var(--brand-text)]"
              onClick={() => {
                setTaskGroupFilter(null)
                setPage('tasks')
              }}
            >
              管理
            </button>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <button
            type="button"
            className="nav-item !py-2 text-[11.5px] text-[var(--text-muted)]"
            onClick={() => setPage('tasks')}
          >
            <Sparkles size={14} className="nav-icon" />
            创建分组整理任务
          </button>
        ) : (
          <>
            <button
              type="button"
              className={cn(
                'nav-item !py-2 text-[11.5px]',
                page === 'tasks' && taskGroupFilter === null && 'active'
              )}
              onClick={() => {
                setTaskGroupFilter(null)
                setPage('tasks')
              }}
            >
              <span className="group-dot bg-[var(--text-muted)]" />
              全部任务
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">{tasks.length}</span>
            </button>
            {groups.map((group) => {
              const count = tasks.filter((task) => task.groupId === group.id).length
              const active = page === 'tasks' && taskGroupFilter === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  className={cn('nav-item !py-2 text-[11.5px]', active && 'active')}
                  onClick={() => handleGroupClick(group.id)}
                  title={group.name}
                >
                  <span className="group-dot" style={{ background: group.color, color: group.color }} />
                  <span className="truncate">{group.name}</span>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">{count}</span>
                </button>
              )
            })}
          </>
        )}
      </div>

      <div className="flex-none border-t border-[var(--border)] p-3">
        {account && quota ? (
          <button
            type="button"
            className="card card-hover w-full rounded-xl px-3 py-2.5 text-left"
            onClick={() => setPage('settings')}
          >
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text-soft)]">
                <Cloud size={11} className="text-sky-400" />
                OneDrive 空间
              </span>
              <span>{percent.toFixed(0)}%</span>
            </div>
            <StorageBar used={quota.used} total={quota.total} className="mt-2" />
            <div className="mt-1.5 text-[9.5px] text-[var(--text-muted)]">
              {formatBytes(quota.used)} / {formatBytes(quota.total)}
            </div>
          </button>
        ) : (
          <button
            type="button"
            className="card card-hover flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
            onClick={() => {
              if (!rclone?.installed) setPage('settings')
              else void startLogin()
            }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
              <Cloud size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-[10.5px] font-medium text-[var(--text-soft)]">
                {rclone?.installed ? '连接 OneDrive' : '安装传输引擎'}
              </span>
              <span className="block text-[9px] text-[var(--text-muted)]">
                {rclone?.installed ? '查看空间与同步状态' : '点击前往设置'}
              </span>
            </span>
          </button>
        )}

        <div className="mt-2 flex items-center gap-2 px-1 py-1.5">
          <Avatar name={account?.displayName || account?.email || 'OB'} size={27} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-[var(--text-soft)]">
              {account?.displayName || account?.email || '尚未连接账户'}
            </div>
            <div className="truncate text-[9px] text-[var(--text-muted)]">
              {account
                ? `rclone ${rclone?.version || ''}`
                : rclone?.installed
                  ? `rclone ${rclone.version || '已就绪'}`
                  : '传输引擎未安装'}
            </div>
          </div>
          <button
            type="button"
            className={cn('btn btn-ghost btn-icon btn-sm', page === 'settings' && '!bg-[var(--panel-hover)] text-[var(--text)]')}
            onClick={() => setPage('settings')}
            aria-label="设置"
            title="设置"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
