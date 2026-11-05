import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PostAction, PowerCountdown } from '@shared/types'
import { log } from './logger'

const SHUTDOWN_SECONDS = 60

export class PowerManager extends EventEmitter {
  private pendingShutdown = false

  async perform(action: PostAction, jobName: string): Promise<void> {
    if (action === 'none') return
    log('info', `执行完成操作：${action}`, { jobName })
    switch (action) {
      case 'monitor-off':
        await this.monitorOff()
        break
      case 'lock':
        await runDetached('rundll32.exe', ['user32.dll,LockWorkStation'])
        break
      case 'sleep':
        await runDetached('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])
        break
      case 'hibernate':
        await runDetached('shutdown.exe', ['/h'])
        break
      case 'shutdown':
        await this.scheduleShutdown(jobName)
        break
      default:
        break
    }
  }

  private async monitorOff(): Promise<void> {
    const script = [
      "Add-Type -Namespace OneBridgePower -Name Native -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);';",
      '[OneBridgePower.Native]::SendMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr]2) | Out-Null'
    ].join(' ')
    await runDetached('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script
    ])
  }

  private async scheduleShutdown(jobName: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'shutdown.exe',
        [
          '/s',
          '/t',
          String(SHUTDOWN_SECONDS),
          '/c',
          'OneBridge 同步已完成，系统将在 60 秒后关机。可在 OneBridge 中取消。'
        ],
        { windowsHide: true, stdio: 'ignore' }
      )
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`无法安排关机（退出码 ${code}）`))
      })
    })
    this.pendingShutdown = true
    const countdown: PowerCountdown = {
      action: 'shutdown',
      jobName,
      seconds: SHUTDOWN_SECONDS
    }
    this.emit('countdown', countdown)
  }

  async cancelShutdown(): Promise<void> {
    if (!this.pendingShutdown) {
      // Still issue the cancel command in case another schedule is pending.
    }
    await new Promise<void>((resolve) => {
      const child = spawn('shutdown.exe', ['/a'], { windowsHide: true, stdio: 'ignore' })
      child.on('error', () => resolve())
      child.on('close', () => resolve())
    })
    this.pendingShutdown = false
    this.emit('countdown', null)
    log('warn', '已取消自动关机')
  }

  getPendingShutdown(): boolean {
    return this.pendingShutdown
  }
}

function runDetached(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`系统操作失败（退出码 ${code}）`))
    })
  })
}
