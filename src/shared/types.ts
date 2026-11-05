export const APP_NAME = 'OneBridge'
export const APP_VERSION_FALLBACK = '1.0.3'

export type ThemeMode = 'dark' | 'light' | 'system'
export type SyncMode = 'mirror-upload' | 'mirror-download' | 'upload' | 'download'
export type ScheduleMode = 'interval' | 'manual'
export type CheckMode = 'size-time' | 'checksum'
export type PostAction = 'none' | 'monitor-off' | 'lock' | 'sleep' | 'hibernate' | 'shutdown'
export type PostActionScope = 'manual' | 'always'
export type ProxyMode = 'system' | 'direct' | 'custom'
export type ProxyProtocol = 'http' | 'socks5'
export type JobTrigger = 'manual' | 'schedule' | 'browser'
export type JobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'success'
  | 'error'
  | 'cancelled'
export type TaskHealth = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'paused'
export type PageId = 'dashboard' | 'tasks' | 'files' | 'transfers' | 'settings'

export interface TaskGroup {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface TransferPair {
  id: string
  localPath: string
  /** Path relative to the OneDrive remote root. Empty string means root. */
  remotePath: string
}

export interface SyncTask {
  id: string
  name: string
  groupId: string | null
  mode: SyncMode
  pairs: TransferPair[]
  schedule: ScheduleMode
  intervalMinutes: number
  enabled: boolean
  checkMode: CheckMode
  deleteExtraneous: boolean
  excludes: string[]
  bandwidthLimit: string
  postAction: PostAction
  postActionScope: PostActionScope
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  lastResult?: 'success' | 'error' | 'cancelled'
  lastError?: string
  nextRunAt?: number
}

export interface AppSettings {
  theme: ThemeMode
  defaultIntervalMinutes: number
  transfers: number
  checkers: number
  chunkSize: string
  multiThreadStreams: number
  bandwidthLimit: string
  launchAtLogin: boolean
  closeToTray: boolean
  notifications: boolean
  rclonePath: string
  autoDownloadRclone: boolean
  proxyMode: ProxyMode
  proxyProtocol: ProxyProtocol
  proxyHost: string
  proxyPort: number
  proxyUsername: string
  proxyPassword: string
}

export interface Quota {
  total: number
  used: number
  free: number
}

export interface AccountInfo {
  remoteName: string
  displayName?: string
  email?: string
  connectedAt: number
  quota?: Quota
}

export interface JobSummary {
  bytes: number
  files: number
  errors: number
  elapsedMs: number
  checks?: number
  deletes?: number
}

export interface JobHistoryEntry {
  id: string
  jobId: string
  taskId?: string
  taskName: string
  trigger: JobTrigger
  status: Exclude<JobStatus, 'queued' | 'running' | 'paused' | 'cancelling'>
  startedAt: number
  finishedAt: number
  summary: JobSummary
  error?: string
  postAction?: PostAction
  logName?: string
}

export interface AppConfig {
  version: number
  settings: AppSettings
  account: AccountInfo | null
  groups: TaskGroup[]
  tasks: SyncTask[]
  history: JobHistoryEntry[]
}

export interface FileProgress {
  name: string
  bytes: number
  size: number
  percentage: number
  speed: number
}

export interface JobProgress {
  bytes: number
  totalBytes: number
  percentage: number
  speed: number
  etaSeconds: number | null
  transfers: number
  totalTransfers: number
  checks: number
  errors: number
  deletes: number
  files: FileProgress[]
}

export interface JobView {
  id: string
  taskId?: string
  taskName: string
  trigger: JobTrigger
  status: JobStatus
  progress: JobProgress
  startedAt: number
  finishedAt?: number
  error?: string
  currentStep: number
  stepCount: number
  /** Number of steps that have finished successfully or with an error. */
  completedSteps?: number
  /** Number of steps currently transferring in parallel. */
  activeStepCount?: number
  sourceLabel: string
  destinationLabel: string
  postAction: PostAction
  summary?: JobSummary
  logName?: string
  queuedAt: number
}

export type RcloneSource = 'bundled' | 'custom' | 'userData' | 'path'

export interface DownloadProgress {
  active: boolean
  percent: number
  received: number
  total: number
  stage: string
  error?: string
}

export interface RcloneStatus {
  installed: boolean
  version?: string
  path?: string
  source?: RcloneSource
  error?: string
  download?: DownloadProgress
}

export interface LoginState {
  status: 'idle' | 'starting' | 'waiting' | 'success' | 'error'
  message?: string
  authUrl?: string
}

export interface RemoteItem {
  name: string
  path: string
  isDir: boolean
  size: number
  modTime: string
  mimeType: string
  hashes?: Record<string, string>
}

export interface PreviewText {
  kind: 'text'
  name: string
  size: number
  text: string
  truncated: boolean
}

export interface PreviewImage {
  kind: 'image'
  name: string
  size: number
  dataUrl: string
  mimeType: string
}

export interface PreviewUnsupported {
  kind: 'unsupported'
  name: string
  size: number
  mimeType: string
}

export type PreviewResult = PreviewText | PreviewImage | PreviewUnsupported

export interface BootstrapData {
  config: AppConfig
  rclone: RcloneStatus
  jobs: JobView[]
  appVersion: string
  platform: string
  userData: string
}

export interface PowerCountdown {
  action: PostAction
  jobName: string
  seconds: number
}

export interface TaskRunOptions {
  postAction?: PostAction
}

export interface RemoteSelection {
  name: string
  path: string
  isDir: boolean
}

export interface LocalPathInfo {
  path: string
  name: string
  isDir: boolean
  size: number
}
