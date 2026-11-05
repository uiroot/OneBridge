import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  AccountInfo,
  AppConfig,
  AppSettings,
  DownloadProgress,
  JobView,
  LoginState,
  PageId,
  PostAction,
  PowerCountdown,
  Quota,
  RcloneStatus,
  SyncTask,
  TaskGroup
} from '@shared/types'
import { formatBytes, isFinalStatus } from '../lib/utils'

const VALID_PAGES: PageId[] = ['dashboard', 'tasks', 'files', 'transfers', 'settings']

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
  }
  return String(error)
}

export function toastError(title: string, error: unknown): void {
  toast.error(title, { description: errorMessage(error) })
}

export interface TaskModalState {
  open: boolean
  task: SyncTask | null
}

interface AppState {
  bootstrapped: boolean
  bootError: string | null
  config: AppConfig | null
  rclone: RcloneStatus | null
  jobs: JobView[]
  page: PageId
  appVersion: string
  platform: string
  userData: string
  download: DownloadProgress | null
  loginState: LoginState
  loginOpen: boolean
  loginBusy: boolean
  installing: boolean
  powerCountdown: PowerCountdown | null
  windowMaximized: boolean
  taskModal: TaskModalState
  taskGroupFilter: string | null
  init: () => Promise<void>
  reload: () => Promise<void>
  setPage: (page: PageId) => void
  applyConfig: (config: AppConfig) => void
  setTaskGroupFilter: (groupId: string | null) => void
  saveTask: (task: SyncTask) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
  setTaskEnabled: (id: string, enabled: boolean) => Promise<void>
  runTask: (id: string, postAction?: PostAction) => Promise<boolean>
  runAllTasks: () => Promise<void>
  cancelJob: (id: string) => Promise<void>
  pauseJob: (id: string) => Promise<void>
  resumeJob: (id: string) => Promise<void>
  clearCompletedJobs: () => Promise<void>
  clearHistory: () => Promise<void>
  saveGroup: (group: TaskGroup) => Promise<boolean>
  deleteGroup: (id: string) => Promise<boolean>
  updateSettings: (patch: Partial<AppSettings>) => Promise<boolean>
  refreshQuota: () => Promise<Quota | null>
  installRclone: () => Promise<boolean>
  startLogin: () => Promise<void>
  cancelLogin: () => Promise<void>
  closeLogin: () => void
  logout: () => Promise<boolean>
  setRclonePath: (path: string) => Promise<boolean>
  cancelShutdown: () => Promise<void>
  openTaskModal: (task?: SyncTask | null) => void
  closeTaskModal: () => void
  setWindowMaximized: (value: boolean) => void
}

function pageFromHash(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0] as PageId
  return VALID_PAGES.includes(raw) ? raw : 'dashboard'
}

let initPromise: Promise<void> | null = null
let eventsBound = false

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  bootError: null,
  config: null,
  rclone: null,
  jobs: [],
  page: pageFromHash(),
  appVersion: '',
  platform: '',
  userData: '',
  download: null,
  loginState: { status: 'idle' },
  loginOpen: false,
  loginBusy: false,
  installing: false,
  powerCountdown: null,
  windowMaximized: false,
  taskModal: { open: false, task: null },
  taskGroupFilter: null,

  init: async () => {
    if (get().bootstrapped) return
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const data = await window.api.bootstrap()
        set({
          config: data.config,
          rclone: data.rclone,
          jobs: data.jobs,
          bootstrapped: true,
          bootError: null,
          page: pageFromHash(),
          appVersion: data.appVersion,
          platform: data.platform,
          userData: data.userData
        })
      } catch (error) {
        set({ bootError: errorMessage(error) })
      } finally {
        initPromise = null
      }
    })()
    return initPromise
  },

  reload: async () => {
    try {
      const data = await window.api.bootstrap()
      set({
        config: data.config,
        rclone: data.rclone,
        jobs: data.jobs,
        appVersion: data.appVersion,
        platform: data.platform,
        userData: data.userData
      })
    } catch (error) {
      console.warn('刷新状态失败', error)
    }
  },

  setPage: (page) => {
    set({ page })
    if (window.location.hash !== `#/${page}`) {
      window.history.replaceState(null, '', `#/${page}`)
    }
  },

  applyConfig: (config) => set({ config }),

  setTaskGroupFilter: (groupId) => set({ taskGroupFilter: groupId }),

  saveTask: async (task) => {
    try {
      const existed = Boolean(get().config?.tasks.some((item) => item.id === task.id))
      const config = await window.api.saveTask(task)
      set({ config })
      toast.success(existed ? '同步任务已更新' : '同步任务已创建')
      return true
    } catch (error) {
      toastError('保存任务失败', error)
      return false
    }
  },

  deleteTask: async (id) => {
    try {
      const config = await window.api.deleteTask(id)
      set({ config })
      toast.success('同步任务已删除')
      return true
    } catch (error) {
      toastError('删除任务失败', error)
      return false
    }
  },

  setTaskEnabled: async (id, enabled) => {
    try {
      const config = await window.api.setTaskEnabled(id, enabled)
      set({ config })
      toast(enabled ? '已恢复定时同步' : '已暂停定时同步')
    } catch (error) {
      toastError('更新任务状态失败', error)
    }
  },

  runTask: async (id, postAction) => {
    try {
      await window.api.runTask(id, postAction)
      toast.success('已加入传输队列', {
        description: postAction && postAction !== 'none' ? '完成后将执行所选操作' : undefined
      })
      return true
    } catch (error) {
      toastError('启动同步失败', error)
      return false
    }
  },

  runAllTasks: async () => {
    try {
      const count = await window.api.runAllTasks()
      if (count > 0) toast.success(`已将 ${count} 个任务加入队列`)
      else toast('没有可运行的同步任务')
    } catch (error) {
      toastError('启动同步失败', error)
    }
  },

  cancelJob: async (id) => {
    try {
      await window.api.cancelJob(id)
    } catch (error) {
      toastError('取消传输失败', error)
    }
  },

  pauseJob: async (id) => {
    try {
      await window.api.pauseJob(id)
      toast('传输已暂停', {
        description: '继续后会从当前进度接着传输，不会从头开始'
      })
    } catch (error) {
      toastError('暂停传输失败', error)
    }
  },

  resumeJob: async (id) => {
    try {
      await window.api.resumeJob(id)
      toast.success('传输已继续')
    } catch (error) {
      toastError('继续传输失败', error)
    }
  },

  clearCompletedJobs: async () => {
    try {
      await window.api.clearCompletedJobs()
      set({ jobs: get().jobs.filter((job) => !isFinalStatus(job.status)) })
      toast.success('已清理本次会话记录')
    } catch (error) {
      toastError('清理记录失败', error)
    }
  },

  clearHistory: async () => {
    try {
      const config = await window.api.clearHistory()
      set({ config })
      toast.success('传输历史已清空')
    } catch (error) {
      toastError('清空历史失败', error)
    }
  },

  saveGroup: async (group) => {
    try {
      const config = await window.api.saveGroup(group)
      set({ config })
      toast.success('分组已保存')
      return true
    } catch (error) {
      toastError('保存分组失败', error)
      return false
    }
  },

  deleteGroup: async (id) => {
    try {
      const config = await window.api.deleteGroup(id)
      set({ config })
      toast.success('分组已删除')
      return true
    } catch (error) {
      toastError('删除分组失败', error)
      return false
    }
  },

  updateSettings: async (patch) => {
    try {
      const config = await window.api.updateSettings(patch)
      set({ config })
      return true
    } catch (error) {
      toastError('保存设置失败', error)
      return false
    }
  },

  refreshQuota: async () => {
    try {
      return await window.api.refreshQuota()
    } catch (error) {
      toastError('刷新空间信息失败', error)
      return null
    }
  },

  installRclone: async () => {
    if (get().installing) return false
    set({ installing: true })
    try {
      await window.api.installRclone()
      await get().reload()
      toast.success('rclone 传输引擎安装完成')
      return true
    } catch (error) {
      toastError('安装传输引擎失败', error)
      return false
    } finally {
      set({ installing: false })
    }
  },

  startLogin: async () => {
    if (!get().rclone?.installed) {
      toast.error('请先安装 rclone 传输引擎')
      return
    }
    set({
      loginOpen: true,
      loginBusy: true,
      loginState: { status: 'starting', message: '正在启动 Microsoft 登录…' }
    })
    try {
      await window.api.loginRclone()
      await get().reload()
      set({ loginOpen: false, loginBusy: false, loginState: { status: 'success' } })
      toast.success('OneDrive 已连接')
    } catch (error) {
      const message = errorMessage(error)
      if (/取消/.test(message)) {
        set({ loginBusy: false, loginOpen: false, loginState: { status: 'idle' } })
        return
      }
      set({ loginBusy: false, loginState: { status: 'error', message } })
      toastError('登录失败', error)
    }
  },

  cancelLogin: async () => {
    try {
      await window.api.cancelRcloneLogin()
    } catch {
      // ignore
    }
    set({ loginBusy: false, loginOpen: false, loginState: { status: 'idle' } })
  },

  closeLogin: () => {
    if (get().loginBusy) {
      void get().cancelLogin()
      return
    }
    set({ loginOpen: false })
  },

  logout: async () => {
    try {
      await window.api.logoutRclone()
      await get().reload()
      toast.success('已断开 OneDrive 账户')
      return true
    } catch (error) {
      toastError('断开账户失败', error)
      return false
    }
  },

  setRclonePath: async (path) => {
    try {
      const status = await window.api.setRclonePath(path)
      set({ rclone: status })
      toast.success(path ? '已切换到自定义 rclone' : '已恢复自动检测 rclone')
      return true
    } catch (error) {
      toastError('设置 rclone 路径失败', error)
      return false
    }
  },

  cancelShutdown: async () => {
    try {
      await window.api.cancelShutdown()
      set({ powerCountdown: null })
      toast.success('已取消自动关机')
    } catch (error) {
      toastError('取消关机失败', error)
    }
  },

  openTaskModal: (task = null) => set({ taskModal: { open: true, task } }),
  closeTaskModal: () => set({ taskModal: { open: false, task: null } }),
  setWindowMaximized: (value) => set({ windowMaximized: value })
}))

export function bindAppEvents(): () => void {
  if (eventsBound) return () => undefined
  eventsBound = true
  const api = window.api

  const unsubscribe = [
    api.onJobUpdate((job) => {
      const prev = useAppStore.getState().jobs.find((item) => item.id === job.id)
      const jobs = prev
        ? useAppStore.getState().jobs.map((item) => (item.id === job.id ? job : item))
        : [job, ...useAppStore.getState().jobs]
      useAppStore.setState({ jobs })
      if (prev && !isFinalStatus(prev.status) && isFinalStatus(job.status)) {
        const files = job.summary?.files ?? 0
        const bytes = job.summary?.bytes ?? job.progress.bytes
        if (job.trigger === 'schedule' && job.status === 'success' && files === 0) return
        if (job.status === 'success') {
          toast.success(job.taskName, {
            description: files > 0 ? `${files} 个文件 · ${formatBytes(bytes)}` : '已是最新状态'
          })
        } else if (job.status === 'error') {
          toast.error(`${job.taskName} 失败`, { description: job.error })
        } else {
          toast(`${job.taskName} 已取消`)
        }
      }
    }),
    api.onConfigChanged((config) => useAppStore.setState({ config })),
    api.onRcloneStatus((rclone) => useAppStore.setState({ rclone })),
    api.onDownloadProgress((download) => useAppStore.setState({ download })),
    api.onLoginState((loginState) => useAppStore.setState({ loginState })),
    api.onNavigate((page) => useAppStore.getState().setPage(page)),
    api.onPowerCountdown((powerCountdown) => useAppStore.setState({ powerCountdown })),
    api.onWindowMaximized((windowMaximized) => useAppStore.setState({ windowMaximized }))
  ]

  void api.isWindowMaximized().then((value) => useAppStore.setState({ windowMaximized: value }))

  return () => {
    unsubscribe.forEach((fn) => fn())
    eventsBound = false
  }
}

export function accountLabel(account: AccountInfo | null | undefined): string {
  if (!account) return '未登录'
  return account.displayName || account.email || 'OneDrive'
}
