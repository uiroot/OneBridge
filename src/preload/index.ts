import { contextBridge, ipcRenderer } from 'electron'
import type { OneBridgeApi, Unsubscribe } from '@shared/api'
import type { PageId, PostAction, PowerCountdown, SyncTask, TaskGroup } from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OneBridgeApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  refreshQuota: () => ipcRenderer.invoke('app:refresh-quota'),
  updateSettings: (patch) => ipcRenderer.invoke('config:update-settings', patch),
  saveTask: (task: SyncTask) => ipcRenderer.invoke('tasks:save', task),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  setTaskEnabled: (id, enabled) => ipcRenderer.invoke('tasks:set-enabled', id, enabled),
  runTask: (id: string, postAction?: PostAction) =>
    ipcRenderer.invoke('tasks:run', id, postAction),
  runAllTasks: () => ipcRenderer.invoke('tasks:run-all'),
  cancelJob: (id) => ipcRenderer.invoke('jobs:cancel', id),
  pauseJob: (id) => ipcRenderer.invoke('jobs:pause', id),
  resumeJob: (id) => ipcRenderer.invoke('jobs:resume', id),
  clearCompletedJobs: () => ipcRenderer.invoke('jobs:clear-completed'),
  clearHistory: () => ipcRenderer.invoke('config:clear-history'),
  saveGroup: (group: TaskGroup) => ipcRenderer.invoke('groups:save', group),
  deleteGroup: (id) => ipcRenderer.invoke('groups:delete', id),
  listFiles: (remotePath) => ipcRenderer.invoke('files:list', remotePath),
  filesQuota: () => ipcRenderer.invoke('files:quota'),
  uploadFiles: (localPaths, remotePath) =>
    ipcRenderer.invoke('files:upload', localPaths, remotePath),
  downloadItems: (items, localDir) => ipcRenderer.invoke('files:download', items, localDir),
  deleteItems: (items) => ipcRenderer.invoke('files:delete', items),
  renameItem: (item, newName) => ipcRenderer.invoke('files:rename', item, newName),
  createFolder: (parentPath, name) =>
    ipcRenderer.invoke('files:create-folder', parentPath, name),
  previewItem: (item) => ipcRenderer.invoke('files:preview', item),
  openItem: (item) => ipcRenderer.invoke('files:open', item),
  linkItem: (item) => ipcRenderer.invoke('files:link', item),
  inspectLocalPaths: (paths) => ipcRenderer.invoke('files:inspect-local', paths),
  pickLocalFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  pickLocalFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickRcloneExe: () => ipcRenderer.invoke('dialog:pick-rclone'),
  exportConfig: (includeSecrets) => ipcRenderer.invoke('config:export', includeSecrets),
  importConfig: () => ipcRenderer.invoke('config:import'),
  openUserData: () => ipcRenderer.invoke('app:open-user-data'),
  openJobLog: (jobId) => ipcRenderer.invoke('app:open-log', jobId),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  copyText: (text) => ipcRenderer.invoke('app:copy-text', text),
  installRclone: () => ipcRenderer.invoke('rclone:install'),
  loginRclone: () => ipcRenderer.invoke('rclone:login'),
  cancelRcloneLogin: () => ipcRenderer.invoke('rclone:cancel-login'),
  openRcloneLoginUrl: () => ipcRenderer.invoke('rclone:open-login-url'),
  logoutRclone: () => ipcRenderer.invoke('rclone:logout'),
  setRclonePath: (path) => ipcRenderer.invoke('rclone:set-path', path),
  cancelShutdown: () => ipcRenderer.invoke('power:cancel-shutdown'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onJobUpdate: (callback) => on('job:update', callback),
  onConfigChanged: (callback) => on('config:changed', callback),
  onRcloneStatus: (callback) => on('rclone:status', callback),
  onDownloadProgress: (callback) => on('rclone:download', callback),
  onLoginState: (callback) => on('login:state', callback),
  onNavigate: (callback: (page: PageId) => void) => on('navigate', callback),
  onPowerCountdown: (callback: (countdown: PowerCountdown | null) => void) =>
    on('power:countdown', callback),
  onWindowMaximized: (callback) => on('window:maximized', callback)
}

contextBridge.exposeInMainWorld('api', api)
