import { app } from 'electron'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function helperPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'transfer-control.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'transfer-control.exe')
}

export function processControlAvailable(): boolean {
  return process.platform === 'win32' && fs.existsSync(helperPath())
}

/**
 * Suspends or resumes every thread of a process. rclone has no pause command,
 * so freezing its process is the only way to keep an in-flight transfer (and
 * its OneDrive upload session / open download stream) intact.
 */
export function setProcessSuspended(pid: number, suspended: boolean): void {
  if (process.platform !== 'win32') {
    throw new Error('当前系统不支持暂停传输')
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('传输进程无效，无法暂停')
  }
  const helper = helperPath()
  if (!fs.existsSync(helper)) {
    throw new Error('暂停组件缺失，请重新安装 OneBridge')
  }

  const result = spawnSync(helper, [suspended ? 'suspend' : 'resume', String(pid)], {
    windowsHide: true,
    timeout: 8_000,
    encoding: 'utf8'
  })

  if (result.error) {
    const detail =
      (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
        ? '操作超时'
        : result.error.message
    throw new Error(`无法${suspended ? '暂停' : '继续'}传输进程：${detail}`)
  }
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim().slice(0, 300)
    throw new Error(
      `无法${suspended ? '暂停' : '继续'}传输进程${detail ? `：${detail}` : ''}`
    )
  }
}
