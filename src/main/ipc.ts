import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AccountInfo,
  AppSettings,
  BootstrapData,
  PostAction,
  Quota,
  RemoteItem,
  RemoteSelection,
  SyncTask,
  TaskGroup
} from '@shared/types'
import * as store from './config'
import type { RcloneManager } from './rclone'
import type { JobStep, JobRunner } from './jobs'
import type { SyncService } from './sync-service'
import type { PowerManager } from './power'
import { log } from './logger'

export interface IpcDeps {
  getWindow: () => BrowserWindow | null
  rclone: RcloneManager
  jobs: JobRunner
  sync: SyncService
  power: PowerManager
  refreshQuota: () => Promise<Quota | null>
}

const REMOTE_ACTION_VALUES: PostAction[] = [
  'none',
  'monitor-off',
  'lock',
  'sleep',
  'hibernate',
  'shutdown'
]

export function registerIpc(deps: IpcDeps): void {
  const { rclone, jobs, sync } = deps

  ipcMain.handle('app:bootstrap', async (): Promise<BootstrapData> => {
    void deps.refreshQuota()
    return {
      config: store.getConfig(),
      rclone: rclone.getStatus(),
      jobs: jobs.getJobs(),
      appVersion: app.getVersion(),
      platform: process.platform,
      userData: app.getPath('userData')
    }
  })

  ipcMain.handle('app:refresh-quota', async (): Promise<Quota | null> => deps.refreshQuota())
  ipcMain.handle('app:open-user-data', async (): Promise<void> => {
    await shell.openPath(app.getPath('userData'))
  })
  ipcMain.handle('app:open-external', async (_event, url: string): Promise<void> => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('仅支持打开 http/https 链接')
    await shell.openExternal(String(url))
  })
  ipcMain.handle('app:copy-text', async (_event, text: string): Promise<void> => {
    clipboard.writeText(String(text ?? ''))
  })
  ipcMain.handle('app:open-log', async (_event, jobId: string): Promise<void> => {
    const raw = String(jobId || '')
    const job = jobs.getJobs().find((item) => item.id === raw)
    const logName = job?.logName || (/\.log$/i.test(raw) ? path.basename(raw) : '')
    if (!logName) throw new Error('日志不存在')
    const logPath = path.join(jobs.getLogDir(), logName)
    if (!fs.existsSync(logPath)) throw new Error('日志文件已被清理')
    const error = await shell.openPath(logPath)
    if (error) throw new Error(error)
  })

  ipcMain.handle('config:update-settings', async (_event, patch: Partial<AppSettings>) => {
    if (!patch || typeof patch !== 'object') throw new Error('设置数据无效')
    return store.patchSettings(patch)
  })
  ipcMain.handle('config:export', async (_event, includeSecrets: boolean) => {
    const win = deps.getWindow()
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-')
    const options = {
      title: '导出 OneBridge 配置',
      defaultPath: path.join(app.getPath('documents'), `onebridge-config-${stamp}.json`),
      filters: [{ name: 'OneBridge 配置', extensions: ['json'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const payload = store.exportPayload(Boolean(includeSecrets), rclone.readConfigFile())
    fs.writeFileSync(result.filePath, payload, 'utf8')
    log('info', `配置已导出：${result.filePath}`)
    return result.filePath
  })
  ipcMain.handle('config:import', async (): Promise<boolean> => {
    if (jobs.hasRunningJobs()) throw new Error('请等待当前传输完成后再导入配置')
    const win = deps.getWindow()
    const options = {
      title: '导入 OneBridge 配置',
      filters: [{ name: 'OneBridge 配置', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return false
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
    } catch {
      throw new Error('配置文件不是有效的 JSON')
    }
    if (parsed.kind !== 'onebridge-config' || !parsed.appConfig) {
      throw new Error('这不是 OneBridge 导出的配置文件')
    }
    const rcloneConfig =
      typeof parsed.rcloneConfig === 'string' && parsed.rcloneConfig.trim()
        ? parsed.rcloneConfig
        : null
    const current = store.getConfig()
    const imported = store.sanitizeConfig(parsed.appConfig)
    if (!rcloneConfig) {
      // 未包含登录凭证时保留当前账户，避免导入后意外掉线。
      imported.account = current.account
    }
    const stamp = Date.now()
    try {
      fs.copyFileSync(
        path.join(app.getPath('userData'), 'config.json'),
        path.join(app.getPath('userData'), `config.json.backup-${stamp}`)
      )
    } catch {
      // first import before any save
    }
    if (rcloneConfig) {
      rclone.writeConfigFile(rcloneConfig)
    }
    store.replaceConfig(imported)
    log('info', `配置已导入：${result.filePaths[0]}，即将重启`)
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 700)
    return true
  })
  ipcMain.handle('config:clear-history', async () => store.clearHistory())

  ipcMain.handle('tasks:save', async (_event, input: SyncTask) => {
    if (!input || typeof input !== 'object') throw new Error('任务数据无效')
    const task: SyncTask = {
      ...input,
      id: input.id || randomUUID(),
      pairs: Array.isArray(input.pairs)
        ? input.pairs.map((pair) => ({
            ...pair,
            id: pair.id || randomUUID(),
            localPath: String(pair.localPath || '').trim(),
            remotePath: store.normalizeRemotePath(String(pair.remotePath || ''))
          }))
        : []
    }
    if (!task.name?.trim()) throw new Error('请填写任务名称')
    if (!task.pairs.length) throw new Error('请至少添加一个本地或云端来源')
    for (const pair of task.pairs) {
      if (!pair.localPath) throw new Error('来源路径不能为空')
      assertRemotePath(pair.remotePath)
    }
    const groupIds = new Set(store.getConfig().groups.map((group) => group.id))
    if (task.groupId && !groupIds.has(task.groupId)) task.groupId = null
    if (task.mode === 'upload' || task.mode === 'mirror-upload') {
      for (const pair of task.pairs) {
        if (!fs.existsSync(pair.localPath)) {
          throw new Error(`本地路径不存在：${pair.localPath}`)
        }
      }
    }
    return store.upsertTask(task)
  })
  ipcMain.handle('tasks:delete', async (_event, id: string) => {
    for (const job of jobs.getJobs()) {
      if (job.taskId === id && ['queued', 'running', 'paused', 'cancelling'].includes(job.status)) {
        jobs.cancel(job.id)
      }
    }
    return store.deleteTask(id)
  })
  ipcMain.handle('tasks:set-enabled', async (_event, id: string, enabled: boolean) =>
    store.setTaskEnabled(id, Boolean(enabled))
  )
  ipcMain.handle(
    'tasks:run',
    async (_event, id: string, postAction?: PostAction): Promise<string> => {
      if (postAction && !REMOTE_ACTION_VALUES.includes(postAction)) {
        throw new Error('完成操作参数无效')
      }
      const job = sync.runTask(id, 'manual', postAction)
      return job.id
    }
  )
  ipcMain.handle('tasks:run-all', async (): Promise<number> => {
    const config = store.getConfig()
    if (!config.account) throw new Error('请先登录 OneDrive 账户')
    let count = 0
    for (const task of config.tasks.filter((item) => item.enabled)) {
      if (jobs.hasPendingTask(task.id)) continue
      try {
        sync.runTask(task.id, 'manual', 'none')
        count += 1
      } catch (error) {
        log('warn', `启动任务失败：${task.name}`, String(error))
      }
    }
    return count
  })
  ipcMain.handle('jobs:cancel', async (_event, id: string): Promise<void> => {
    jobs.cancel(id)
  })
  ipcMain.handle('jobs:pause', async (_event, id: string): Promise<void> => {
    jobs.pause(id)
  })
  ipcMain.handle('jobs:resume', async (_event, id: string): Promise<void> => {
    jobs.resume(id)
  })
  ipcMain.handle('jobs:clear-completed', async (): Promise<void> => {
    jobs.clearCompleted()
  })

  ipcMain.handle('groups:save', async (_event, input: TaskGroup) => {
    if (!input || typeof input !== 'object' || !String(input.name || '').trim()) {
      throw new Error('分组名称不能为空')
    }
    return store.upsertGroup({ ...input, id: input.id || randomUUID() })
  })
  ipcMain.handle('groups:delete', async (_event, id: string) => store.deleteGroup(id))

  ipcMain.handle('files:list', async (_event, remotePath: string): Promise<RemoteItem[]> => {
    const account = requireAccount()
    assertRemotePath(remotePath)
    return rclone.list(account.remoteName, normalize(remotePath))
  })
  ipcMain.handle('files:quota', async (): Promise<Quota | null> => deps.refreshQuota())
  ipcMain.handle('files:upload', async (_event, localPaths: string[], remotePath: string) => {
    const account = requireAccount()
    if (!Array.isArray(localPaths) || !localPaths.length) throw new Error('请选择要上传的文件或文件夹')
    const base = store.normalizeRemotePath(remotePath)
    assertRemotePath(base)
    const steps: JobStep[] = []
    for (const localPath of localPaths) {
      if (!fs.existsSync(localPath)) throw new Error(`本地路径不存在：${localPath}`)
      const stat = fs.statSync(localPath)
      const name = path.basename(localPath)
      const target = base ? `${base}/${name}` : name
      if (stat.isDirectory()) {
        steps.push({
          action: 'copy',
          source: localPath,
          destination: `${account.remoteName}:${target}`,
          sourceLabel: localPath,
          destinationLabel: `${account.remoteName}:/${target}`
        })
      } else {
        steps.push({
          action: 'copyto',
          source: localPath,
          destination: `${account.remoteName}:${target}`,
          sourceLabel: localPath,
          destinationLabel: `${account.remoteName}:/${target}`
        })
      }
    }
    const job = sync.enqueueAdhoc(
      steps.length === 1
        ? `上传 · ${path.basename(steps[0].source) || '文件'}`
        : `上传 ${steps.length} 个项目`,
      steps
    )
    return job.id
  })
  ipcMain.handle(
    'files:download',
    async (_event, items: RemoteSelection[], localDir: string): Promise<string> => {
      const account = requireAccount()
      if (!Array.isArray(items) || !items.length) throw new Error('请选择要下载的文件')
      if (!localDir) throw new Error('请选择本地保存位置')
      fs.mkdirSync(localDir, { recursive: true })
      const steps: JobStep[] = items.map((item) => {
        assertRemotePath(item.path)
        const localTarget = path.join(localDir, safeLocalName(item.name))
        if (item.isDir) {
          return {
            action: 'copy',
            source: `${account.remoteName}:${normalize(item.path)}`,
            destination: localTarget,
            sourceLabel: `${account.remoteName}:/${normalize(item.path)}`,
            destinationLabel: localTarget
          }
        }
        return {
          action: 'copyto',
          source: `${account.remoteName}:${normalize(item.path)}`,
          destination: localTarget,
          sourceLabel: `${account.remoteName}:/${normalize(item.path)}`,
          destinationLabel: localTarget
        }
      })
      const job = sync.enqueueAdhoc(
        items.length === 1 ? `下载 · ${items[0].name}` : `下载 ${items.length} 个项目`,
        steps
      )
      return job.id
    }
  )
  ipcMain.handle('files:delete', async (_event, items: RemoteSelection[]): Promise<void> => {
    const account = requireAccount()
    if (!Array.isArray(items) || !items.length) return
    const errors: string[] = []
    for (const item of items) {
      assertRemotePath(item.path)
      if (!normalize(item.path)) throw new Error('不能删除 OneDrive 根目录')
      try {
        await rclone.deleteItem(account.remoteName, normalize(item.path), item.isDir)
      } catch (error) {
        errors.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
  })
  ipcMain.handle(
    'files:rename',
    async (_event, item: RemoteSelection, newName: string): Promise<void> => {
      const account = requireAccount()
      validateRemoteName(newName)
      assertRemotePath(item.path)
      await rclone.renameItem(
        account.remoteName,
        normalize(item.path),
        String(newName).trim(),
        item.isDir
      )
    }
  )
  ipcMain.handle(
    'files:create-folder',
    async (_event, parentPath: string, name: string): Promise<void> => {
      const account = requireAccount()
      validateRemoteName(name)
      const base = store.normalizeRemotePath(parentPath)
      assertRemotePath(base)
      const target = base ? `${base}/${String(name).trim()}` : String(name).trim()
      await rclone.mkdir(account.remoteName, target)
    }
  )
  ipcMain.handle('files:preview', async (_event, item: RemoteSelection) => {
    const account = requireAccount()
    if (!item || item.isDir) throw new Error('文件夹无法预览')
    assertRemotePath(item.path)
    const listed = await rclone.list(
      account.remoteName,
      path.posix.dirname(normalize(item.path)) === '.' ? '' : path.posix.dirname(normalize(item.path))
    )
    const match =
      listed.find((entry) => entry.path === normalize(item.path)) ||
      ({
        name: item.name,
        path: normalize(item.path),
        isDir: false,
        size: 0,
        modTime: '',
        mimeType: mimeFromName(item.name)
      } satisfies RemoteItem)
    return rclone.preview(account.remoteName, match)
  })
  ipcMain.handle('files:open', async (_event, item: RemoteSelection): Promise<void> => {
    const account = requireAccount()
    if (!item) throw new Error('文件不存在')
    if (item.isDir) throw new Error('文件夹无法直接用默认应用打开')
    assertRemotePath(item.path)
    await rclone.openItem(account.remoteName, {
      name: item.name,
      path: normalize(item.path),
      isDir: item.isDir,
      size: 0,
      modTime: '',
      mimeType: mimeFromName(item.name)
    })
  })
  ipcMain.handle('files:link', async (_event, item: RemoteSelection): Promise<string> => {
    const account = requireAccount()
    if (!item) throw new Error('文件不存在')
    assertRemotePath(item.path)
    const url = await rclone.link(account.remoteName, normalize(item.path))
    clipboard.writeText(url)
    return url
  })
  ipcMain.handle('files:inspect-local', async (_event, paths: string[]) => {
    if (!Array.isArray(paths)) return []
    return paths.map((itemPath) => {
      const stat = fs.statSync(itemPath)
      return {
        path: itemPath,
        name: path.basename(itemPath),
        isDir: stat.isDirectory(),
        size: stat.isDirectory() ? 0 : stat.size
      }
    })
  })

  ipcMain.handle('dialog:pick-files', async (): Promise<string[]> => {
    const win = deps.getWindow()
    const options = {
      title: '选择要上传的文件',
      properties: ['openFile' as const, 'multiSelections' as const]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('dialog:pick-folder', async (): Promise<string | null> => {
    const win = deps.getWindow()
    const options = { title: '选择文件夹', properties: ['openDirectory' as const] }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] || null
  })
  ipcMain.handle('dialog:pick-rclone', async (): Promise<string | null> => {
    const win = deps.getWindow()
    const options = {
      title: '选择 rclone.exe',
      properties: ['openFile' as const],
      filters: [{ name: 'rclone', extensions: ['exe'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('rclone:install', async () => {
    if (jobs.hasRunningJobs()) throw new Error('请等待当前传输完成后再安装传输引擎')
    return rclone.install()
  })
  ipcMain.handle('rclone:login', async (): Promise<AccountInfo | null> => {
    if (jobs.hasRunningJobs()) throw new Error('请等待当前传输完成后再切换账户')
    const current = store.getConfig()
    const remoteName = current.account?.remoteName || 'onedrive'
    const account = await rclone.login(remoteName)
    store.updateAccount(account)
    return account
  })
  ipcMain.handle('rclone:cancel-login', async (): Promise<void> => {
    rclone.cancelLogin()
  })
  ipcMain.handle('rclone:open-login-url', async (): Promise<void> => {
    await rclone.openLoginUrl()
  })
  ipcMain.handle('rclone:logout', async (): Promise<void> => {
    if (jobs.hasRunningJobs()) throw new Error('请等待当前传输完成后再断开账户')
    const account = store.getConfig().account
    if (!account) return
    try {
      await rclone.logout(account.remoteName)
    } catch (error) {
      log('warn', '删除 rclone 远程配置失败', String(error))
    }
    store.updateAccount(null)
  })
  ipcMain.handle('rclone:set-path', async (_event, binPath: string) => {
    const value = String(binPath || '').trim()
    if (!value) {
      store.patchSettings({ rclonePath: '' })
      return rclone.resolve()
    }
    if (!fs.existsSync(value)) throw new Error('指定的文件不存在')
    await rclone.testBinary(value)
    store.patchSettings({ rclonePath: value })
    return rclone.getStatus()
  })

  ipcMain.handle('power:cancel-shutdown', async (): Promise<void> => {
    await deps.power.cancelShutdown()
  })

  ipcMain.handle('window:minimize', async (): Promise<void> => {
    deps.getWindow()?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', async (): Promise<void> => {
    const win = deps.getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', async (): Promise<void> => {
    deps.getWindow()?.close()
  })
  ipcMain.handle('window:is-maximized', async (): Promise<boolean> => {
    return Boolean(deps.getWindow()?.isMaximized())
  })
}

function requireAccount(): AccountInfo {
  const account = store.getConfig().account
  if (!account) throw new Error('请先登录 OneDrive 账户')
  return account
}

function normalize(remotePath: string): string {
  return store.normalizeRemotePath(String(remotePath || ''))
}

function assertRemotePath(remotePath: string): void {
  const normalized = normalize(remotePath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new Error('OneDrive 路径不能包含 “..” 或 “.” 片段')
  }
}

function validateRemoteName(name: string): void {
  const value = String(name || '').trim()
  if (!value) throw new Error('名称不能为空')
  if (value.length > 255) throw new Error('名称过长')
  if (/[\\/]/.test(value)) throw new Error('名称不能包含斜杠')
  if (value === '.' || value === '..') throw new Error('名称无效')
  if (/[\u0000-\u001f]/.test(value)) throw new Error('名称包含不可见字符')
}

function safeLocalName(name: string): string {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180)
  return cleaned || 'unnamed'
}

function mimeFromName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'].includes(ext)) {
    return `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`
  }
  if (['.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.xml', '.yml', '.yaml'].includes(ext)) {
    return 'text/plain'
  }
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}
