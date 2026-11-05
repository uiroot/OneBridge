import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AppSettings,
  CheckMode,
  FileProgress,
  JobProgress,
  JobStatus,
  JobSummary,
  JobTrigger,
  JobView,
  PostAction,
  SyncTask
} from '@shared/types'
import { killProcess, RcloneManager } from './rclone'
import { setProcessSuspended } from './process-control'
import { log } from './logger'
import { proxyEnv } from './proxy'

export interface JobStep {
  action: 'copy' | 'copyto' | 'sync'
  source: string
  destination: string
  sourceLabel: string
  destinationLabel: string
}

export interface EnqueueJobInput {
  taskId?: string
  taskName: string
  trigger: JobTrigger
  steps: JobStep[]
  postAction: PostAction
  checkMode?: CheckMode
  excludes?: string[]
  bandwidthLimit?: string
}

interface FinishedPayload {
  job: JobView
  taskId?: string
  postAction: PostAction
}

interface InternalJob {
  view: JobView
  steps: JobStep[]
  checkMode: CheckMode
  excludes: string[]
  bandwidthLimit: string
  cancelRequested: boolean
  finished: boolean
  paused: boolean
  suspended: boolean
  pauseWaiters: Array<() => void>
  children: Map<number, ChildProcessWithoutNullStreams>
  logStream: fs.WriteStream | null
  lastEmit: number
}

interface RcloneStat {
  bytes?: number
  totalBytes?: number
  speed?: number
  eta?: number | null
  transfers?: number
  totalTransfers?: number
  checks?: number
  errors?: number
  deletes?: number
  transferring?: Array<{
    name?: string
    bytes?: number
    size?: number
    percentage?: number
    speed?: number
  }>
}

interface RcloneJsonLog {
  level?: string
  msg?: string
  stats?: RcloneStat
}

const EMPTY_PROGRESS: JobProgress = {
  bytes: 0,
  totalBytes: 0,
  percentage: 0,
  speed: 0,
  etaSeconds: null,
  transfers: 0,
  totalTransfers: 0,
  checks: 0,
  errors: 0,
  deletes: 0,
  files: []
}

export function isJobActive(status: JobStatus): boolean {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'cancelling'
  )
}

export class JobRunner extends EventEmitter {
  private jobs = new Map<string, InternalJob>()
  private queue: string[] = []
  private activeId: string | null = null
  private processing = false
  private logDir: string

  constructor(
    private readonly rclone: RcloneManager,
    private readonly getSettings: () => AppSettings
  ) {
    super()
    this.logDir = path.join(app.getPath('userData'), 'logs', 'jobs')
    fs.mkdirSync(this.logDir, { recursive: true })
  }

  getJobs(): JobView[] {
    return [...this.jobs.values()]
      .sort((a, b) => {
        const weight = (job: InternalJob): number => {
          const status = job.view.status
          if (status === 'running' || status === 'cancelling') return 0
          if (status === 'paused') return job.view.startedAt > 0 ? 0 : 1
          if (status === 'queued') return 1
          return 2
        }
        const diff = weight(a) - weight(b)
        return diff !== 0 ? diff : b.view.queuedAt - a.view.queuedAt
      })
      .map((job) => job.view)
  }

  hasRunningJobs(): boolean {
    return [...this.jobs.values()].some((job) => isJobActive(job.view.status))
  }

  hasPendingTask(taskId: string): boolean {
    return [...this.jobs.values()].some(
      (job) => job.view.taskId === taskId && isJobActive(job.view.status)
    )
  }

  enqueue(input: EnqueueJobInput): JobView {
    if (!input.steps.length) throw new Error('没有可执行的传输步骤')
    if (input.taskId && this.hasPendingTask(input.taskId)) {
      throw new Error('该任务正在运行或已在队列中')
    }
    const id = randomUUID()
    const logName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}.log`
    const logStream = fs.createWriteStream(path.join(this.logDir, logName), { flags: 'a' })
    logStream.write(
      `[OneBridge] ${new Date().toISOString()} 创建任务 ${input.taskName}\n` +
        `[OneBridge] 步骤数: ${input.steps.length}, 触发方式: ${input.trigger}\n`
    )
    const view: JobView = {
      id,
      taskId: input.taskId,
      taskName: input.taskName,
      trigger: input.trigger,
      status: 'queued',
      progress: { ...EMPTY_PROGRESS },
      startedAt: 0,
      currentStep: 0,
      stepCount: input.steps.length,
      completedSteps: 0,
      activeStepCount: 0,
      sourceLabel: input.steps[0]?.sourceLabel || '',
      destinationLabel: input.steps[0]?.destinationLabel || '',
      postAction: input.postAction,
      logName,
      queuedAt: Date.now()
    }
    const job: InternalJob = {
      view,
      steps: input.steps,
      checkMode: input.checkMode || 'size-time',
      excludes: input.excludes || [],
      bandwidthLimit: input.bandwidthLimit || '',
      cancelRequested: false,
      finished: false,
      paused: false,
      suspended: false,
      pauseWaiters: [],
      children: new Map(),
      logStream,
      lastEmit: 0
    }
    this.jobs.set(id, job)
    this.queue.push(id)
    this.trimFinished()
    this.broadcast(job, true)
    log('info', `任务入队：${input.taskName}`, { id, steps: input.steps.length })
    void this.processQueue()
    return view
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()
        if (!id) break
        const job = this.jobs.get(id)
        if (!job || job.view.status !== 'queued') continue
        this.activeId = id
        await this.runJob(job)
        this.activeId = null
      }
    } finally {
      this.processing = false
    }
  }

  private async runJob(job: InternalJob): Promise<void> {
    const settings = this.getSettings()
    const view = job.view
    view.status = 'running'
    view.startedAt = Date.now()
    view.progress = { ...EMPTY_PROGRESS }
    view.completedSteps = 0
    view.activeStepCount = 0
    this.broadcast(job, true)
    this.writeLog(job, `[OneBridge] 开始执行 ${new Date().toISOString()}`)

    const stepCount = job.steps.length
    // Run several pairs at once so a large file is not stuck behind thousands of
    // tiny files from another pair. The total number of transfers/checkers stays
    // within the user's global settings: 12 transfers across 6 pairs gives each
    // pair 2 transfer slots instead of opening 72 competing requests.
    const parallel = Math.max(
      1,
      Math.min(stepCount, Math.floor(Math.max(1, settings.transfers) / 2), 6)
    )
    const transfersPerStep = Math.max(1, Math.floor(settings.transfers / parallel))
    const checkersPerStep = Math.max(1, Math.floor(settings.checkers / parallel))

    const stepStats: Array<RcloneStat | null> = new Array(stepCount).fill(null)
    const stepErrors: Array<string | null> = new Array(stepCount).fill(null)
    const activeIndexes = new Set<number>()
    let nextIndex = 0
    let completedSteps = 0
    let failedSteps = 0
    let failed = false

    const publish = (force = false): void => {
      if (job.finished) return
      let bytes = 0
      let totalBytes = 0
      let speed = 0
      let transfers = 0
      let totalTransfers = 0
      let checks = 0
      let errors = 0
      let deletes = 0
      const files: FileProgress[] = []
      for (const stats of stepStats) {
        if (!stats) continue
        const statBytes = Number(stats.bytes) || 0
        bytes += statBytes
        totalBytes += Math.max(Number(stats.totalBytes) || 0, statBytes)
        speed += Number(stats.speed) || 0
        transfers += Number(stats.transfers) || 0
        totalTransfers += Number(stats.totalTransfers) || 0
        checks += Number(stats.checks) || 0
        errors += Number(stats.errors) || 0
        deletes += Number(stats.deletes) || 0
        for (const file of (stats.transferring || []).slice(0, 4)) {
          files.push({
            name: file.name || '',
            bytes: Number(file.bytes) || 0,
            size: Number(file.size) || 0,
            percentage: Number(file.percentage) || 0,
            speed: Number(file.speed) || 0
          })
        }
      }
      files.sort((a, b) => b.speed - a.speed)
      errors += failedSteps
      const eta =
        speed > 0 && totalBytes > bytes ? Math.ceil((totalBytes - bytes) / speed) : null
      view.completedSteps = completedSteps
      view.activeStepCount = activeIndexes.size
      view.currentStep = Math.min(
        stepCount,
        completedSteps + (activeIndexes.size > 0 ? 1 : 0)
      )
      if (activeIndexes.size === 1) {
        const index = [...activeIndexes][0]
        view.sourceLabel = job.steps[index].sourceLabel
        view.destinationLabel = job.steps[index].destinationLabel
      } else if (activeIndexes.size > 1) {
        view.sourceLabel = `${activeIndexes.size} 个来源并行传输`
        view.destinationLabel = `${activeIndexes.size} 个云端目标`
      }
      view.progress = {
        bytes,
        totalBytes,
        percentage: totalBytes > 0 ? Math.min(99, Math.round((bytes / totalBytes) * 100)) : 0,
        speed,
        etaSeconds: eta,
        transfers,
        totalTransfers,
        checks,
        errors,
        deletes,
        files: files.slice(0, 8)
      }
      this.broadcast(job, force)
    }

    const runStep = async (index: number): Promise<void> => {
      if (job.cancelRequested || failed) return
      if (job.paused) await this.waitWhilePaused(job)
      if (job.cancelRequested || failed) return

      const step = job.steps[index]
      activeIndexes.add(index)
      view.activeStepCount = activeIndexes.size
      view.currentStep = Math.min(stepCount, completedSteps + 1)
      this.broadcast(job, true)

      const args = buildArgs(
        step,
        settings,
        this.rclone.getConfigPath(),
        job,
        view.taskId,
        { transfers: transfersPerStep, checkers: checkersPerStep }
      )
      this.writeLog(
        job,
        `\n[OneBridge] 步骤 ${index + 1}/${stepCount} 开始（并行 ${parallel} 个来源，每个 ${transfersPerStep} 个传输）: rclone ${args.join(' ')}\n`
      )

      const exitCode = await this.runRcloneStep(
        job,
        index,
        args,
        (stats) => {
          if (job.paused) return
          stepStats[index] = stats
          publish()
        },
        (message) => {
          if (message) stepErrors[index] = message
        }
      )

      activeIndexes.delete(index)
      if (exitCode !== 0 && exitCode !== 9 && !job.cancelRequested) {
        failed = true
        failedSteps += 1
        if (!stepErrors[index]) {
          stepErrors[index] =
            `rclone 进程退出，代码 ${exitCode === null ? '未知' : exitCode}`
        }
        this.writeLog(
          job,
          `[OneBridge] 步骤 ${index + 1}/${stepCount} 失败：${stepErrors[index]}`
        )
      } else {
        this.writeLog(
          job,
          `[OneBridge] 步骤 ${index + 1}/${stepCount} 完成（exit ${exitCode}）`
        )
      }
      completedSteps += 1
      view.completedSteps = completedSteps
      view.activeStepCount = activeIndexes.size
      view.currentStep = Math.min(
        stepCount,
        completedSteps + (activeIndexes.size > 0 ? 1 : 0)
      )
      publish(true)
    }

    const workers = Array.from({ length: parallel }, async () => {
      while (true) {
        if (job.cancelRequested || failed) return
        if (job.paused) {
          await this.waitWhilePaused(job)
          continue
        }
        const index = nextIndex
        nextIndex += 1
        if (index >= stepCount) return
        await runStep(index)
      }
    })

    await Promise.all(workers)

    const summary: JobSummary = {
      bytes: view.progress.bytes,
      files: view.progress.transfers,
      // Killing rclone during a cancel makes it report context-cancelled
      // errors. Those are a consequence of the user's cancel, not real
      // transfer failures.
      errors: job.cancelRequested ? failedSteps : view.progress.errors,
      elapsedMs: Date.now() - view.startedAt,
      checks: view.progress.checks,
      deletes: view.progress.deletes
    }

    if (job.cancelRequested) {
      this.finalize(job, 'cancelled', '已取消', summary)
      return
    }
    if (failed) {
      const firstError =
        stepErrors.find((message) => Boolean(message)) || '部分来源传输失败'
      this.finalize(job, 'error', firstError, summary)
      return
    }
    this.finalize(job, 'success', undefined, summary)
  }

  private runRcloneStep(
    job: InternalJob,
    stepIndex: number,
    args: string[],
    onStats: (stats: RcloneStat) => void,
    onErrorLine: (message: string) => void
  ): Promise<number | null> {
    return new Promise((resolve) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(this.rclone.getBinaryPath(), args, {
          windowsHide: true,
          env: {
            ...process.env,
            ...proxyEnv(this.getSettings()),
            RCLONE_CONFIG: this.rclone.getConfigPath(),
            NO_COLOR: '1'
          }
        })
      } catch (error) {
        onErrorLine(error instanceof Error ? error.message : String(error))
        resolve(1)
        return
      }
      job.children.set(stepIndex, child)
      // A pause can arrive between the step-level check and the process
      // actually starting. Suspend it immediately so the UI state matches
      // reality; without this guard a short step could keep running. Each
      // parallel step is checked separately because job.suspended only means
      // the children that existed when pause was pressed are suspended.
      if (job.paused && child.pid) {
        try {
          setProcessSuspended(child.pid, true)
          job.suspended = true
        } catch (error) {
          this.writeLog(
            job,
            `[OneBridge] 暂停新启动的传输进程失败：${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      let buffer = ''
      const handleLine = (line: string): void => {
        if (!line.trim()) return
        this.writeLog(job, line)
        if (line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line) as RcloneJsonLog
            if (parsed.stats) onStats(parsed.stats)
            if (parsed.level === 'error' && parsed.msg) {
              onErrorLine(parsed.msg.trim().slice(0, 600))
            }
            return
          } catch {
            // not JSON, fall through
          }
        }
        if (/error|failed|fatal/i.test(line) && !/retry/i.test(line)) {
          onErrorLine(
            line
              .trim()
              .replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} [A-Z]+:\s*/, '')
              .replace(/^Fatal error:\s*/i, '')
              .slice(0, 600)
          )
        }
      }
      const attach = (stream: NodeJS.ReadableStream | null): void => {
        stream?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8')
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const line of lines) handleLine(line)
        })
      }
      attach(child.stdout)
      attach(child.stderr)
      child.on('error', (error) => {
        onErrorLine(error.message)
        if (job.children.get(stepIndex) === child) job.children.delete(stepIndex)
        if (job.children.size === 0) job.suspended = false
        resolve(1)
      })
      child.on('close', (code) => {
        if (buffer.trim()) handleLine(buffer)
        if (job.children.get(stepIndex) === child) job.children.delete(stepIndex)
        if (job.children.size === 0) job.suspended = false
        resolve(code)
      })
    })
  }

  private finalize(
    job: InternalJob,
    status: Exclude<JobStatus, 'queued' | 'running' | 'paused' | 'cancelling'>,
    error: string | undefined,
    summary: JobSummary
  ): void {
    if (job.finished) return
    job.finished = true
    const view = job.view
    view.status = status
    view.finishedAt = Date.now()
    view.summary = summary
    view.error = status === 'success' ? undefined : error
    if (status === 'success') {
      view.progress.percentage = 100
      view.progress.etaSeconds = 0
    }
    view.progress.files = []
    view.activeStepCount = 0
    view.progress.bytes = Math.max(view.progress.bytes, summary.bytes)
    view.progress.totalBytes = Math.max(
      view.progress.totalBytes,
      view.progress.bytes,
      summary.bytes
    )
    if (summary.files > 0) view.progress.transfers = summary.files
    if (summary.errors > 0) view.progress.errors = summary.errors

    this.writeLog(
      job,
      `[OneBridge] 结束：${status}，传输 ${summary.files} 个文件，${summary.bytes} 字节，耗时 ${summary.elapsedMs}ms` +
        (error ? `，错误：${error}` : '')
    )
    job.logStream?.end()
    job.logStream = null
    this.broadcast(job, true)
    this.emit('finished', {
      job: view,
      taskId: view.taskId,
      postAction: view.postAction
    } satisfies FinishedPayload)
    this.trimFinished()
  }

  private broadcast(job: InternalJob, force = false): void {
    const now = Date.now()
    if (!force && now - job.lastEmit < 650) return
    job.lastEmit = now
    this.emit('update', job.view)
  }

  private writeLog(job: InternalJob, line: string): void {
    try {
      job.logStream?.write(`${line}\n`)
    } catch {
      // ignore log write failure
    }
  }

  /**
   * Pause a running transfer by suspending the rclone process. Because the
   * process keeps its memory, open download stream and OneDrive upload session,
   * resuming continues from the current byte instead of restarting the file.
   * Queued jobs are removed from the queue and restored when resumed.
   */
  pause(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('传输任务不存在')
    if (job.finished) throw new Error('传输任务已结束')
    if (job.view.status === 'paused') return
    if (job.view.status === 'queued') {
      job.paused = true
      this.queue = this.queue.filter((id) => id !== jobId)
      job.view.status = 'paused'
      job.view.progress.speed = 0
      job.view.progress.etaSeconds = null
      this.writeLog(job, '[OneBridge] 排队任务已暂停')
      this.broadcast(job, true)
      return
    }
    if (job.view.status !== 'running') throw new Error('当前传输状态无法暂停')

    job.paused = true
    job.view.status = 'paused'
    job.view.progress.speed = 0
    job.view.progress.etaSeconds = null
    const children = [...job.children.values()].filter((child) => Boolean(child.pid))
    if (children.length > 0) {
      const suspended: ChildProcessWithoutNullStreams[] = []
      try {
        for (const child of children) {
          setProcessSuspended(child.pid as number, true)
          suspended.push(child)
        }
        job.suspended = true
      } catch (error) {
        for (const child of suspended) {
          try {
            setProcessSuspended(child.pid as number, false)
          } catch {
            // Best effort rollback; the process will be cleaned up on cancel.
          }
        }
        job.paused = false
        job.view.status = 'running'
        this.broadcast(job, true)
        throw error
      }
    }
    this.writeLog(
      job,
      job.suspended
        ? '[OneBridge] 传输已暂停（rclone 进程已挂起）'
        : '[OneBridge] 传输已暂停（将在下一步前等待）'
    )
    this.broadcast(job, true)
  }

  resume(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('传输任务不存在')
    if (job.view.status !== 'paused') return

    if (job.view.startedAt > 0) {
      if (job.suspended) {
        for (const [index, child] of [...job.children]) {
          if (!child.pid) continue
          try {
            setProcessSuspended(child.pid, false)
          } catch (error) {
            if (job.children.get(index) === child) {
              this.writeLog(
                job,
                `[OneBridge] 恢复传输进程失败（可能已退出）：${
                  error instanceof Error ? error.message : String(error)
                }`
              )
            }
          }
        }
        job.suspended = false
      }
      job.paused = false
      job.view.status = 'running'
      job.view.progress.etaSeconds = null
      this.writeLog(job, '[OneBridge] 传输已继续')
      this.releasePauseWaiters(job)
      this.broadcast(job, true)
      return
    }

    job.paused = false
    job.view.status = 'queued'
    if (!this.queue.includes(jobId)) this.queue.unshift(jobId)
    this.writeLog(job, '[OneBridge] 排队任务已继续')
    this.broadcast(job, true)
    void this.processQueue()
  }

  private waitWhilePaused(job: InternalJob): Promise<void> {
    if (!job.paused) return Promise.resolve()
    return new Promise((resolve) => {
      job.pauseWaiters.push(resolve)
    })
  }

  private releasePauseWaiters(job: InternalJob): void {
    const waiters = job.pauseWaiters
    job.pauseWaiters = []
    for (const resolve of waiters) resolve()
  }

  private resumeAndKill(job: InternalJob): void {
    if (job.children.size === 0) return
    for (const child of job.children.values()) {
      if (job.suspended && child.pid) {
        try {
          setProcessSuspended(child.pid, false)
        } catch {
          // taskkill can still terminate a suspended process.
        }
      }
      killProcess(child)
    }
    job.suspended = false
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.view.status === 'queued' || (job.view.status === 'paused' && job.view.startedAt === 0)) {
      job.cancelRequested = true
      job.paused = false
      this.queue = this.queue.filter((id) => id !== jobId)
      this.releasePauseWaiters(job)
      this.finalize(job, 'cancelled', '已取消', {
        bytes: job.view.progress.bytes,
        files: job.view.progress.transfers,
        errors: 0,
        elapsedMs: 0
      })
      return
    }
    if (
      job.view.status !== 'running' &&
      job.view.status !== 'paused' &&
      job.view.status !== 'cancelling'
    ) {
      return
    }
    job.cancelRequested = true
    job.paused = false
    job.view.status = 'cancelling'
    job.view.progress.speed = 0
    job.view.progress.etaSeconds = null
    this.releasePauseWaiters(job)
    this.broadcast(job, true)
    this.resumeAndKill(job)
  }

  cancelAll(): void {
    this.queue = []
    for (const job of this.jobs.values()) {
      job.cancelRequested = true
      job.paused = false
      this.releasePauseWaiters(job)
      if (job.suspended) {
        for (const child of job.children.values()) {
          if (!child.pid) continue
          try {
            setProcessSuspended(child.pid, false)
          } catch {
            // ignore: taskkill will clean the process up
          }
        }
        job.suspended = false
      }
      for (const child of job.children.values()) {
        killProcess(child)
      }
    }
  }

  clearCompleted(): void {
    for (const [id, job] of this.jobs) {
      if (!isJobActive(job.view.status)) {
        this.jobs.delete(id)
      }
    }
  }

  getLogDir(): string {
    return this.logDir
  }

  private trimFinished(): void {
    const finished = [...this.jobs.values()]
      .filter((job) => job.finished)
      .sort((a, b) => (a.view.finishedAt || 0) - (b.view.finishedAt || 0))
    while (finished.length > 40) {
      const oldest = finished.shift()
      if (oldest) this.jobs.delete(oldest.view.id)
    }
  }
}

export function buildTaskSteps(task: SyncTask, remoteName: string): JobStep[] {
  const isUpload = task.mode === 'upload' || task.mode === 'mirror-upload'
  const isMirror = task.mode === 'mirror-upload' || task.mode === 'mirror-download'
  const useSync = isMirror && task.deleteExtraneous
  const steps: JobStep[] = []

  for (const pair of task.pairs) {
    const remotePath = pair.remotePath
    const remoteLabel = `${remoteName}:/${remotePath}`.replace(/\/+$/, '')
    if (isUpload) {
      let stat: fs.Stats
      try {
        stat = fs.statSync(pair.localPath)
      } catch {
        throw new Error(`本地路径不存在或无法访问：${pair.localPath}`)
      }
      if (stat.isDirectory()) {
        steps.push({
          action: useSync ? 'sync' : 'copy',
          source: pair.localPath,
          destination: `${remoteName}:${remotePath}`,
          sourceLabel: pair.localPath,
          destinationLabel: remoteLabel
        })
      } else {
        const fileName = path.basename(pair.localPath)
        const target = joinRemote(remotePath, fileName)
        steps.push({
          action: 'copyto',
          source: pair.localPath,
          destination: `${remoteName}:${target}`,
          sourceLabel: pair.localPath,
          destinationLabel: `${remoteName}:/${target}`
        })
      }
    } else {
      steps.push({
        action: useSync ? 'sync' : 'copy',
        source: `${remoteName}:${remotePath}`,
        destination: pair.localPath,
        sourceLabel: remoteLabel,
        destinationLabel: pair.localPath
      })
    }
  }
  return steps
}

export function effectivePostAction(
  task: SyncTask,
  trigger: JobTrigger,
  override?: PostAction
): PostAction {
  if (override) return override
  if (task.postAction === 'none') return 'none'
  if (task.postActionScope === 'always' || trigger === 'manual') return task.postAction
  return 'none'
}

interface StepConcurrency {
  transfers: number
  checkers: number
}

function buildArgs(
  step: JobStep,
  settings: AppSettings,
  configPath: string,
  job: InternalJob,
  taskId?: string,
  concurrency?: StepConcurrency
): string[] {
  const args = [
    '--config',
    configPath,
    step.action,
    step.source,
    step.destination,
    '--use-json-log',
    '--stats',
    '1s',
    '--stats-log-level',
    'NOTICE',
    '--log-level',
    'INFO',
    '--transfers',
    String(concurrency?.transfers ?? settings.transfers),
    '--checkers',
    String(concurrency?.checkers ?? settings.checkers),
    '--buffer-size',
    '16M',
    '--onedrive-chunk-size',
    settings.chunkSize,
    // Force resumable chunked uploads for files above the Graph simple-upload
    // limit instead of relying on a single large request.
    '--onedrive-upload-cutoff',
    '4M',
    '--multi-thread-streams',
    String(settings.multiThreadStreams),
    '--multi-thread-cutoff',
    '32M',
    '--retries',
    '6',
    '--low-level-retries',
    '20',
    '--retries-sleep',
    '3s',
    '--contimeout',
    '30s',
    '--timeout',
    '10m'
  ]

  if (step.action !== 'copyto') {
    args.push('--create-empty-src-dirs')
    // OneDrive stores directory mtimes as metadata, so every directory would
    // otherwise cost an extra PATCH request. File mtimes are still preserved.
    args.push('--no-update-dir-modtime')
  }
  if (job.checkMode === 'checksum') args.push('--checksum')
  for (const pattern of job.excludes) {
    if (pattern.trim()) args.push('--exclude', pattern.trim())
  }
  const limit = job.bandwidthLimit || settings.bandwidthLimit
  if (limit) args.push('--bwlimit', limit)
  void taskId
  return args
}

function joinRemote(base: string, name: string): string {
  return base ? `${base.replace(/\/+$/, '')}/${name}` : name
}
