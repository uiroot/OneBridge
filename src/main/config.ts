import { app } from 'electron'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AccountInfo,
  AppConfig,
  AppSettings,
  CheckMode,
  JobHistoryEntry,
  JobSummary,
  PostAction,
  PostActionScope,
  ProxyMode,
  ProxyProtocol,
  Quota,
  ScheduleMode,
  SyncMode,
  SyncTask,
  TaskGroup,
  ThemeMode,
  TransferPair
} from '@shared/types'
import { GROUP_COLORS } from '@shared/constants'

export const configEvents = new EventEmitter()

const CONFIG_VERSION = 1

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultIntervalMinutes: 30,
  transfers: 12,
  checkers: 24,
  chunkSize: '20M',
  multiThreadStreams: 8,
  bandwidthLimit: '',
  launchAtLogin: false,
  closeToTray: true,
  notifications: true,
  rclonePath: '',
  autoDownloadRclone: true,
  proxyMode: 'system',
  proxyProtocol: 'http',
  proxyHost: '',
  proxyPort: 7890,
  proxyUsername: '',
  proxyPassword: ''
}

let config: AppConfig | null = null
let configPath = ''

function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    account: null,
    groups: [],
    tasks: [],
    history: []
  }
}

export function initConfig(): AppConfig {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  configPath = path.join(dir, 'config.json')
  let loaded: unknown = null
  try {
    if (fs.existsSync(configPath)) {
      loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (error) {
    const broken = `${configPath}.broken-${Date.now()}`
    try {
      fs.copyFileSync(configPath, broken)
    } catch {
      // ignore
    }
    console.warn('[config] 读取配置失败，已使用默认配置', error)
  }
  config = sanitizeConfig(loaded)
  saveConfig()
  return config
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('配置尚未初始化')
  return config
}

export function getConfigPath(): string {
  return configPath
}

export function saveConfig(): void {
  if (!config || !configPath) return
  const payload = JSON.stringify(config, null, 2)
  const tmp = `${configPath}.tmp`
  fs.writeFileSync(tmp, payload, 'utf8')
  try {
    fs.renameSync(tmp, configPath)
  } catch {
    fs.copyFileSync(tmp, configPath)
    fs.rmSync(tmp, { force: true })
  }
}

function commit(): AppConfig {
  saveConfig()
  configEvents.emit('changed', config)
  return config!
}

export function patchSettings(patch: Partial<AppSettings>): AppConfig {
  const current = getConfig()
  current.settings = sanitizeSettings({ ...current.settings, ...patch })
  return commit()
}

export function updateAccount(account: AccountInfo | null): AppConfig {
  const current = getConfig()
  current.account = account ? sanitizeAccount(account) : null
  return commit()
}

export function updateQuota(quota: Quota | null): AppConfig {
  const current = getConfig()
  if (!current.account) return current
  current.account.quota = quota ? sanitizeQuota(quota) : undefined
  return commit()
}

export function upsertTask(input: SyncTask): AppConfig {
  const current = getConfig()
  const existing = current.tasks.find((task) => task.id === input.id)
  const normalized = sanitizeTask(input)
  if (!normalized) throw new Error('任务数据无效，请至少添加一个来源')
  const now = Date.now()
  normalized.createdAt = existing?.createdAt ?? normalized.createdAt ?? now
  normalized.updatedAt = now
  normalized.lastRunAt = existing?.lastRunAt
  normalized.lastResult = existing?.lastResult
  normalized.lastError = existing?.lastError
  normalized.pairs = normalized.pairs.map((pair) => ({ ...pair, id: pair.id || randomUUID() }))

  const scheduleChanged =
    !existing ||
    existing.schedule !== normalized.schedule ||
    existing.intervalMinutes !== normalized.intervalMinutes ||
    (!existing.enabled && normalized.enabled)
  if (normalized.schedule === 'manual' || !normalized.enabled) {
    normalized.nextRunAt = undefined
  } else if (scheduleChanged || !existing?.nextRunAt) {
    normalized.nextRunAt = now + (existing ? normalized.intervalMinutes * 60_000 : 15_000)
  } else {
    normalized.nextRunAt = existing.nextRunAt
  }

  if (existing) {
    current.tasks = current.tasks.map((task) => (task.id === normalized.id ? normalized : task))
  } else {
    current.tasks.unshift(normalized)
  }
  return commit()
}

export function deleteTask(id: string): AppConfig {
  const current = getConfig()
  current.tasks = current.tasks.filter((task) => task.id !== id)
  return commit()
}

export function setTaskEnabled(id: string, enabled: boolean): AppConfig {
  const current = getConfig()
  const task = current.tasks.find((item) => item.id === id)
  if (task) {
    task.enabled = enabled
    task.updatedAt = Date.now()
    if (!enabled || task.schedule === 'manual') task.nextRunAt = undefined
    else task.nextRunAt = Date.now() + 15_000
  }
  return commit()
}

export function markTaskQueued(id: string): AppConfig {
  const current = getConfig()
  const task = current.tasks.find((item) => item.id === id)
  if (task) {
    if (task.schedule === 'interval' && task.enabled) {
      task.nextRunAt = Date.now() + task.intervalMinutes * 60_000
      saveConfig()
      configEvents.emit('changed', current)
    }
  }
  return current
}

export function updateTaskAfterRun(
  id: string,
  result: 'success' | 'error' | 'cancelled',
  error?: string
): AppConfig {
  const current = getConfig()
  const task = current.tasks.find((item) => item.id === id)
  if (task) {
    task.lastRunAt = Date.now()
    task.lastResult = result
    task.lastError = result === 'error' ? (error || '同步失败').slice(0, 1000) : undefined
    if (task.enabled && task.schedule === 'interval') {
      task.nextRunAt = Date.now() + task.intervalMinutes * 60_000
    } else {
      task.nextRunAt = undefined
    }
  }
  return commit()
}

export function addHistory(entry: JobHistoryEntry): AppConfig {
  const current = getConfig()
  current.history.unshift(entry)
  current.history = current.history.slice(0, 120)
  return commit()
}

export function clearHistory(): AppConfig {
  const current = getConfig()
  current.history = []
  return commit()
}

export function upsertGroup(group: TaskGroup): AppConfig {
  const current = getConfig()
  const normalized = sanitizeGroup(group)
  if (!normalized) throw new Error('分组名称不能为空')
  const existing = current.groups.find((item) => item.id === normalized.id)
  if (existing) {
    current.groups = current.groups.map((item) => (item.id === normalized.id ? normalized : item))
  } else {
    current.groups.push(normalized)
  }
  return commit()
}

export function deleteGroup(id: string): AppConfig {
  const current = getConfig()
  current.groups = current.groups.filter((group) => group.id !== id)
  current.tasks = current.tasks.map((task) =>
    task.groupId === id ? { ...task, groupId: null } : task
  )
  return commit()
}

export function replaceConfig(next: unknown): AppConfig {
  config = sanitizeConfig(next)
  saveConfig()
  configEvents.emit('changed', config)
  return config
}

export function exportPayload(includeSecrets: boolean, rcloneConfig: string | null): string {
  return JSON.stringify(
    {
      kind: 'onebridge-config',
      version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      appConfig: getConfig(),
      rcloneConfig: includeSecrets ? rcloneConfig : null
    },
    null,
    2
  )
}

export function sanitizeConfig(raw: unknown): AppConfig {
  const base = defaultConfig()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Record<string, unknown>
  const settings = sanitizeSettings(
    input.settings && typeof input.settings === 'object'
      ? (input.settings as Partial<AppSettings>)
      : {}
  )
  const account = sanitizeAccount(input.account)
  const groups = Array.isArray(input.groups)
    ? input.groups.map((item) => sanitizeGroup(item)).filter((item): item is TaskGroup => !!item)
    : []
  const groupIds = new Set(groups.map((group) => group.id))
  const tasks = Array.isArray(input.tasks)
    ? input.tasks
        .map((item) => sanitizeTask(item))
        .filter((item): item is SyncTask => !!item)
        .map((task) =>
          task.groupId && !groupIds.has(task.groupId) ? { ...task, groupId: null } : task
        )
    : []
  const history = Array.isArray(input.history)
    ? input.history
        .map((item) => sanitizeHistory(item))
        .filter((item): item is JobHistoryEntry => !!item)
        .slice(0, 120)
    : []

  return {
    ...base,
    version: CONFIG_VERSION,
    settings,
    account,
    groups,
    tasks,
    history
  }
}

function sanitizeSettings(raw: Partial<AppSettings>): AppSettings {
  const num = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.round(parsed)))
  }
  const theme: ThemeMode = ['dark', 'light', 'system'].includes(String(raw.theme))
    ? (raw.theme as ThemeMode)
    : DEFAULT_SETTINGS.theme
  const chunk = ['10M', '20M', '40M', '60M'].includes(String(raw.chunkSize))
    ? String(raw.chunkSize)
    : DEFAULT_SETTINGS.chunkSize
  const proxyMode: ProxyMode = ['system', 'direct', 'custom'].includes(String(raw.proxyMode))
    ? (raw.proxyMode as ProxyMode)
    : DEFAULT_SETTINGS.proxyMode
  const proxyProtocol: ProxyProtocol = ['http', 'socks5'].includes(String(raw.proxyProtocol))
    ? (raw.proxyProtocol as ProxyProtocol)
    : DEFAULT_SETTINGS.proxyProtocol
  return {
    theme,
    defaultIntervalMinutes: num(
      raw.defaultIntervalMinutes,
      DEFAULT_SETTINGS.defaultIntervalMinutes,
      1,
      10_080
    ),
    transfers: num(raw.transfers, DEFAULT_SETTINGS.transfers, 1, 32),
    checkers: num(raw.checkers, DEFAULT_SETTINGS.checkers, 1, 64),
    chunkSize: chunk,
    multiThreadStreams: num(raw.multiThreadStreams, DEFAULT_SETTINGS.multiThreadStreams, 1, 32),
    bandwidthLimit: sanitizeBandwidth(raw.bandwidthLimit),
    launchAtLogin: Boolean(raw.launchAtLogin),
    closeToTray: raw.closeToTray === undefined ? DEFAULT_SETTINGS.closeToTray : Boolean(raw.closeToTray),
    notifications:
      raw.notifications === undefined ? DEFAULT_SETTINGS.notifications : Boolean(raw.notifications),
    rclonePath: typeof raw.rclonePath === 'string' ? raw.rclonePath.trim() : '',
    autoDownloadRclone:
      raw.autoDownloadRclone === undefined
        ? DEFAULT_SETTINGS.autoDownloadRclone
        : Boolean(raw.autoDownloadRclone),
    proxyMode,
    proxyProtocol,
    proxyHost: sanitizeProxyHost(raw.proxyHost),
    proxyPort: num(raw.proxyPort, DEFAULT_SETTINGS.proxyPort, 1, 65_535),
    proxyUsername: typeof raw.proxyUsername === 'string' ? raw.proxyUsername.trim().slice(0, 200) : '',
    proxyPassword: typeof raw.proxyPassword === 'string' ? raw.proxyPassword.slice(0, 400) : ''
  }
}

function sanitizeProxyHost(value: unknown): string {
  if (typeof value !== 'string') return ''
  let host = value.trim()
  if (!host) return ''
  host = host.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
  host = host.replace(/^[^/@]*@/, '')
  host = host.replace(/[/?#].*$/, '')
  return host.slice(0, 200)
}

function sanitizeBandwidth(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^\d+(\.\d+)?[kKmMgGtT]?$/.test(trimmed) ? trimmed : ''
}

function sanitizeTask(raw: unknown): SyncTask | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''
  if (!name) return null
  const mode: SyncMode = ['mirror-upload', 'mirror-download', 'upload', 'download'].includes(
    String(input.mode)
  )
    ? (input.mode as SyncMode)
    : 'mirror-upload'
  const pairs = Array.isArray(input.pairs)
    ? input.pairs
        .map((item) => sanitizePair(item))
        .filter((pair): pair is TransferPair => !!pair)
        .slice(0, 60)
    : []
  if (!pairs.length) return null
  const schedule: ScheduleMode = input.schedule === 'manual' ? 'manual' : 'interval'
  const intervalRaw = typeof input.intervalMinutes === 'number' ? input.intervalMinutes : 30
  const intervalMinutes = Math.min(10_080, Math.max(1, Math.round(intervalRaw)))
  const checkMode: CheckMode = input.checkMode === 'checksum' ? 'checksum' : 'size-time'
  const postAction: PostAction = [
    'none',
    'monitor-off',
    'lock',
    'sleep',
    'hibernate',
    'shutdown'
  ].includes(String(input.postAction))
    ? (input.postAction as PostAction)
    : 'none'
  const postActionScope: PostActionScope = input.postActionScope === 'always' ? 'always' : 'manual'
  const lastResult = ['success', 'error', 'cancelled'].includes(String(input.lastResult))
    ? (input.lastResult as 'success' | 'error' | 'cancelled')
    : undefined
  const now = Date.now()
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled)
  const nextRunAtRaw = typeof input.nextRunAt === 'number' ? input.nextRunAt : undefined
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    name,
    groupId: typeof input.groupId === 'string' && input.groupId ? input.groupId : null,
    mode,
    pairs,
    schedule,
    intervalMinutes,
    enabled,
    checkMode,
    deleteExtraneous: input.deleteExtraneous === undefined ? true : Boolean(input.deleteExtraneous),
    excludes: Array.isArray(input.excludes)
      ? input.excludes
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 80)
      : [],
    bandwidthLimit: sanitizeBandwidth(input.bandwidthLimit),
    postAction,
    postActionScope,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : now,
    lastRunAt: typeof input.lastRunAt === 'number' ? input.lastRunAt : undefined,
    lastResult,
    lastError: typeof input.lastError === 'string' ? input.lastError.slice(0, 1000) : undefined,
    nextRunAt:
      enabled && schedule === 'interval'
        ? nextRunAtRaw && nextRunAtRaw > now - 86_400_000
          ? nextRunAtRaw
          : now + 30_000
        : undefined
  }
}

function sanitizePair(raw: unknown): TransferPair | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const localPath = typeof input.localPath === 'string' ? input.localPath.trim() : ''
  if (!localPath) return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    localPath,
    remotePath: normalizeRemotePath(typeof input.remotePath === 'string' ? input.remotePath : '')
  }
}

export function normalizeRemotePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
}

function sanitizeGroup(raw: unknown): TaskGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 30) : ''
  if (!name) return null
  const color = /^#[0-9a-fA-F]{6}$/.test(String(input.color))
    ? String(input.color)
    : GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    name,
    color,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now()
  }
}

function sanitizeAccount(raw: unknown): AccountInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const remoteName = typeof input.remoteName === 'string' ? input.remoteName.trim() : ''
  if (!remoteName) return null
  return {
    remoteName,
    displayName: typeof input.displayName === 'string' ? input.displayName : undefined,
    email: typeof input.email === 'string' ? input.email : undefined,
    connectedAt: typeof input.connectedAt === 'number' ? input.connectedAt : Date.now(),
    quota: sanitizeQuota(input.quota)
  }
}

function sanitizeQuota(raw: unknown): Quota | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const input = raw as Record<string, unknown>
  const total = Number(input.total)
  const used = Number(input.used)
  const free = Number(input.free)
  if (!Number.isFinite(used) || used < 0) return undefined
  return {
    total: Number.isFinite(total) && total > 0 ? total : 0,
    used,
    free: Number.isFinite(free) && free >= 0 ? free : undefined
  } as Quota
}

function sanitizeHistory(raw: unknown): JobHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const status = ['success', 'error', 'cancelled'].includes(String(input.status))
    ? (input.status as 'success' | 'error' | 'cancelled')
    : null
  if (!status) return null
  const summaryRaw =
    input.summary && typeof input.summary === 'object'
      ? (input.summary as Record<string, unknown>)
      : {}
  const summary: JobSummary = {
    bytes: Number(summaryRaw.bytes) || 0,
    files: Number(summaryRaw.files) || 0,
    errors: Number(summaryRaw.errors) || 0,
    elapsedMs: Number(summaryRaw.elapsedMs) || 0,
    checks: Number(summaryRaw.checks) || undefined,
    deletes: Number(summaryRaw.deletes) || undefined
  }
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    jobId: typeof input.jobId === 'string' ? input.jobId : '',
    taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
    taskName: typeof input.taskName === 'string' ? input.taskName.slice(0, 200) : '传输任务',
    trigger: ['manual', 'schedule', 'browser'].includes(String(input.trigger))
      ? (input.trigger as JobHistoryEntry['trigger'])
      : 'manual',
    status,
    startedAt: Number(input.startedAt) || Date.now(),
    finishedAt: Number(input.finishedAt) || Date.now(),
    summary,
    error: typeof input.error === 'string' ? input.error.slice(0, 2000) : undefined,
    postAction:
      typeof input.postAction === 'string' ? (input.postAction as PostAction) : undefined,
    logName: typeof input.logName === 'string' ? input.logName : undefined
  }
}
