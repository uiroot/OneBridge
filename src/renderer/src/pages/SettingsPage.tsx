import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  Cloud,
  Copy,
  Download,
  FileJson2,
  FolderOpen,
  Gauge,
  HardDriveDownload,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Network,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  UploadCloud,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CHUNK_SIZE_OPTIONS,
  INTERVAL_PRESETS
} from '@shared/constants'
import type { AppSettings, ProxyMode, ProxyProtocol, ThemeMode } from '@shared/types'
import { errorMessage, useAppStore } from '../store/app'
import {
  clamp,
  cn,
  formatBytes,
  formatDateTime
} from '../lib/utils'
import { ConfirmDialog } from '../components/Dialogs'
import { PageHeader, SectionCard, Switch } from '../components/Layout'
import { Avatar, StorageBar } from '../components/Visuals'

const SOURCE_LABEL: Record<string, string> = {
  bundled: '应用内置',
  custom: '自定义路径',
  userData: '自动下载安装',
  path: '系统 PATH'
}

interface PerfDraft {
  transfers: number
  checkers: number
  chunkSize: string
  multiThreadStreams: number
  bandwidthLimit: string
}

interface ProxyDraft {
  mode: ProxyMode
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
}

export function SettingsPage(): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const rclone = useAppStore((state) => state.rclone)
  const download = useAppStore((state) => state.download)
  const installing = useAppStore((state) => state.installing)
  const appVersion = useAppStore((state) => state.appVersion)
  const platform = useAppStore((state) => state.platform)
  const userData = useAppStore((state) => state.userData)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const refreshQuota = useAppStore((state) => state.refreshQuota)
  const installRclone = useAppStore((state) => state.installRclone)
  const startLogin = useAppStore((state) => state.startLogin)
  const logout = useAppStore((state) => state.logout)
  const setRclonePath = useAppStore((state) => state.setRclonePath)

  const settings = config?.settings
  const account = config?.account
  const [perf, setPerf] = useState<PerfDraft>({
    transfers: 12,
    checkers: 24,
    chunkSize: '20M',
    multiThreadStreams: 8,
    bandwidthLimit: ''
  })
  const [savingPerf, setSavingPerf] = useState(false)
  const [proxy, setProxy] = useState<ProxyDraft>({
    mode: 'system',
    protocol: 'http',
    host: '',
    port: 7890,
    username: '',
    password: ''
  })
  const [savingProxy, setSavingProxy] = useState(false)
  const [quotaBusy, setQuotaBusy] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [includeSecrets, setIncludeSecrets] = useState(false)

  useEffect(() => {
    if (!settings) return
    setPerf({
      transfers: settings.transfers,
      checkers: settings.checkers,
      chunkSize: settings.chunkSize,
      multiThreadStreams: settings.multiThreadStreams,
      bandwidthLimit: settings.bandwidthLimit
    })
  }, [
    settings?.transfers,
    settings?.checkers,
    settings?.chunkSize,
    settings?.multiThreadStreams,
    settings?.bandwidthLimit
  ])

  useEffect(() => {
    if (!settings) return
    setProxy({
      mode: settings.proxyMode,
      protocol: settings.proxyProtocol,
      host: settings.proxyHost,
      port: settings.proxyPort,
      username: settings.proxyUsername,
      password: settings.proxyPassword
    })
  }, [
    settings?.proxyMode,
    settings?.proxyProtocol,
    settings?.proxyHost,
    settings?.proxyPort,
    settings?.proxyUsername,
    settings?.proxyPassword
  ])

  if (!settings) return <div className="page-shell" />

  const downloadActive = Boolean(download?.active)
  const quota = account?.quota
  const proxySummary =
    settings.proxyMode === 'system'
      ? '跟随系统代理'
      : settings.proxyMode === 'direct'
        ? '直连'
        : `${settings.proxyProtocol.toUpperCase()} · ${settings.proxyHost || '未填写'}:${settings.proxyPort}`
  const intervalOptions = Array.from(
    new Set([settings.defaultIntervalMinutes, ...INTERVAL_PRESETS])
  ).sort((a, b) => a - b)

  const savePerformance = async (): Promise<void> => {
    const limit = perf.bandwidthLimit.trim()
    if (limit && !/^\d+(\.\d+)?[kKmMgGtT]?$/.test(limit)) {
      toast.error('带宽格式不正确', { description: '请填写类似 10M、1G 的格式，或留空表示不限速。' })
      return
    }
    setSavingPerf(true)
    try {
      const ok = await updateSettings({
        transfers: clamp(Math.round(perf.transfers) || 12, 1, 32),
        checkers: clamp(Math.round(perf.checkers) || 24, 1, 64),
        chunkSize: perf.chunkSize,
        multiThreadStreams: clamp(Math.round(perf.multiThreadStreams) || 8, 1, 32),
        bandwidthLimit: limit
      })
      if (ok) toast.success('性能设置已保存')
    } finally {
      setSavingPerf(false)
    }
  }

  const saveProxy = async (): Promise<void> => {
    if (proxy.mode === 'custom') {
      if (!proxy.host.trim()) {
        toast.error('请填写代理服务器地址', { description: '例如 127.0.0.1，不要包含 http:// 前缀。' })
        return
      }
      if (!Number.isFinite(proxy.port) || proxy.port < 1 || proxy.port > 65_535) {
        toast.error('代理端口无效', { description: '请填写 1–65535 之间的端口，例如 7890。' })
        return
      }
    }
    setSavingProxy(true)
    try {
      const ok = await updateSettings({
        proxyMode: proxy.mode,
        proxyProtocol: proxy.protocol,
        proxyHost: proxy.host.trim(),
        proxyPort: proxy.port,
        proxyUsername: proxy.username.trim(),
        proxyPassword: proxy.password
      })
      if (ok) {
        toast.success(
          proxy.mode === 'custom'
            ? '已启用自定义代理'
            : proxy.mode === 'direct'
              ? '已切换为直连'
              : '已跟随系统代理',
          { description: '新的同步传输与登录请求会使用该设置。' }
        )
      }
    } finally {
      setSavingProxy(false)
    }
  }

  const refresh = async (): Promise<void> => {
    setQuotaBusy(true)
    try {
      const next = await refreshQuota()
      if (next) toast.success('OneDrive 空间信息已更新')
    } finally {
      setQuotaBusy(false)
    }
  }

  const pickRclone = async (): Promise<void> => {
    const file = await window.api.pickRcloneExe()
    if (!file) return
    await setRclonePath(file)
  }

  const resetRclone = async (): Promise<void> => {
    await setRclonePath('')
  }

  const exportConfig = async (): Promise<void> => {
    try {
      const filePath = await window.api.exportConfig(includeSecrets)
      if (filePath) {
        toast.success('配置已导出', { description: filePath })
      }
    } catch (cause) {
      toast.error('导出配置失败', { description: errorMessage(cause) })
    }
  }

  const setTheme = (theme: ThemeMode): void => {
    void updateSettings({ theme })
  }

  const toggle = (patch: Partial<AppSettings>): void => {
    void updateSettings(patch)
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="设置"
        subtitle="账户、传输引擎、性能与应用数据"
        actions={
          <button type="button" className="btn" onClick={() => void window.api.openUserData()}>
            <FolderOpen size={13} />
            打开数据目录
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          className="xl:col-span-2"
          title="OneDrive 账户"
          description="使用 Microsoft 个人账户授权，凭证仅存储在本机。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
              <Cloud size={14} />
            </span>
          }
          actions={
            account ? (
              <span className="badge badge-success">
                <BadgeCheck size={10} />
                已连接
              </span>
            ) : (
              <span className="badge">未连接</span>
            )
          }
          bodyClassName={account ? '!py-4' : '!py-0'}
        >
          {account ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={account.displayName || account.email || 'OneDrive'} size={42} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                    {account.displayName || account.email || 'OneDrive'}
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">
                    {account.email || '微软个人账户'}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-[var(--text-muted)]">
                    <span className="font-mono">{account.remoteName}:</span>
                    <span>连接于 {formatDateTime(account.connectedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-[260px]">
                <div className="flex items-center justify-between text-[9.5px] text-[var(--text-muted)]">
                  <span>存储空间</span>
                  <span>
                    {quota ? `${formatBytes(quota.used)} / ${formatBytes(quota.total)}` : '未知'}
                  </span>
                </div>
                <StorageBar used={quota?.used || 0} total={quota?.total || 0} className="mt-1.5" />
                <div className="mt-1 text-[9px] text-[var(--text-muted)]">
                  {quota ? `剩余 ${formatBytes(quota.total - quota.used)}` : '点击刷新以读取 OneDrive 空间'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
                <button type="button" className="btn btn-sm" onClick={() => void refresh()} disabled={quotaBusy}>
                  <RefreshCw size={12} className={quotaBusy ? 'animate-spin' : undefined} />
                  刷新空间
                </button>
                <button type="button" className="btn btn-sm" onClick={() => void startLogin()}>
                  <KeyRound size={12} />
                  重新授权
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setLogoutConfirm(true)}>
                  <LogOut size={12} />
                  断开账户
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 py-5 sm:flex-row sm:items-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-400">
                <Cloud size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-[var(--text)]">尚未连接 OneDrive</div>
                <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
                  {rclone?.installed
                    ? '登录后即可浏览、上传、下载文件，并创建定时镜像同步任务。'
                    : '先安装 rclone 传输引擎，然后连接 Microsoft 账户。'}
                </div>
              </div>
              <div className="flex gap-2">
                {!rclone?.installed ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void installRclone()}
                    disabled={installing}
                  >
                    {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    安装引擎
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => void startLogin()}>
                    连接 OneDrive
                  </button>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="传输引擎"
          description="OneBridge 使用 rclone 作为底层传输引擎，支持断点续传、分块上传与镜像同步。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <HardDriveDownload size={14} />
            </span>
          }
          actions={
            rclone?.installed ? (
              <span className="badge badge-success">
                <ShieldCheck size={10} />
                已就绪
              </span>
            ) : (
              <span className="badge badge-error">未安装</span>
            )
          }
        >
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge">
                  {rclone?.installed ? `rclone ${rclone.version || ''}` : '未检测到 rclone.exe'}
                </span>
                {rclone?.source ? <span className="badge">{SOURCE_LABEL[rclone.source] || rclone.source}</span> : null}
                {rclone?.path ? (
                  <span className="badge badge-muted !max-w-full">
                    <span className="truncate font-mono text-[9px]">{rclone.path}</span>
                  </span>
                ) : null}
              </div>

              {rclone?.error ? (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--warning-text)]">
                  {rclone.error}
                </div>
              ) : null}

              {download && (download.active || download.percent > 0 || download.error) ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex items-center gap-1.5 text-[var(--text-soft)]">
                      {download.active ? (
                        <Loader2 size={11} className="animate-spin text-sky-400" />
                      ) : (
                        <Info size={11} />
                      )}
                      {download.stage || '引擎下载'}
                    </span>
                    <span className="font-mono text-[var(--text-muted)]">{download.percent}%</span>
                  </div>
                  <div className="progress mt-2 !h-[4px]">
                    <span className="progress-bar" style={{ width: `${Math.max(1, download.percent)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-[var(--text-muted)]">
                    <span>
                      {formatBytes(download.received)} / {formatBytes(download.total)}
                    </span>
                    {download.error ? (
                      <span className="text-[var(--danger-text)]">{download.error}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void installRclone()}
                  disabled={installing || downloadActive}
                  title={rclone?.installed ? '重新下载独立引擎副本' : '下载并安装 rclone'}
                >
                  {installing || downloadActive ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  {rclone?.installed ? '下载最新引擎副本' : '下载并安装'}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => void pickRclone()}>
                  <FolderOpen size={12} />
                  选择 rclone.exe
                </button>
                {settings.rclonePath ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void resetRclone()}>
                    恢复自动检测
                  </button>
                ) : null}
              </div>
              <p className="hint leading-relaxed">
                若下载失败，可从 rclone.org 手动下载 Windows 版 rclone.exe，然后使用「选择 rclone.exe」指定路径。切换引擎后请重新登录账户。
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3.5">
              <div className="section-label">引擎参数</div>
              <div className="mt-2.5 space-y-2 text-[10.5px]">
                <InfoLine label="上传分块" value={settings.chunkSize} />
                <InfoLine label="并发传输" value={String(settings.transfers)} />
                <InfoLine label="并发检查" value={String(settings.checkers)} />
                <InfoLine label="多线程流" value={String(settings.multiThreadStreams)} />
                <InfoLine label="带宽限制" value={settings.bandwidthLimit || '不限速'} />
                <InfoLine label="断点续传" value="已启用" accent />
              </div>
              <div className="mt-3 flex items-start gap-1.5 border-t border-[var(--border)] pt-2.5">
                <ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-400" />
                <span className="text-[9px] leading-relaxed text-[var(--text-muted)]">
                  所有传输均在本机直接读取源文件，不会生成临时副本占用磁盘空间。
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="网络与代理"
          description="为 Microsoft 登录、同步传输与引擎下载统一配置网络出口。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
              <Network size={14} />
            </span>
          }
          actions={
            <span className={cn('badge', settings.proxyMode === 'custom' ? 'badge-info' : 'badge-muted')}>
              {proxySummary}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { value: 'system' as ProxyMode, label: '跟随系统', hint: '使用 Windows 系统代理', icon: Monitor },
                  { value: 'direct' as ProxyMode, label: '直连', hint: '忽略系统代理', icon: Zap },
                  { value: 'custom' as ProxyMode, label: '自定义代理', hint: 'HTTP / SOCKS5', icon: Network }
                ] as const
              ).map((option) => {
                const Icon = option.icon
                const active = proxy.mode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-sky-400/40 bg-sky-400/[0.08]'
                        : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]'
                    )}
                    onClick={() => setProxy((draft) => ({ ...draft, mode: option.value }))}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        active
                          ? 'border-sky-400/30 bg-sky-400/10 text-sky-400'
                          : 'border-[var(--border)] text-[var(--text-muted)]'
                      )}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11.5px] font-medium text-[var(--text-soft)]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[9.5px] text-[var(--text-muted)]">
                        {option.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {proxy.mode === 'custom' ? (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3.5">
                <div className="grid gap-3 sm:grid-cols-[110px_1fr_110px]">
                  <div>
                    <label className="label">协议</label>
                    <select
                      className="select"
                      value={proxy.protocol}
                      onChange={(event) =>
                        setProxy((draft) => ({
                          ...draft,
                          protocol: event.target.value as ProxyProtocol
                        }))
                      }
                    >
                      <option value="http">HTTP</option>
                      <option value="socks5">SOCKS5</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">服务器</label>
                    <input
                      className="input"
                      value={proxy.host}
                      placeholder="127.0.0.1"
                      spellCheck={false}
                      onChange={(event) =>
                        setProxy((draft) => ({ ...draft, host: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">端口</label>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={65_535}
                      value={proxy.port || ''}
                      placeholder="7890"
                      onChange={(event) => {
                        const parsed = Number(event.target.value)
                        setProxy((draft) => ({
                          ...draft,
                          port: Number.isFinite(parsed) ? Math.round(parsed) : 0
                        }))
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">用户名（可选）</label>
                    <input
                      className="input"
                      value={proxy.username}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        setProxy((draft) => ({ ...draft, username: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">密码（可选）</label>
                    <input
                      type="password"
                      className="input"
                      value={proxy.password}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setProxy((draft) => ({ ...draft, password: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void saveProxy()}
                disabled={savingProxy}
              >
                {savingProxy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                保存代理设置
              </button>
              <span className="text-[9.5px] text-[var(--text-muted)]">
                保存后立即生效；正在运行的传输保持原连接，新启动的传输使用新代理。
              </span>
            </div>

            <p className="hint">
              代理作用于 OneDrive 登录与配额查询、同步传输以及 rclone 引擎下载。支持 HTTP 与
              SOCKS5；如代理需要认证，请填写用户名和密码（仅保存在本机配置文件中）。
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="传输性能"
          description="默认不限速，使用多线程与分块上传尽快完成传输。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/10 text-violet-400">
              <Gauge size={14} />
            </span>
          }
          actions={
            <button
              type="button"
              className="btn btn-sm btn-soft"
              onClick={() => void savePerformance()}
              disabled={savingPerf}
            >
              {savingPerf ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              保存
            </button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="并发传输数"
              hint="同时传输的文件数量，多来源任务共享此上限"
              value={perf.transfers}
              min={1}
              max={32}
              onChange={(value) => setPerf((current) => ({ ...current, transfers: value }))}
            />
            <NumberField
              label="并发检查数"
              hint="扫描与比对文件的线程数"
              value={perf.checkers}
              min={1}
              max={64}
              onChange={(value) => setPerf((current) => ({ ...current, checkers: value }))}
            />
            <div>
              <label className="label">上传分块大小</label>
              <select
                className="select"
                value={perf.chunkSize}
                onChange={(event) => setPerf((current) => ({ ...current, chunkSize: event.target.value }))}
              >
                {CHUNK_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="hint mt-1">大文件按块上传，失败时只需重传当前块。</p>
            </div>
            <NumberField
              label="大文件多线程流"
              hint="超过 32 MB 的文件拆分为多流"
              value={perf.multiThreadStreams}
              min={1}
              max={32}
              onChange={(value) => setPerf((current) => ({ ...current, multiThreadStreams: value }))}
            />
          </div>
          <div className="mt-3">
            <label className="label flex items-center gap-1.5">
              <Zap size={11} /> 全局带宽限制
            </label>
            <input
              className="input selectable"
              value={perf.bandwidthLimit}
              onChange={(event) => setPerf((current) => ({ ...current, bandwidthLimit: event.target.value }))}
              placeholder="留空 = 不限速（推荐，最大化利用带宽）"
            />
            <p className="hint mt-1">
              可填写 10M、500K、1G 等单位。留空时 OneBridge 不会对 rclone 施加任何限速。
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="同步偏好"
          description="新任务的默认行为与应用级自动化。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-400">
              <Timer size={14} />
            </span>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="label">新任务默认同步间隔</label>
              <select
                className="select"
                value={settings.defaultIntervalMinutes}
                onChange={(event) => toggle({ defaultIntervalMinutes: Number(event.target.value) })}
              >
                {intervalOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes >= 1440
                      ? `${Math.round(minutes / 1440)} 天`
                      : minutes >= 60
                        ? `${Math.round(minutes / 60)} 小时`
                        : `${minutes} 分钟`}
                    {minutes === 30 ? ' · 推荐' : ''}
                  </option>
                ))}
              </select>
              <p className="hint mt-1">新建任务时默认使用此间隔，可在任务中单独修改。</p>
            </div>
            <div className="divider" />
            <SettingRow
              title="开机自动启动"
              description="Windows 登录后自动在托盘运行 OneBridge。"
              control={
                <Switch
                  checked={settings.launchAtLogin}
                  onChange={(value) => toggle({ launchAtLogin: value })}
                  label="开机自动启动"
                />
              }
            />
            <SettingRow
              title="关闭窗口时最小化到托盘"
              description="关闭按钮会隐藏窗口，同步任务继续在后台运行。"
              control={
                <Switch
                  checked={settings.closeToTray}
                  onChange={(value) => toggle({ closeToTray: value })}
                  label="关闭到托盘"
                />
              }
            />
            <SettingRow
              title="系统通知"
              description="同步完成或失败时显示 Windows 通知。"
              control={
                <Switch
                  checked={settings.notifications}
                  onChange={(value) => toggle({ notifications: value })}
                  label="系统通知"
                />
              }
            />
          </div>
        </SectionCard>

        <SectionCard
          title="外观"
          description="主题会立即应用，并跟随下发的系统配色。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-400/10 text-pink-400">
              <Sparkles size={14} />
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'dark' as ThemeMode, label: '深色', icon: Moon },
                { value: 'light' as ThemeMode, label: '浅色', icon: Sun },
                { value: 'system' as ThemeMode, label: '系统', icon: Monitor }
              ] as const
            ).map((option) => {
              const Icon = option.icon
              const active = settings.theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-colors',
                    active
                      ? 'border-sky-400/40 bg-sky-400/[0.08] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  )}
                  onClick={() => setTheme(option.value)}
                >
                  <span
                    className={cn(
                      'flex h-9 w-12 items-center justify-center rounded-lg border',
                      option.value === 'light'
                        ? 'border-slate-300 bg-slate-100 text-slate-600'
                        : option.value === 'dark'
                          ? 'border-slate-700 bg-slate-900 text-sky-400'
                          : 'border-[var(--border)] bg-gradient-to-r from-slate-900 from-50% to-slate-100 to-50% text-[var(--text-soft)]'
                    )}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="text-[10.5px] font-medium">{option.label}</span>
                  {active ? <span className="badge badge-info !h-[17px] !text-[8.5px]">当前</span> : null}
                </button>
              )
            })}
          </div>
          <p className="hint mt-3">
            深色主题采用与 OneDrive 匹配的深蓝灰配色；浅色主题适合明亮环境。
          </p>
        </SectionCard>

        <SectionCard
          title="配置与数据"
          description="导出任务、设置与账户凭证，或从备份恢复。"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
              <FileJson2 size={14} />
            </span>
          }
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3.5">
              <div className="text-[11px] font-semibold text-[var(--text-soft)]">导出配置</div>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                生成 JSON 文件，包含同步任务、分组、设置与传输历史。
              </p>
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[10.5px] text-[var(--text-soft)]">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={includeSecrets}
                  onChange={(event) => setIncludeSecrets(event.target.checked)}
                />
                包含 OneDrive 登录凭证（含敏感令牌）
              </label>
              {includeSecrets ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--warning-text)]">
                  <ShieldAlert size={10} className="mt-0.5 shrink-0" />
                  导出的文件可直接登录你的 OneDrive，请妥善保管，不要发送给他人。
                </div>
              ) : null}
              <button type="button" className="btn btn-sm btn-soft mt-2.5" onClick={() => void exportConfig()}>
                <Download size={12} />
                导出配置…
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setImportConfirm(true)}>
                <UploadCloud size={12} />
                导入配置
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void window.api.openUserData()}>
                <FolderOpen size={12} />
                打开数据目录
              </button>
            </div>
            <p className="hint">
              导入配置会覆盖当前任务与设置，并自动重启应用。包含凭证时会同时恢复 OneDrive 登录状态。
            </p>
          </div>
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="关于 OneBridge"
          description="现代化的 OneDrive 同步与传输客户端"
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
              <Info size={14} />
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBlock label="应用版本" value={`v${appVersion || '1.0.3'}`} />
            <InfoBlock label="传输引擎" value={rclone?.installed ? `rclone ${rclone.version || ''}` : '未安装'} />
            <InfoBlock label="运行平台" value={platform === 'win32' ? 'Windows' : platform || '—'} />
            <InfoBlock label="界面语言" value="简体中文" />
          </div>
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] text-[var(--text-muted)]">数据目录</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm !h-6 !px-2"
                onClick={() => {
                  void window.api.copyText(userData)
                  toast.success('数据目录已复制')
                }}
              >
                <Copy size={11} />
                复制
              </button>
            </div>
            <div className="selectable mt-0.5 break-all font-mono text-[9.5px] text-[var(--text-soft)]">
              {userData || '—'}
            </div>
          </div>
          <p className="hint mt-3">
            OneBridge 不收集任何使用数据。所有同步任务、账号凭证与日志都保存在本机数据目录中。
          </p>
        </SectionCard>
      </div>

      {logoutConfirm ? (
        <ConfirmDialog
          title="断开 OneDrive 账户"
          danger
          message="确定断开当前 OneDrive 账户吗？"
          detail="会从本机删除该账户的授权令牌。OneDrive 中的文件与同步任务不会受到影响，但自动同步将暂停，直到重新登录。"
          confirmLabel="断开连接"
          onConfirm={async () => {
            const ok = await logout()
            if (!ok) throw new Error('断开账户失败')
          }}
          onClose={() => setLogoutConfirm(false)}
        />
      ) : null}

      {importConfirm ? (
        <ConfirmDialog
          title="导入配置"
          danger
          message="导入会覆盖当前所有任务、分组与设置，并自动重启 OneBridge。"
          detail="建议先导出当前配置作为备份。如果导入文件包含 OneDrive 登录凭证，账户会自动恢复。"
          confirmLabel="选择文件并导入"
          onConfirm={async () => {
            const imported = await window.api.importConfig()
            if (imported) {
              toast.success('配置已导入，正在重启…')
            }
          }}
          onClose={() => setImportConfirm(false)}
        />
      ) : null}
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed)) return
          onChange(clamp(parsed, min, max))
        }}
      />
      <p className="hint mt-1">{hint}</p>
    </div>
  )
}

function SettingRow({
  title,
  description,
  control
}: {
  title: string
  description: string
  control: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-[var(--text-soft)]">{title}</div>
        <div className="mt-0.5 text-[9.5px] leading-relaxed text-[var(--text-muted)]">{description}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function InfoLine({
  label,
  value,
  accent = false
}: {
  label: string
  value: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn('font-mono text-[10px]', accent ? 'text-emerald-400' : 'text-[var(--text-soft)]')}>
        {value}
      </span>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[11.5px] font-medium text-[var(--text-soft)]" title={value}>
        {value}
      </div>
    </div>
  )
}
