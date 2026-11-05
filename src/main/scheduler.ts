import type { SyncTask } from '@shared/types'
import { getConfig } from './config'
import { log } from './logger'

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private initialTimer: NodeJS.Timeout | null = null
  private ticking = false

  constructor(
    private readonly canRun: () => boolean,
    private readonly runScheduled: (task: SyncTask) => Promise<void>
  ) {}

  start(): void {
    this.stop()
    this.initialTimer = setTimeout(() => {
      void this.tick()
    }, 8_000)
    this.timer = setInterval(() => {
      void this.tick()
    }, 15_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.initialTimer) clearTimeout(this.initialTimer)
    this.timer = null
    this.initialTimer = null
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    if (!this.canRun()) return
    this.ticking = true
    try {
      const now = Date.now()
      const due = getConfig().tasks.filter(
        (task) =>
          task.enabled &&
          task.schedule === 'interval' &&
          typeof task.nextRunAt === 'number' &&
          task.nextRunAt <= now
      )
      for (const task of due) {
        try {
          await this.runScheduled(task)
        } catch (error) {
          log('warn', `定时任务启动失败：${task.name}`, String(error))
        }
      }
    } finally {
      this.ticking = false
    }
  }
}
