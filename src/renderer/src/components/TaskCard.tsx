import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarClock,
  Cloud,
  FolderTree,
  HardDrive,
  History,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Power,
  RotateCw,
  Trash2
} from 'lucide-react'
import { POST_ACTION_META, SYNC_MODE_META } from '@shared/constants'
import type { JobView, SyncTask, TaskGroup } from '@shared/types'
import { cn, formatCountdown, formatEta, formatSpeed, isActiveStatus, timeAgo, truncateMiddle, useNow } from '../lib/utils'
import { useAppStore } from '../store/app'
import { Dropdown } from './Dropdown'
import { Switch } from './Layout'
import { StatusBadge } from './Visuals'

export function TaskCard({
  task,
  group,
  job,
  onDelete
}: {
  task: SyncTask
  group?: TaskGroup
  job?: JobView
  onDelete: (task: SyncTask) => void
}): React.JSX.Element {
  const runTask = useAppStore((state) => state.runTask)
  const setTaskEnabled = useAppStore((state) => state.setTaskEnabled)
  const pauseJob = useAppStore((state) => state.pauseJob)
  const resumeJob = useAppStore((state) => state.resumeJob)
  const openTaskModal = useAppStore((state) => state.openTaskModal)
  const account = useAppStore((state) => state.config?.account)
  const now = useNow(10_000)

  const mode = SYNC_MODE_META[task.mode]
  const isUpload = task.mode === 'upload' || task.mode === 'mirror-upload'
  const color = group?.color || '#38bdf8'
  const remoteName = account?.remoteName || 'OneDrive'
  const activeJob = job && isActiveStatus(job.status) ? job : undefined
  const status = activeJob
    ? activeJob.status
    : !task.enabled
      ? 'paused'
      : task.lastResult === 'error'
        ? 'error'
        : task.lastResult === 'success'
          ? 'success'
          : 'idle'
  const Icon = isUpload ? ArrowUpToLine : ArrowDownToLine
  const firstPair = task.pairs[0]
  const remoteValue = firstPair
    ? `${remoteName}:/${firstPair.remotePath}`.replace(/\/+$/, '') || `${remoteName}:/`
    : `${remoteName}:/`
  const totalPairs = task.pairs.length

  const intervalLabel =
    task.schedule === 'manual'
      ? '仅手动运行'
      : task.intervalMinutes >= 1440
        ? `每 ${Math.round(task.intervalMinutes / 1440)} 天`
        : task.intervalMinutes >= 60
          ? `每 ${(task.intervalMinutes / 60).toFixed(task.intervalMinutes % 60 ? 1 : 0)} 小时`
          : `每 ${task.intervalMinutes} 分钟`

  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 h-[2px] opacity-70"
        style={{ background: `linear-gradient(90deg, ${color}, transparent 75%)` }}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: 'color-mix(in srgb, currentColor 15%, transparent)',
              background: 'var(--panel-2)',
              color
            }}
          >
            <Icon size={18} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--text)]"
                title={task.name}
              >
                {task.name}
              </h3>
              <StatusBadge status={status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="badge badge-muted h-[18px] px-1.5 text-[9px]">{mode.shortLabel}</span>
              {group ? (
                <span className="badge h-[18px] px-1.5 text-[9px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />
                  {group.name}
                </span>
              ) : null}
              {task.postAction !== 'none' ? (
                <span className="badge badge-warning h-[18px] px-1.5 text-[9px]">
                  <Power size={8} />
                  {POST_ACTION_META[task.postAction].shortLabel}
                </span>
              ) : null}
            </div>
          </div>
          <Dropdown
            width={224}
            items={[
              {
                label: '立即同步',
                icon: <Play size={13} />,
                onClick: () => void runTask(task.id)
              },
              {
                label: '同步后关闭显示器',
                icon: <Monitor size={13} />,
                onClick: () => void runTask(task.id, 'monitor-off')
              },
              {
                label: '同步后关机',
                icon: <Power size={13} />,
                onClick: () => void runTask(task.id, 'shutdown')
              },
              {
                label: task.enabled ? '暂停定时同步' : '恢复定时同步',
                icon: task.enabled ? <Pause size={13} /> : <RotateCw size={13} />,
                separatorBefore: true,
                onClick: () => void setTaskEnabled(task.id, !task.enabled)
              },
              {
                label: '编辑任务',
                icon: <Pencil size={13} />,
                onClick: () => openTaskModal(task)
              },
              {
                label: '删除任务',
                icon: <Trash2 size={13} />,
                danger: true,
                separatorBefore: true,
                onClick: () => onDelete(task)
              }
            ]}
            trigger={
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="任务操作">
                <MoreHorizontal size={15} />
              </button>
            }
          />
        </div>

        <div className="mt-3.5 space-y-1.5">
          <PathLine
            icon={isUpload ? HardDrive : FolderTree}
            label={isUpload ? '本地' : '保存到'}
            value={firstPair ? truncateMiddle(firstPair.localPath, 52) : '未设置路径'}
            title={firstPair?.localPath}
          />
          <PathLine
            icon={Cloud}
            label={isUpload ? '上传到' : '云端'}
            value={truncateMiddle(isUpload ? remoteValue : firstPair?.remotePath || 'OneDrive 根目录', 52)}
            title={isUpload ? remoteValue : firstPair?.remotePath}
            accent
          />
          {totalPairs > 1 ? (
            <div className="pl-[22px] text-[9.5px] text-[var(--text-muted)]">
              另有 {totalPairs - 1} 个来源同时同步
            </div>
          ) : null}
        </div>

        {activeJob ? (
          <div className="mt-3.5 rounded-xl border border-sky-400/15 bg-sky-400/[0.045] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="flex min-w-0 items-center gap-1.5 text-[var(--brand-text)]">
                {activeJob.status === 'paused' ? (
                  <Pause size={11} className="shrink-0 text-amber-400" />
                ) : (
                  <RotateCw size={11} className="shrink-0 animate-spin" />
                )}
                <span className={cn('truncate', activeJob.status === 'paused' && 'text-[var(--warning-text)]')}>
                  {activeJob.status === 'queued'
                    ? '排队等待中…'
                    : activeJob.status === 'paused'
                      ? activeJob.startedAt > 0
                        ? '传输已暂停，点击「继续」恢复'
                        : '排队中的任务已暂停'
                      : activeJob.progress.files[0]?.name || activeJob.sourceLabel || '准备传输'}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--text-soft)]">
                {activeJob.status === 'queued'
                  ? '等待'
                  : `${activeJob.progress.percentage}%`}
              </span>
            </div>
            <div className="progress mt-2 !h-[4px]">
              <span
                className={cn(
                  'progress-bar',
                  activeJob.status === 'running' && 'animated',
                  activeJob.status === 'paused' && 'is-paused'
                )}
                style={{ width: `${Math.max(2, activeJob.progress.percentage)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px] text-[var(--text-muted)]">
              <span className="truncate">
                {activeJob.status === 'paused'
                  ? '从当前字节继续，不会重新传输'
                  : (activeJob.activeStepCount || 0) > 1
                    ? `并行 ${activeJob.activeStepCount} 个来源 · 已处理 ${activeJob.completedSteps || 0}/${activeJob.stepCount}`
                    : `步骤 ${Math.max(1, activeJob.currentStep)}/${activeJob.stepCount} · ${activeJob.trigger === 'schedule' ? '定时' : activeJob.trigger === 'manual' ? '手动' : '文件管理'}`}
              </span>
              <span className="shrink-0 font-mono">
                {activeJob.status === 'paused'
                  ? '已暂停'
                  : `${formatSpeed(activeJob.progress.speed)} · 剩余 ${formatEta(activeJob.progress.etaSeconds)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-1 flex-col justify-end">
            {task.lastResult === 'error' && task.lastError ? (
              <div className="mb-2.5 line-clamp-2 rounded-lg border border-rose-400/15 bg-rose-400/[0.05] px-2.5 py-1.5 text-[9.5px] leading-relaxed text-[var(--danger-text)]">
                {task.lastError}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <CalendarClock size={10} />
                {intervalLabel}
              </span>
              <span className="flex items-center gap-1">
                <History size={10} />
                {task.lastRunAt ? timeAgo(task.lastRunAt, now) : '尚未运行'}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Switch
                  checked={task.enabled}
                  onChange={(value) => void setTaskEnabled(task.id, value)}
                  label={task.enabled ? '暂停任务' : '启用任务'}
                />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
        <div className="min-w-0 flex-1 pl-1 text-[9.5px] text-[var(--text-muted)]">
          {task.schedule === 'interval' && task.enabled ? (
            <>
              下次运行 <span className="text-[var(--text-soft)]">{formatCountdown(task.nextRunAt, now)}</span>
            </>
          ) : (
            <span>{task.enabled ? '手动触发' : '定时同步已暂停'}</span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => openTaskModal(task)}
        >
          <Pencil size={11} />
          编辑
        </button>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          disabled={activeJob?.status === 'cancelling'}
          onClick={() => {
            if (!activeJob) {
              void runTask(task.id)
            } else if (activeJob.status === 'paused') {
              void resumeJob(activeJob.id)
            } else if (activeJob.status === 'queued' || activeJob.status === 'running') {
              void pauseJob(activeJob.id)
            }
          }}
        >
          {activeJob ? (
            activeJob.status === 'paused' ? (
              <Play size={11} />
            ) : activeJob.status === 'cancelling' ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Pause size={11} />
            )
          ) : (
            <Play size={11} />
          )}
          {activeJob
            ? activeJob.status === 'paused'
              ? '继续'
              : activeJob.status === 'cancelling'
                ? '取消中'
                : '暂停'
            : '同步'}
        </button>
      </div>
    </article>
  )
}

function PathLine({
  icon: Icon,
  label,
  value,
  title,
  accent = false
}: {
  icon: typeof Cloud
  label: string
  value: string
  title?: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[10.5px]">
      <Icon
        size={11}
        className={cn('shrink-0', accent ? 'text-sky-400' : 'text-[var(--text-muted)]')}
      />
      <span className="w-[34px] shrink-0 text-[9.5px] text-[var(--text-muted)]">{label}</span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--text-soft)]"
        title={title}
      >
        {value}
      </span>
    </div>
  )
}
