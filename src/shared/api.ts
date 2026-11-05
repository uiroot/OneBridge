import type {
  AccountInfo,
  AppConfig,
  AppSettings,
  BootstrapData,
  DownloadProgress,
  JobView,
  LoginState,
  PageId,
  PostAction,
  PowerCountdown,
  PreviewResult,
  Quota,
  RcloneStatus,
  RemoteItem,
  RemoteSelection,
  SyncTask,
  TaskGroup
} from './types'

export type Unsubscribe = () => void

export interface OneBridgeApi {
  bootstrap(): Promise<BootstrapData>
  refreshQuota(): Promise<Quota | null>
  updateSettings(patch: Partial<AppSettings>): Promise<AppConfig>
  saveTask(task: SyncTask): Promise<AppConfig>
  deleteTask(id: string): Promise<AppConfig>
  setTaskEnabled(id: string, enabled: boolean): Promise<AppConfig>
  runTask(id: string, postAction?: PostAction): Promise<string>
  runAllTasks(): Promise<number>
  cancelJob(id: string): Promise<void>
  pauseJob(id: string): Promise<void>
  resumeJob(id: string): Promise<void>
  clearCompletedJobs(): Promise<void>
  clearHistory(): Promise<AppConfig>
  saveGroup(group: TaskGroup): Promise<AppConfig>
  deleteGroup(id: string): Promise<AppConfig>
  listFiles(path: string): Promise<RemoteItem[]>
  filesQuota(): Promise<Quota | null>
  uploadFiles(localPaths: string[], remotePath: string): Promise<string>
  downloadItems(items: RemoteSelection[], localDir: string): Promise<string>
  deleteItems(items: RemoteSelection[]): Promise<void>
  renameItem(item: RemoteSelection, newName: string): Promise<void>
  createFolder(parentPath: string, name: string): Promise<void>
  previewItem(item: RemoteSelection): Promise<PreviewResult>
  openItem(item: RemoteSelection): Promise<void>
  linkItem(item: RemoteSelection): Promise<string>
  inspectLocalPaths(paths: string[]): Promise<import('./types').LocalPathInfo[]>
  pickLocalFiles(): Promise<string[]>
  pickLocalFolder(): Promise<string | null>
  pickRcloneExe(): Promise<string | null>
  exportConfig(includeSecrets: boolean): Promise<string | null>
  importConfig(): Promise<boolean>
  openUserData(): Promise<void>
  openJobLog(jobId: string): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  installRclone(): Promise<RcloneStatus>
  loginRclone(): Promise<AccountInfo | null>
  cancelRcloneLogin(): Promise<void>
  openRcloneLoginUrl(): Promise<void>
  logoutRclone(): Promise<void>
  setRclonePath(path: string): Promise<RcloneStatus>
  cancelShutdown(): Promise<void>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  onJobUpdate(callback: (job: JobView) => void): Unsubscribe
  onConfigChanged(callback: (config: AppConfig) => void): Unsubscribe
  onRcloneStatus(callback: (status: RcloneStatus) => void): Unsubscribe
  onDownloadProgress(callback: (progress: DownloadProgress) => void): Unsubscribe
  onLoginState(callback: (state: LoginState) => void): Unsubscribe
  onNavigate(callback: (page: PageId) => void): Unsubscribe
  onPowerCountdown(callback: (countdown: PowerCountdown | null) => void): Unsubscribe
  onWindowMaximized(callback: (maximized: boolean) => void): Unsubscribe
}
