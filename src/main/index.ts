import {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  Notification,
  session,
  shell,
  Tray,
  dialog,
  nativeImage
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AppConfig,
  JobHistoryEntry,
  JobView,
  PageId,
  Quota,
  SyncTask
} from '@shared/types'
import { initLogger, log } from './logger'
import {
  configEvents,
  getConfig,
  initConfig,
  updateAccount,
  updateQuota,
  updateTaskAfterRun,
  addHistory
} from './config'
import { RcloneManager } from './rclone'
import { JobRunner } from './jobs'
import { SyncService } from './sync-service'
import { Scheduler } from './scheduler'
import { PowerManager } from './power'
import { registerIpc } from './ipc'
import { applyProxy, proxyKey } from './proxy'

if (process.env.ONEBRIDGE_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.ONEBRIDGE_USER_DATA))
}

const APP_USER_MODEL_ID = app.isPackaged
  ? 'com.onebridge.desktop'
  : 'com.onebridge.desktop.dev'

// Dev runs create an "Electron.lnk" notification shortcut. Give them a
// separate identity so it can never override the installed app's taskbar
// name and icon.
app.setAppUserModelId(APP_USER_MODEL_ID)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let rclone: RcloneManager
let jobs: JobRunner
let sync: SyncService
let scheduler: Scheduler
let power: PowerManager
let isQuitting = false
let quotaRefresh: Promise<Quota | null> | null = null
let lastQuotaRefresh = 0
let lastLaunchAtLogin = false
let lastProxyKey = ''

const capturePath = process.env.ONEBRIDGE_CAPTURE
const captureRoute = (process.env.ONEBRIDGE_ROUTE || '') as PageId | ''
const captureScript = process.env.ONEBRIDGE_CAPTURE_JS

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')
}

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function createWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#070b12',
    title: 'OneBridge',
    icon: iconPath(),
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  mainWindow = win
  Menu.setApplicationMenu(null)

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    sendToRenderer('window:maximized', win.isMaximized())
  })
  win.on('maximize', () => sendToRenderer('window:maximized', true))
  win.on('unmaximize', () => sendToRenderer('window:maximized', false))
  win.on('close', (event) => {
    if (isQuitting) return
    const config = getConfig()
    if (config.settings.closeToTray) {
      event.preventDefault()
      win.hide()
      return
    }
    if (jobs.hasRunningJobs()) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['继续退出', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: '传输仍在进行',
        message: '退出 OneBridge 会中断正在进行的传输。',
        detail: '要退出吗？'
      })
      if (choice !== 0) {
        event.preventDefault()
        return
      }
    }
    isQuitting = true
  })
  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    const allowed =
      url === current ||
      url.startsWith('file://') ||
      (process.env.ELECTRON_RENDERER_URL &&
        url.startsWith(process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')))
    if (!allowed) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  win.webContents.on('did-finish-load', () => {
    if (!capturePath) return
    setTimeout(async () => {
      try {
        if (captureScript) {
          await win.webContents.executeJavaScript(captureScript)
          await delay(1200)
        }
        const image = await win.webContents.capturePage()
        fs.writeFileSync(capturePath, image.toPNG())
        log('info', `UI 截图已保存：${capturePath}`)
      } catch (error) {
        log('error', 'UI 截图失败', String(error))
      } finally {
        isQuitting = true
        app.exit(0)
      }
    }, 3200)
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = `${devUrl}${captureRoute ? `#${captureRoute}` : ''}`
    void win.loadURL(url)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: captureRoute || undefined
    })
  }
  return win
}

function showMainWindow(page?: PageId): void {
  const win = createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page) sendToRenderer('navigate', page)
}

function sendToRenderer(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function createTray(): void {
  if (tray) return
  try {
    const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
    tray = new Tray(image)
    tray.setToolTip('OneBridge · OneDrive 同步')
    tray.on('click', () => {
      if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide()
      else showMainWindow()
    })
    rebuildTrayMenu()
  } catch (error) {
    log('warn', '无法创建系统托盘', String(error))
  }
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const pendingShutdown = power?.getPendingShutdown()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 OneBridge', click: () => showMainWindow() },
      {
        label: '立即同步全部任务',
        click: () => {
          try {
            const count = sync.runAll()
            showNotification(
              'OneBridge',
              count > 0 ? `已将 ${count} 个任务加入同步队列` : '没有可运行的同步任务',
              'transfers'
            )
          } catch (error) {
            showNotification('OneBridge', error instanceof Error ? error.message : String(error), 'settings')
          }
        }
      },
      { type: 'separator' },
      ...(pendingShutdown
        ? [
            {
              label: '取消自动关机',
              click: () => {
                void power.cancelShutdown()
              }
            } as const
          ]
        : []),
      {
        label: '打开设置',
        click: () => showMainWindow('settings')
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => requestQuit()
      }
    ])
  )
}

function requestQuit(): void {
  if (jobs?.hasRunningJobs()) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['继续退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: '传输仍在进行',
      message: '退出 OneBridge 会中断正在进行的传输。',
      detail: '要退出吗？'
    })
    if (choice !== 0) return
  }
  isQuitting = true
  app.quit()
}

function showNotification(title: string, body: string, page?: PageId): void {
  try {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title,
      body: body.length > 240 ? `${body.slice(0, 240)}…` : body,
      icon: iconPath()
    })
    notification.on('click', () => showMainWindow(page))
    notification.show()
  } catch (error) {
    log('warn', '系统通知发送失败', String(error))
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

async function refreshQuota(force = false): Promise<Quota | null> {
  const config = getConfig()
  if (!config.account || !rclone?.getStatus().installed) return config.account?.quota ?? null
  const now = Date.now()
  if (!force && now - lastQuotaRefresh < 20_000) return config.account.quota ?? null
  if (quotaRefresh) return quotaRefresh
  quotaRefresh = (async () => {
    try {
      const quota = await rclone.about(config.account!.remoteName)
      if (quota) {
        updateQuota(quota)
        lastQuotaRefresh = Date.now()
      }
      return quota
    } catch (error) {
      log('warn', '刷新 OneDrive 空间失败', String(error))
      return config.account?.quota ?? null
    } finally {
      quotaRefresh = null
    }
  })()
  return quotaRefresh
}

function applyLaunchAtLogin(config: AppConfig): void {
  if (!app.isPackaged) return
  if (config.settings.launchAtLogin === lastLaunchAtLogin) return
  lastLaunchAtLogin = config.settings.launchAtLogin
  try {
    app.setLoginItemSettings({
      openAtLogin: config.settings.launchAtLogin
    })
  } catch (error) {
    log('warn', '设置开机启动失败', String(error))
  }
}

function handleJobFinished(payload: {
  job: JobView
  taskId?: string
  postAction: JobView['postAction']
}): void {
  const { job, taskId, postAction } = payload
  if (taskId) {
    updateTaskAfterRun(taskId, job.status as 'success' | 'error' | 'cancelled', job.error)
  }
  const summary = job.summary || {
    bytes: job.progress.bytes,
    files: job.progress.transfers,
    errors: job.progress.errors,
    elapsedMs: Math.max(0, (job.finishedAt || Date.now()) - job.startedAt)
  }
  const entry: JobHistoryEntry = {
    id: `history-${job.id}`,
    jobId: job.id,
    taskId,
    taskName: job.taskName,
    trigger: job.trigger,
    status: job.status as JobHistoryEntry['status'],
    startedAt: job.startedAt || job.queuedAt,
    finishedAt: job.finishedAt || Date.now(),
    summary,
    error: job.error,
    postAction,
    logName: job.logName
  }
  addHistory(entry)

  const config = getConfig()
  if (config.settings.notifications) {
    const skipNoop = job.trigger === 'schedule' && job.status === 'success' && summary.files === 0
    if (!skipNoop) {
      if (job.status === 'success') {
        showNotification(
          '同步完成',
          `${job.taskName} · ${summary.files} 个文件 · ${formatBytes(summary.bytes)}`,
          'transfers'
        )
      } else if (job.status === 'error') {
        showNotification('同步失败', `${job.taskName}\n${job.error || '未知错误'}`, 'transfers')
      }
    }
  }

  if (job.status === 'success') {
    void refreshQuota(true)
    if (postAction && postAction !== 'none') {
      setTimeout(() => {
        power
          .perform(postAction, job.taskName)
          .then(() => rebuildTrayMenu())
          .catch((error) => {
            log('error', '执行完成操作失败', String(error))
            showNotification('完成操作失败', String(error), 'settings')
          })
      }, 900)
    }
  }
}

async function bootstrapApp(): Promise<void> {
  initConfig()
  initLogger()
  log('info', `OneBridge ${app.getVersion()} 启动，配置目录 ${app.getPath('userData')}`)

  const config = getConfig()
  lastLaunchAtLogin = config.settings.launchAtLogin
  nativeTheme.themeSource = config.settings.theme
  lastProxyKey = proxyKey(config.settings)
  await applyProxy(session.defaultSession, config.settings)

  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy) return
    const settings = getConfig().settings
    const user = settings.proxyUsername.trim()
    if (settings.proxyMode !== 'custom' || !user) return
    event.preventDefault()
    callback(user, settings.proxyPassword)
  })

  rclone = new RcloneManager(() => getConfig().settings)
  jobs = new JobRunner(rclone, () => getConfig().settings)
  power = new PowerManager()
  sync = new SyncService(rclone, jobs)
  scheduler = new Scheduler(
    () => Boolean(getConfig().account) && rclone.getStatus().installed,
    async (task: SyncTask) => {
      sync.runTask(task.id, 'schedule')
    }
  )

  configEvents.on('changed', (next: AppConfig) => {
    sendToRenderer('config:changed', next)
    applyLaunchAtLogin(next)
    nativeTheme.themeSource = next.settings.theme
    const nextProxyKey = proxyKey(next.settings)
    if (nextProxyKey !== lastProxyKey) {
      lastProxyKey = nextProxyKey
      void applyProxy(session.defaultSession, next.settings)
    }
  })
  rclone.on('status', (status) => sendToRenderer('rclone:status', status))
  rclone.on('download', (progress) => sendToRenderer('rclone:download', progress))
  rclone.on('login', (state) => sendToRenderer('login:state', state))
  jobs.on('update', (job: JobView) => sendToRenderer('job:update', job))
  jobs.on('finished', handleJobFinished)
  power.on('countdown', (countdown) => {
    sendToRenderer('power:countdown', countdown)
    rebuildTrayMenu()
  })

  registerIpc({
    getWindow: () => mainWindow,
    rclone,
    jobs,
    sync,
    power,
    refreshQuota: () => refreshQuota(true)
  })

  await rclone.init()
  createWindow()
  createTray()
  applyLaunchAtLogin(config)
  scheduler.start()
  const accountForRepair = getConfig().account
  if (accountForRepair?.remoteName) {
    void rclone
      .ensureRemoteConfig(accountForRepair.remoteName)
      .then((drive) => {
        if (!drive) return
        const current = getConfig().account
        if (!current) return
        updateAccount({
          ...current,
          displayName: drive.displayName || current.displayName,
          email: current.email || drive.email
        })
        void refreshQuota(true)
      })
      .catch((error) => {
        log('warn', '检查 OneDrive 驱动器配置失败', String(error))
      })
  }
  setTimeout(() => void refreshQuota(), 4_000)

  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID)
  }
}

app.on('second-instance', () => {
  showMainWindow()
})

app.on('activate', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  isQuitting = true
  scheduler?.stop()
  jobs?.cancelAll()
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.whenReady().then(bootstrapApp).catch((error) => {
  log('error', '应用启动失败', String(error))
  console.error(error)
  app.quit()
})

process.on('uncaughtException', (error) => {
  log('error', '未捕获异常', error.stack || String(error))
})
process.on('unhandledRejection', (reason) => {
  log('error', '未处理的 Promise 拒绝', String(reason))
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
