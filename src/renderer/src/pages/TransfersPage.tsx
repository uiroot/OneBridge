import { useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Gauge,
  History,
  Loader2,
  Pause,
  Play,
  Power,
  Trash2,
  Upload,
  X,
  Zap
} from 'lucide-react'
import type { JobHistoryEntry, JobView } from '@shared/types'
import { POST_ACTION_META } from '@shared/constants'
import { useAppStore } from '../store/app'
import {
  cn,
  formatBytes,
  formatDateTime,
  formatDurationMs,
  formatEta,
  formatSpeed,
  isActiveStatus,
  timeAgo,
  triggerLabel
} from '../lib/utils'
import { ConfirmDialog } from '../components/Dialogs'
import { EmptyState, PageHeader } from '../components/Layout'
import { StatusBadge } from '../components/Visuals'

export function TransfersPage(): React.JSX.Element {
  const jobs = useAppStore((state) => state.jobs)
  const config = useAppStore((state) => state.config)
  const cancelJob = useAppStore((state) => state.cancelJob)
  const pauseJob = useAppStore((state) => state.pauseJob)
  const resumeJob = useAppStore((state) => state.resumeJob)
  const clearCompletedJobs = useAppStore((state) => state.clearCompletedJobs)
  const clearHistory = useAppStore((state) => state.clearHistory)
  const [historyConfirm, setHistoryConfirm] = useState(false)

  const activeJobs = jobs.filter((job) => isActiveStatus(job.status))
  const completedJobs = jobs.filter((job) => !isActiveStatus(job.status))
  const history = config?.history || []
  const transfersPerSecond = activeJobs.reduce((sum, job) => sum + job.progress.speed, 0)
  const sessionBytes = completedJobs.reduce((sum, job) => sum + (job.summary?.bytes || 0), 0)
  const historyBytes = history.reduce((sum, entry) => sum + entry.summary.bytes, 0)

  return (
    <div className="page-shell">
      <PageHeader
        title="传输队列"
        subtitle={
          activeJobs.length
            ? `${activeJobs.length} 个传输进行中 · ${formatSpeed(transfersPerSecond)}`
            : '实时传输进度与历史记录'
        }
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => void clearCompletedJobs()}
              disabled={completedJobs.length === 0}
            >
              <Trash2 size={13} />
              清理已完成
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setHistoryConfirm(true)}
              disabled={history.length === 0}
            >
              <History size={13} />
              清空历史
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Activity size={15} />}
          label="活跃传输"
          value={String(activeJobs.length)}
          hint={activeJobs[0]?.taskName || '队列空闲'}
          tone="sky"
        />
        <SummaryCard
          icon={<Gauge size={15} />}
          label="当前速度"
          value={formatSpeed(transfersPerSecond)}
          hint={activeJobs[0] ? `${activeJobs[0].progress.percentage}% · ${formatEta(activeJobs[0].progress.etaSeconds)}` : '无正在传输的数据'}
          tone="emerald"
        />
        <SummaryCard
          icon={<Download size={15} />}
          label="本次会话"
          value={formatBytes(sessionBytes)}
          hint={`${completedJobs.length} 个已完成任务`}
          tone="indigo"
        />
        <SummaryCard
          icon={<Zap size={15} />}
          label="历史流量"
          value={formatBytes(historyBytes)}
          hint={`${history.length} 条传输记录`}
          tone="amber"
        />
      </div>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-400/10 text-sky-400">
              <Activity size={12} />
            </span>
            正在传输
          </h2>
          <span className="text-[10px] text-[var(--text-muted)]">
            {activeJobs.length ? `${activeJobs.length} 个任务` : '队列空闲'}
          </span>
        </div>
        {activeJobs.length === 0 ? (
          <div className="card">
            <EmptyState
              compact
              icon={<CheckCircle2 size={23} />}
              title="没有正在进行的传输"
              description="运行同步任务或在云端文件页上传、下载文件后，实时进度会显示在这里。"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <ActiveJobCard
                key={job.id}
                job={job}
                onPause={() => void pauseJob(job.id)}
                onResume={() => void resumeJob(job.id)}
                onCancel={() => void cancelJob(job.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-400/10 text-indigo-400">
              <Clock size={12} />
            </span>
            本次会话记录
          </h2>
          <span className="text-[10px] text-[var(--text-muted)]">最多保留 40 条</span>
        </div>
        {completedJobs.length === 0 ? (
          <div className="card px-4 py-5 text-center text-[11px] text-[var(--text-muted)]">
            应用启动后完成的传输会显示在这里，重启后仍可在下方历史记录中查看。
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)] overflow-hidden">
            {completedJobs.map((job) => (
              <CompletedJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-400/10 text-amber-400">
              <History size={12} />
            </span>
            历史记录
          </h2>
          <span className="text-[10px] text-[var(--text-muted)]">持久化保存最近 {history.length}/120 条</span>
        </div>
        {history.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<History size={24} />}
              title="还没有历史记录"
              description="每次同步或文件传输完成后，都会在这里留下结果摘要与日志入口。"
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-[84px]">状态</th>
                  <th>任务</th>
                  <th className="w-[84px]">触发</th>
                  <th className="w-[70px] text-right">文件</th>
                  <th className="w-[100px] text-right">大小</th>
                  <th className="w-[88px] text-right">用时</th>
                  <th className="w-[150px]">完成时间</th>
                  <th className="w-[74px] text-right">日志</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historyConfirm ? (
        <ConfirmDialog
          title="清空传输历史"
          danger
          message="确定清空全部历史记录吗？"
          detail="只会删除记录摘要，不会删除传输日志文件，也不会影响 OneDrive 中的文件。"
          confirmLabel="清空历史"
          onConfirm={async () => {
            await clearHistory()
          }}
          onClose={() => setHistoryConfirm(false)}
        />
      ) : null}
    </div>
  )
}

function SummaryCard({
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
  tone: 'sky' | 'emerald' | 'indigo' | 'amber'
}): React.JSX.Element {
  const colors = {
    sky: { background: 'rgba(56,189,248,.1)', color: '#38bdf8', border: 'rgba(56,189,248,.16)' },
    emerald: { background: 'rgba(52,211,153,.1)', color: '#34d399', border: 'rgba(52,211,153,.16)' },
    indigo: { background: 'rgba(129,140,248,.1)', color: '#818cf8', border: 'rgba(129,140,248,.16)' },
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={colors}>
          {icon}
        </span>
      </div>
    </div>
  )
}

function ActiveJobCard({
  job,
  onPause,
  onResume,
  onCancel
}: {
  job: JobView
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}): React.JSX.Element {
  const cancelling = job.status === 'cancelling'
  const paused = job.status === 'paused'
  const queued = job.status === 'queued'
  const queuedPaused = paused && job.startedAt === 0
  const running = job.status === 'running'

  return (
    <div className={cn('card overflow-hidden', paused && 'ring-1 ring-amber-400/15')}>
      <div className="flex flex-wrap items-start gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            paused
              ? 'border-amber-400/20 bg-amber-400/10 text-amber-400'
              : queued
                ? 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-muted)]'
                : 'border-sky-400/20 bg-sky-400/10 text-sky-400'
          )}
        >
          {paused ? (
            <Pause size={17} />
          ) : queued ? (
            <Clock size={17} />
          ) : (
            <Loader2 size={17} className="animate-spin" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[13px] font-semibold text-[var(--text)]">
              {job.taskName}
            </h3>
            <StatusBadge status={job.status} />
            <span className="badge badge-muted">{triggerLabel[job.trigger]}</span>
            {job.postAction !== 'none' ? (
              <span className="badge badge-warning">
                <Power size={9} />
                {POST_ACTION_META[job.postAction].shortLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate font-mono text-[9.5px] text-[var(--text-muted)]">
            {job.sourceLabel} → {job.destinationLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {job.stepCount > 1 ? (
            <span className="badge badge-muted">
              {(job.activeStepCount || 0) > 1
                ? `并行 ${job.activeStepCount} 个来源 · 已处理 ${job.completedSteps || 0}/${job.stepCount}`
                : `步骤 ${Math.max(1, job.currentStep)}/${job.stepCount}`}
            </span>
          ) : null}
          {paused ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={onResume}>
              <Play size={11} />
              继续
            </button>
          ) : queued || running ? (
            <button type="button" className="btn btn-sm" onClick={onPause}>
              <Pause size={11} />
              暂停
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
            {cancelling ? '取消中…' : '取消'}
          </button>
        </div>
      </div>

      <div className="px-4 py-3.5">
        {queuedPaused ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--warning-text)]">
            <Pause size={12} />
            该任务已从队列中暂停，点击「继续」会重新加入等待队列。
          </div>
        ) : queued ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Clock size={12} />
            等待前面的传输任务完成…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[17px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                  {job.progress.percentage}%
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {formatBytes(job.progress.bytes)} / {formatBytes(job.progress.totalBytes)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <Gauge size={10} /> {paused ? '已暂停' : formatSpeed(job.progress.speed)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} /> 剩余{' '}
                  {paused ? '—' : formatEta(job.progress.etaSeconds)}
                </span>
                {job.progress.errors > 0 ? (
                  <span className="text-[var(--danger-text)]">错误 {job.progress.errors}</span>
                ) : null}
              </div>
            </div>
            <div className="progress progress-lg mt-2.5">
              <span
                className={cn(
                  'progress-bar',
                  running && 'animated',
                  paused && 'is-paused'
                )}
                style={{ width: `${Math.max(2, job.progress.percentage)}%` }}
              />
            </div>

            {paused ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-2 text-[9.5px] leading-relaxed text-[var(--warning-text)]">
                <Pause size={11} className="mt-0.5 shrink-0" />
                <span>
                  传输已暂停，rclone 会话仍保持挂起。点击「继续」会从当前字节接着传输，单个大文件也不会重新开始。
                </span>
              </div>
            ) : null}

            {job.progress.files.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {job.progress.files.slice(0, 5).map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-[9.5px]">
                    <Upload size={9} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="min-w-0 flex-1 truncate text-[var(--text-soft)]" title={file.name}>
                      {file.name}
                    </span>
                    <span className="w-16 shrink-0 font-mono text-right text-[var(--text-muted)]">
                      {file.percentage}%
                    </span>
                    <div className="progress !h-[3px] w-24 shrink-0">
                      <span
                        className={cn('progress-bar', paused && 'is-paused')}
                        style={{ width: `${Math.max(1, file.percentage)}%` }}
                      />
                    </div>
                    <span className="w-[74px] shrink-0 text-right font-mono text-[var(--text-muted)]">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                ))}
                {job.progress.files.length > 5 ? (
                  <div className="pl-[17px] text-[9px] text-[var(--text-muted)]">
                    另有 {job.progress.files.length - 5} 个文件正在传输…
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-2.5 text-[9.5px] text-[var(--text-muted)]">
              <span>文件 {job.progress.transfers}/{job.progress.totalTransfers || '—'}</span>
              <span>检查 {job.progress.checks}</span>
              {job.progress.deletes > 0 ? <span>删除 {job.progress.deletes}</span> : null}
              <span>{job.progress.errors} 个错误</span>
              <span className="ml-auto">开始于 {formatDateTime(job.startedAt || job.queuedAt)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CompletedJobRow({ job }: { job: JobView }): React.JSX.Element {
  const finished = job.finishedAt || Date.now()
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <StatusBadge status={job.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium text-[var(--text-soft)]">{job.taskName}</div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">
          {triggerLabel[job.trigger]} · {job.summary?.files || job.progress.transfers} 个文件 ·{' '}
          {formatDurationMs(job.summary?.elapsedMs || finished - job.startedAt)}
          {job.error ? ` · ${job.error}` : ''}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[10px] text-[var(--text-soft)]">
          {formatBytes(job.summary?.bytes || job.progress.bytes)}
        </div>
        <div className="text-[9px] text-[var(--text-muted)]">{timeAgo(finished)}</div>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        title="打开日志"
        onClick={() => void window.api.openJobLog(job.logName || job.id)}
      >
        <FileText size={13} />
      </button>
    </div>
  )
}

function HistoryRow({ entry }: { entry: JobHistoryEntry }): React.JSX.Element {
  return (
    <tr>
      <td>
        <StatusBadge status={entry.status} />
      </td>
      <td>
        <div className="max-w-[280px] truncate text-[11.5px] text-[var(--text-soft)]" title={entry.taskName}>
          {entry.taskName}
        </div>
        {entry.error ? (
          <div className="mt-0.5 max-w-[280px] truncate text-[9px] text-[var(--danger-text)]" title={entry.error}>
            {entry.error}
          </div>
        ) : null}
      </td>
      <td className="text-[10px] text-[var(--text-muted)]">{triggerLabel[entry.trigger]}</td>
      <td className="text-right font-mono text-[10px] text-[var(--text-soft)]">{entry.summary.files}</td>
      <td className="text-right font-mono text-[10px] text-[var(--text-soft)]">
        {formatBytes(entry.summary.bytes)}
      </td>
      <td className="text-right text-[10px] text-[var(--text-muted)]">
        {formatDurationMs(entry.summary.elapsedMs)}
      </td>
      <td className="text-[10px] text-[var(--text-muted)]">{formatDateTime(entry.finishedAt)}</td>
      <td className="text-right">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          title="打开日志"
          onClick={() => void window.api.openJobLog(entry.logName || entry.jobId)}
        >
          <FileText size={12} />
        </button>
      </td>
    </tr>
  )
}
