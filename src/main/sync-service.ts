import type { JobTrigger, PostAction, JobView } from '@shared/types'
import { getConfig, markTaskQueued } from './config'
import {
  buildTaskSteps,
  effectivePostAction,
  JobRunner,
  type JobStep
} from './jobs'
import type { RcloneManager } from './rclone'

export class SyncService {
  constructor(
    private readonly rclone: RcloneManager,
    private readonly jobs: JobRunner
  ) {}

  runTask(taskId: string, trigger: JobTrigger, postActionOverride?: PostAction): JobView {
    const config = getConfig()
    if (!config.account) throw new Error('请先登录 OneDrive 账户')
    if (!this.rclone.getStatus().installed) throw new Error('请先安装 rclone 传输引擎')
    const task = config.tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('同步任务不存在')
    if (this.jobs.hasPendingTask(task.id)) throw new Error('该任务正在运行或已在队列中')
    const steps = buildTaskSteps(task, config.account.remoteName)
    const postAction = effectivePostAction(task, trigger, postActionOverride)
    const job = this.jobs.enqueue({
      taskId: task.id,
      taskName: task.name,
      trigger,
      steps,
      postAction,
      checkMode: task.checkMode,
      excludes: task.excludes,
      bandwidthLimit: task.bandwidthLimit
    })
    markTaskQueued(task.id)
    return job
  }

  runAll(): number {
    const config = getConfig()
    if (!config.account) throw new Error('请先登录 OneDrive 账户')
    let count = 0
    for (const task of config.tasks.filter((item) => item.enabled)) {
      if (this.jobs.hasPendingTask(task.id)) continue
      try {
        this.runTask(task.id, 'manual')
        count += 1
      } catch {
        // Continue with the remaining tasks; errors are visible per task.
      }
    }
    return count
  }

  enqueueAdhoc(name: string, steps: JobStep[]): JobView {
    if (!steps.length) throw new Error('没有可上传或下载的文件')
    return this.jobs.enqueue({
      taskName: name,
      trigger: 'browser',
      steps,
      postAction: 'none'
    })
  }
}
