import { useMemo } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Download,
  FolderPlus,
  HardDriveDownload,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Timer,
  Zap
} from 'lucide-react'
import { GROUP_COLORS } from '@shared/constants'
import type { JobHistoryEntry, JobView, SyncTask } from '@shared/types'
import { useAppStore } from '../store/app'
import {
  cn,
  formatBytes,
  formatCountdown,
  formatEta,
  formatSpeed,
  formatDurationMs,
  isActiveStatus,
  timeAgo,
  useNow
} from '../lib/utils'
import { EmptyState, PageHeader, SectionCard } from '../components/Layout'
import { Avatar, StatusBadge, StorageBar } from '../components/Visuals'

export function Dashboard(): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const rclone = useAppStore((state) => state.rclone)
  const jobs = useAppStore((state) => state.jobs)
  const installing = useAppStore((state) => state.installing)
  const powerCountdown = useAppStore((state) => state.powerCountdown)
  const setPage = useAppStore((state) => state.setPage)
  const runAllTasks = useAppStore((state) => state.runAllTasks)
  const openTaskModal = useAppStore((state) => state.openTaskModal)
  const startLogin = useAppStore((state) => state.startLogin)
  const installRclone = useAppStore((state) => state.installRclone)
  const cancelShutdown = useAppStore((state) => state.cancelShutdown)
  const now = useNow(10_000)

  const account = config?.account
  const tasks = config?.tasks || []
  const groups = config?.groups || []
  const history = config?.history || []
  const activeJobs = jobs.filter((job) => isActiveStatus(job.status))
  const enabledTasks = tasks.filter((task) => task.enabled)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayBytes = history
    .filter((entry) => entry.finishedAt >= todayStart.getTime() && entry.status === 'success')
    .reduce((sum, entry) => sum + entry.summary.bytes, 0)

  const nextTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.enabled && task.schedule === 'interval' && task.nextRunAt)
        .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))
        .slice(0, 4),
    [tasks]
  )
  const recentHistory = history.slice(0, 6)
  const quota = account?.quota
  const quotaPercent = quota && quota.total > 0 ? (quota.used / quota.total) * 100 : 0
  const accountName = account?.displayName || account?.email || '未连接 OneDrive'
  const engineReady = rclone?.installed
  const connected = Boolean(account)

  const setup = !engineReady
    ? {
        icon: Download,
        title: '安装 rclone 传输引擎',
        description: '首次使用需要下载约 30 MB 的传输引擎，之后即可高速上传与下载。',
        action: '立即安装',
        onClick: () => void installRclone()
      }
    : !connected
      ? {
          icon: Cloud,
          title: '连接你的 OneDrive',
          description: '登录 Microsoft 个人账户，开始浏览文件、创建镜像同步任务。',
          action: '连接账户',
          onClick: () => void startLogin()
        }
      : tasks.length === 0
        ? {
            icon: FolderPlus,
            title: '创建第一个同步任务',
            description: '选择任意本地文件或文件夹，直接上传到 OneDrive，不额外占用磁盘。',
            action: '新建任务',
            onClick: () => openTaskModal()
          }
        : null

  return (
    <div className="page-shell">
      <PageHeader
        title="概览"
        subtitle="同步状态、传输队列与账户空间一览"
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setPage('files')}
              disabled={!connected}
            >
              <CloudUpload size={14} />
              上传文件
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void runAllTasks()}
              disabled={!connected || !engineReady || enabledTasks.length === 0}
            >
              <Play size={13} />
              同步全部
            </button>
          </>
        }
      />

      {powerCountdown ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
            <Zap size={15} />
          </span>
          <div className="min-w-0 flex-1 text-[11.5px] text-[var(--text-soft)]">
            「{powerCountdown.jobName}」已完成，电脑将在倒计时结束后执行
            {powerCountdown.action === 'shutdown' ? '关机' : '电源操作'}。
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void cancelShutdown()}>
            取消
          </button>
        </div>
      ) : null}

      {setup ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4"
          style={{
            borderColor: 'rgba(56,189,248,.24)',
            background:
              'linear-gradient(120deg, rgba(56,189,248,.1), rgba(99,102,241,.07) 55%, transparent)'
          }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-400">
            <setup.icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[var(--text)]">{setup.title}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {setup.description}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={setup.onClick}
            disabled={installing}
          >
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {installing ? '正在安装…' : setup.action}
          </button>
        </div>
      ) : null}

      <section className="hero-card mb-4 px-6 py-5 sm:px-7 sm:py-6">
        <div className="relative z-[1] flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-text)]">
              <span className="h-1 w-1 rounded-full bg-sky-400" />
              OneBridge · OneDrive
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <Avatar name={connected ? accountName : 'OB'} size={46} fallback="OB" />
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-semibold tracking-[-0.03em] text-[var(--text)]">
                  {connected ? accountName : '连接到 OneDrive'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                  {connected
                    ? account?.email || '微软个人账户'
                    : engineReady
                      ? '引擎已就绪，等待账户授权'
                      : '先安装传输引擎，再连接账户'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'badge',
                  connected ? 'badge-success' : engineReady ? 'badge-warning' : 'badge-error'
                )}
              >
                {connected ? (
                  <CheckCircle2 size={10} />
                ) : engineReady ? (
                  <Cloud size={10} />
                ) : (
                  <Download size={10} />
                )}
                {connected ? '账户已连接' : engineReady ? '未连接账户' : '引擎未安装'}
              </span>
              <span className="badge">
                <RefreshCw size={9} />
                {enabledTasks.length} 个自动任务
              </span>
              {activeJobs.length > 0 ? (
                <span className="badge badge-running">
                  <Activity size={9} />
                  {activeJobs.length} 个传输进行中
                </span>
              ) : (
                <span className="badge badge-muted">队列空闲</span>
              )}
            </div>
          </div>

          <div className="w-full max-w-[330px] flex-none rounded-2xl border border-white/[0.07] bg-black/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-soft)]">
                <Cloud size={13} className="text-sky-400" />
                OneDrive 存储空间
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {quota ? `${quotaPercent.toFixed(0)}%` : '—'}
              </span>
            </div>
            <StorageBar used={quota?.used || 0} total={quota?.total || 0} className="mt-3" />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-[var(--text)]">
                {quota ? formatBytes(quota.used) : '尚未读取'}
              </span>
              <span className="text-[9.5px] text-[var(--text-muted)]">
                {quota && quota.total > 0 ? `共 ${formatBytes(quota.total)}` : connected ? '等待刷新空间信息' : '连接后显示'}
              </span>
            </div>
            <div className="mt-3 h-px bg-white/[0.06]" />
            <div className="mt-3 flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">今日已传输</span>
              <span className="font-mono text-[11px] text-[var(--text-soft)]">
                {formatBytes(todayBytes)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Layers size={16} />}
          label="同步任务"
          value={String(tasks.length)}
          hint={`${groups.length} 个分组`}
          tone="sky"
        />
        <StatCard
          icon={<RefreshCw size={16} />}
          label="自动同步"
          value={String(enabledTasks.length)}
          hint={enabledTasks.length ? '正在按计划运行' : '暂无启用任务'}
          tone="indigo"
        />
        <StatCard
          icon={<Activity size={16} />}
          label="活跃传输"
          value={String(activeJobs.length)}
          hint={activeJobs[0] ? `${activeJobs[0].progress.percentage}% · ${formatSpeed(activeJobs[0].progress.speed)}` : '当前队列空闲'}
          tone="emerald"
        />
        <StatCard
          icon={<CalendarClock size={16} />}
          label="下次同步"
          value={nextTasks[0] ? formatCountdown(nextTasks[0].nextRunAt, now) : '—'}
          hint={nextTasks[0]?.name || '没有计划任务'}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <SectionCard
          title="传输队列"
          description={activeJobs.length ? '正在进行的同步与文件传输' : '当前没有正在进行的传输'}
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
              <Activity size={14} />
            </span>
          }
          actions={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage('transfers')}>
              查看全部
              <ArrowRight size={12} />
            </button>
          }
          bodyClassName="!px-3 !py-2"
        >
          {activeJobs.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={23} />}
              title="队列空闲"
              description={
                nextTasks[0]
                  ? `下一个任务「${nextTasks[0].name}」将在 ${formatCountdown(nextTasks[0].nextRunAt, now)} 自动开始。`
                  : '点击「同步全部」立即运行已启用的任务，或创建新的同步规则。'
              }
              action={
                tasks.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => void runAllTasks()}
                    disabled={!connected}
                  >
                    <Play size={11} />
                    立即同步
                  </button>
                ) : (
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => openTaskModal()}>
                    <Plus size={11} />
                    新建任务
                  </button>
                )
              }
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activeJobs.slice(0, 4).map((job) => (
                <DashboardJobRow key={job.id} job={job} onClick={() => setPage('transfers')} />
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="计划任务"
            description="按同步间隔自动运行的任务"
            icon={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-400">
                <Timer size={14} />
              </span>
            }
            actions={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage('tasks')}>
                管理
              </button>
            }
            bodyClassName="!px-3 !py-2"
          >
            {nextTasks.length === 0 ? (
              <div className="px-2 py-6 text-center text-[11px] text-[var(--text-muted)]">
                没有启用自动同步的任务
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {nextTasks.map((task) => (
                  <ScheduledRow key={task.id} task={task} now={now} groups={groups} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="快捷操作" icon={<Sparkles size={14} className="text-amber-400" />} bodyClassName="!p-3">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                icon={<Plus size={14} />}
                label="新建任务"
                onClick={() => openTaskModal()}
              />
              <QuickAction
                icon={<CloudUpload size={14} />}
                label="上传文件"
                onClick={() => setPage('files')}
                disabled={!connected}
              />
              <QuickAction
                icon={<HardDriveDownload size={14} />}
                label="浏览云端"
                onClick={() => setPage('files')}
                disabled={!connected}
              />
              <QuickAction
                icon={<Settings2 size={14} />}
                label="设置"
                onClick={() => setPage('settings')}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4">
        <SectionCard
          title="最近活动"
          description="最近的同步与传输结果"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <Activity size={14} />
            </span>
          }
          actions={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage('transfers')}>
              历史记录
              <ArrowRight size={12} />
            </button>
          }
          bodyClassName="!px-3 !py-2"
        >
          {recentHistory.length === 0 ? (
            <div className="px-2 py-7 text-center text-[11px] text-[var(--text-muted)]">
              还没有传输记录，运行任务后会在这里显示。
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentHistory.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone: 'sky' | 'indigo' | 'emerald' | 'amber'
}): React.JSX.Element {
  const colors = {
    sky: { background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: 'rgba(56,189,248,.16)' },
    indigo: { background: 'rgba(129,140,248,.1)', color: '#818cf8', border: 'rgba(129,140,248,.16)' },
    emerald: { background: 'rgba(52,211,153,.1)', color: '#34d399', border: 'rgba(52,211,153,.16)' },
    amber: { background: 'rgba(251,191,36,.1)', color: '#fbbf24', border: 'rgba(251,191,36,.16)' }
  }[tone]
  return (
    <div className="card stat-card card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {label}
          </div>
          <div className="mt-2 truncate text-[21px] font-semibold leading-none tracking-[-0.03em] text-[var(--text)]">
            {value}
          </div>
          <div className="mt-2 truncate text-[9.5px] text-[var(--text-muted)]" title={hint}>
            {hint}
          </div>
        </div>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
          style={colors}
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

function DashboardJobRow({ job, onClick }: { job: JobView; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-[var(--panel-hover)]"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11.5px]">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            job.status === 'paused'
              ? 'bg-amber-400/10 text-amber-400'
              : 'bg-sky-400/10 text-sky-400'
          )}
        >
          {job.status === 'paused' ? (
            <Pause size={13} />
          ) : job.status === 'queued' ? (
            <Timer size={13} />
          ) : (
            <Loader2 size={13} className="animate-spin" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">{job.taskName}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-[var(--text-soft)]">
          {job.status === 'paused'
            ? job.startedAt > 0
              ? `已暂停 · ${job.progress.percentage}%`
              : '排队已暂停'
            : job.status === 'queued'
              ? '排队中'
              : `${job.progress.percentage}%`}
        </span>
        <ArrowUpRight size={12} className="shrink-0 text-[var(--text-muted)]" />
      </div>
      <div className="progress mt-2 !h-[4px]">
        <span
          className={cn(
            'progress-bar',
            job.status === 'running' && 'animated',
            job.status === 'paused' && 'is-paused'
          )}
          style={{ width: `${Math.max(2, job.progress.percentage)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px] text-[var(--text-muted)]">
        <span className="truncate">
          {job.sourceLabel} → {job.destinationLabel}
        </span>
        <span className="shrink-0 font-mono">
          {job.status === 'paused'
            ? '已暂停'
            : `${formatSpeed(job.progress.speed)} · ${formatEta(job.progress.etaSeconds)}`}
        </span>
      </div>
    </button>
  )
}

function ScheduledRow({
  task,
  now,
  groups
}: {
  task: SyncTask
  now: number
  groups: Array<{ id: string; name: string; color: string }>
}): React.JSX.Element {
  const group = groups.find((item) => item.id === task.groupId)
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ background: group?.color || GROUP_COLORS[0], opacity: 0.8 }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-soft)]">{task.name}</div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">
          {group?.name || '未分组'} · 每 {task.intervalMinutes} 分钟
        </div>
      </div>
      <span className="shrink-0 text-[9.5px] font-medium text-[var(--brand-text)]">
        {formatCountdown(task.nextRunAt, now)}
      </span>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled = false
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-left text-[10.5px] font-medium text-[var(--text-soft)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--panel-hover)] hover:text-[var(--text)] disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      {label}
    </button>
  )
}

function HistoryRow({ entry }: { entry: JobHistoryEntry }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <StatusBadge status={entry.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-soft)]">{entry.taskName}</div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">
          {timeAgo(entry.finishedAt)} · {entry.trigger === 'schedule' ? '定时' : entry.trigger === 'manual' ? '手动' : '文件管理'}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[10px] text-[var(--text-soft)]">{formatBytes(entry.summary.bytes)}</div>
        <div className="text-[9px] text-[var(--text-muted)]">
          {entry.summary.files} 个文件 · {formatDurationMs(entry.summary.elapsedMs)}
        </div>
      </div>
    </div>
  )
}
