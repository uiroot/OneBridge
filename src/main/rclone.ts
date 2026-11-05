import { app, net, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type {
  AccountInfo,
  AppSettings,
  DownloadProgress,
  LoginState,
  PreviewResult,
  Quota,
  RcloneSource,
  RcloneStatus,
  RemoteItem
} from '@shared/types'
import { log } from './logger'
import { proxyEnv } from './proxy'

const RCLONE_DOWNLOAD_URL = 'https://downloads.rclone.org/rclone-current-windows-amd64.zip'
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
const LOGIN_TIMEOUT_MS = 5 * 60_000

interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
}

interface ExecOptions {
  timeoutMs?: number
  maxOutput?: number
}

interface DriveIdentity {
  driveId: string
  driveType: 'personal' | 'business' | 'documentLibrary'
  displayName?: string
  email?: string
}

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/svg+xml'
])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg'])
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonc', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.css', '.scss', '.html', '.htm', '.xml', '.yml', '.yaml', '.toml', '.ini', '.conf', '.log',
  '.csv', '.tsv', '.sh', '.ps1', '.bat', '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.hpp',
  '.sql', '.env', '.gitignore', '.editorconfig', '.srt', '.vtt'
])

export class RcloneManager extends EventEmitter {
  private status: RcloneStatus = { installed: false }
  private binPath: string | null = null
  private readonly configFile: string
  private installPromise: Promise<RcloneStatus> | null = null
  private loginChild: ChildProcess | null = null
  private loginCancelled = false
  private authUrl: string | null = null
  private downloadProgress: DownloadProgress = {
    active: false,
    percent: 0,
    received: 0,
    total: 0,
    stage: ''
  }

  constructor(private readonly getSettings: () => AppSettings) {
    super()
    this.configFile = path.join(app.getPath('userData'), 'rclone.conf')
  }

  getConfigPath(): string {
    return this.configFile
  }

  getBinaryPath(): string {
    return this.requireBin()
  }

  getStatus(): RcloneStatus {
    return this.status
  }

  getAuthUrl(): string | null {
    return this.authUrl
  }

  async init(): Promise<RcloneStatus> {
    return this.resolve()
  }

  private emitStatus(): void {
    this.emit('status', this.status)
  }

  private emitDownload(): void {
    this.emit('download', this.downloadProgress)
  }

  private emitLogin(state: LoginState): void {
    this.emit('login', state)
  }

  private bundledPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'rclone.exe')
      : path.join(app.getAppPath(), 'resources', 'bin', 'rclone.exe')
  }

  private userDataPath(): string {
    return path.join(app.getPath('userData'), 'bin', 'rclone.exe')
  }

  async resolve(): Promise<RcloneStatus> {
    const settings = this.getSettings()
    const candidates: Array<{ file: string; source: RcloneSource }> = []
    let customError: string | undefined

    if (settings.rclonePath) {
      if (fs.existsSync(settings.rclonePath)) {
        candidates.push({ file: settings.rclonePath, source: 'custom' })
      } else {
        customError = `自定义 rclone 路径不存在：${settings.rclonePath}`
      }
    }
    candidates.push({ file: this.bundledPath(), source: 'bundled' })
    candidates.push({ file: this.userDataPath(), source: 'userData' })

    let found: { file: string; source: RcloneSource; version: string } | null = null
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate.file)) continue
      try {
        const version = await this.getVersion(candidate.file)
        found = { file: candidate.file, source: candidate.source, version }
        break
      } catch (error) {
        customError = `rclone 无法运行：${error instanceof Error ? error.message : String(error)}`
      }
    }

    if (!found) {
      const pathBinary = await this.findInPath()
      if (pathBinary) {
        try {
          found = {
            file: pathBinary,
            source: 'path',
            version: await this.getVersion(pathBinary)
          }
        } catch {
          // ignore broken PATH install
        }
      }
    }

    if (found) {
      this.binPath = found.file
      this.status = {
        installed: true,
        path: found.file,
        version: found.version,
        source: found.source,
        error: customError,
        download: this.downloadProgress
      }
    } else {
      this.binPath = null
      this.status = {
        installed: false,
        error: customError || '尚未安装 rclone 传输引擎',
        download: this.downloadProgress
      }
    }
    log('info', 'rclone status', this.status)
    this.emitStatus()
    return this.status
  }

  private async findInPath(): Promise<string | null> {
    try {
      const result = await spawnCapture(
        process.platform === 'win32' ? 'where.exe' : 'which',
        ['rclone'],
        { timeoutMs: 10_000 }
      )
      if (result.code !== 0) return null
      const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
      return first && fs.existsSync(first) ? first : null
    } catch {
      return null
    }
  }

  private async getVersion(bin: string): Promise<string> {
    const result = await spawnCapture(bin, ['version'], { timeoutMs: 20_000 })
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `退出码 ${result.code}`)
    }
    const firstLine = result.stdout.split(/\r?\n/)[0] || ''
    const match = firstLine.match(/rclone\s+v?([\w.\-]+)/i)
    return match ? match[1] : firstLine.trim()
  }

  async testBinary(file: string): Promise<RcloneStatus> {
    if (!fs.existsSync(file)) throw new Error('文件不存在')
    const version = await this.getVersion(file)
    this.binPath = file
    this.status = {
      installed: true,
      path: file,
      version,
      source: 'custom',
      download: this.downloadProgress
    }
    this.emitStatus()
    return this.status
  }

  private requireBin(): string {
    if (!this.binPath) throw new Error('rclone 尚未安装，请先在设置中安装传输引擎')
    return this.binPath
  }

  async install(): Promise<RcloneStatus> {
    if (this.installPromise) return this.installPromise
    this.installPromise = this.doInstall().finally(() => {
      this.installPromise = null
    })
    return this.installPromise
  }

  private async doInstall(): Promise<RcloneStatus> {
    const binDir = path.join(app.getPath('userData'), 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    const zipPath = path.join(binDir, 'rclone-download.zip')
    const target = path.join(binDir, 'rclone.exe')
    this.downloadProgress = {
      active: true,
      percent: 0,
      received: 0,
      total: 0,
      stage: '正在连接下载服务器'
    }
    this.emitDownload()

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
      let response: Response
      try {
        response = await net.fetch(RCLONE_DOWNLOAD_URL, {
          redirect: 'follow',
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }
      if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length') || 0)
      let received = 0
      const stream = fs.createWriteStream(zipPath)
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          received += value.length
          if (!stream.write(Buffer.from(value))) await once(stream, 'drain')
          const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0
          if (received - this.downloadProgress.received > 512 * 1024 || percent !== this.downloadProgress.percent) {
            this.downloadProgress = {
              active: true,
              percent,
              received,
              total,
              stage: '正在下载 rclone 引擎'
            }
            this.emitDownload()
          }
        }
      } finally {
        stream.end()
        await once(stream, 'close').catch(() => undefined)
      }
      this.downloadProgress = {
        active: true,
        percent: 100,
        received,
        total: total || received,
        stage: '正在解压'
      }
      this.emitDownload()

      const zip = new AdmZip(zipPath)
      const entry = zip
        .getEntries()
        .find((item) => /rclone\.exe$/i.test(item.entryName) && !item.isDirectory)
      if (!entry) throw new Error('压缩包中未找到 rclone.exe')
      const tempDir = path.join(binDir, `extract-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      try {
        zip.extractEntryTo(entry, tempDir, false, true)
        const extracted = path.join(tempDir, path.basename(entry.entryName))
        if (!fs.existsSync(extracted)) throw new Error('解压 rclone.exe 失败')
        fs.copyFileSync(extracted, target)
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
      this.downloadProgress = {
        active: true,
        percent: 100,
        received,
        total: total || received,
        stage: '正在验证'
      }
      this.emitDownload()
      const version = await this.getVersion(target)
      this.binPath = target
      this.status = {
        installed: true,
        path: target,
        version,
        source: 'userData',
        download: { ...this.downloadProgress, active: false }
      }
      this.downloadProgress = { ...this.downloadProgress, active: false, stage: '安装完成' }
      this.emitDownload()
      this.emitStatus()
      log('info', `rclone ${version} 安装完成`)
      return this.status
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.downloadProgress = {
        active: false,
        percent: 0,
        received: this.downloadProgress.received,
        total: this.downloadProgress.total,
        stage: '安装失败',
        error: message
      }
      this.emitDownload()
      log('error', `rclone 安装失败：${message}`)
      throw new Error(`rclone 安装失败：${message}`)
    } finally {
      fs.rmSync(zipPath, { force: true })
    }
  }

  async exec(args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const bin = this.requireBin()
    return spawnCapture(bin, ['--config', this.configFile, ...args], {
      env: { ...proxyEnv(this.getSettings()), RCLONE_CONFIG: this.configFile, NO_COLOR: '1' },
      timeoutMs: options.timeoutMs ?? 10 * 60_000,
      maxOutput: options.maxOutput
    })
  }

  private async execOrThrow(args: string[], options: ExecOptions = {}): Promise<string> {
    const result = await this.exec(args, options)
    if (result.code !== 0) {
      throw new Error(extractErrorMessage(result))
    }
    return result.stdout
  }

  private remoteSpec(remote: string, remotePath: string): string {
    const cleaned = remotePath.replace(/^\/+|\/+$/g, '')
    return `${remote}:${cleaned}`
  }

  async list(remote: string, remotePath: string): Promise<RemoteItem[]> {
    const output = await this.execOrThrow(
      ['lsjson', this.remoteSpec(remote, remotePath), '--max-depth', '1', '--hash'],
      { timeoutMs: 3 * 60_000 }
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(output || '[]')
    } catch {
      throw new Error('无法解析 OneDrive 文件列表')
    }
    if (!Array.isArray(parsed)) return []
    const base = remotePath.replace(/^\/+|\/+$/g, '')
    const items = parsed.map((raw) => {
      const item = raw as Record<string, unknown>
      const isDir = Boolean(item.IsDir)
      const relativePath = String(item.Path || '')
      const fullPath = base
        ? relativePath
          ? `${base}/${relativePath}`
          : base
        : relativePath
      return {
        name: String(item.Name || path.posix.basename(relativePath) || '未命名'),
        path: fullPath,
        isDir,
        size: Number(item.Size) || 0,
        modTime: String(item.ModTime || ''),
        mimeType: String(item.MimeType || (isDir ? 'inode/directory' : 'application/octet-stream')),
        hashes:
          item.Hashes && typeof item.Hashes === 'object'
            ? (item.Hashes as Record<string, string>)
            : undefined
      }
    })
    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
    })
    return items
  }

  async about(remote: string): Promise<Quota | null> {
    const result = await this.exec(['about', `${remote}:`, '--json'], { timeoutMs: 90_000 })
    if (result.code !== 0) return null
    try {
      const data = JSON.parse(result.stdout || '{}') as Record<string, unknown>
      const total = Number(data.total)
      const used = Number(data.used)
      const freeRaw = Number(data.free)
      if (!Number.isFinite(used) && !Number.isFinite(total)) return null
      return {
        total: Number.isFinite(total) ? total : 0,
        used: Number.isFinite(used) ? used : 0,
        free: Number.isFinite(freeRaw)
          ? freeRaw
          : Number.isFinite(total) && Number.isFinite(used)
            ? Math.max(0, total - used)
            : 0
      }
    } catch {
      return null
    }
  }

  async ensureRemoteConfig(remote: string): Promise<DriveIdentity | null> {
    if (!remote) return null
    const content = this.readConfigFile()
    if (!content) return null
    const section = parseRemoteSection(content, remote)
    if (!section || section.type !== 'onedrive') return null
    if (section.driveId && section.driveType) return null
    if (!section.token) return null

    const drive = await this.fetchDriveIdentity(section.token)
    const result = await this.exec(
      [
        'config',
        'update',
        remote,
        'drive_type',
        drive.driveType,
        'drive_id',
        drive.driveId,
        '--non-interactive'
      ],
      { timeoutMs: 60_000 }
    )
    if (result.code !== 0) {
      throw new Error(extractErrorMessage(result) || '补全 OneDrive 驱动器配置失败')
    }
    log('info', '已补全 OneDrive 驱动器配置', {
      remote,
      driveType: drive.driveType
    })
    return drive
  }

  private async fetchDriveIdentity(token: string): Promise<DriveIdentity> {
    const accessToken = extractAccessToken(token)
    if (!accessToken) throw new Error('Microsoft 授权令牌格式无效，请重新登录')

    let response: Response
    try {
      response = await net.fetch(
        'https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType,owner',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(30_000)
        }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`无法连接 Microsoft Graph：${message}`)
    }

    if (!response.ok) {
      let detail = ''
      try {
        const errorBody = (await response.json()) as {
          error?: { message?: string }
        }
        detail = errorBody.error?.message?.trim() || ''
      } catch {
        // Ignore malformed error bodies.
      }
      throw new Error(
        detail || `无法读取 OneDrive 驱动器信息（HTTP ${response.status}）`
      )
    }

    const data = (await response.json()) as Record<string, unknown>
    const driveId = typeof data.id === 'string' ? data.id.trim() : ''
    if (!driveId) throw new Error('未能获取 OneDrive 驱动器 ID，请重新登录')

    const rawType = typeof data.driveType === 'string' ? data.driveType : 'personal'
    const driveType: DriveIdentity['driveType'] =
      rawType === 'business' || rawType === 'documentLibrary' ? rawType : 'personal'
    const owner =
      data.owner && typeof data.owner === 'object'
        ? ((data.owner as { user?: unknown }).user as Record<string, unknown> | undefined)
        : undefined
    const displayName =
      owner && typeof owner.displayName === 'string' ? owner.displayName.trim() : undefined
    const email =
      owner && typeof owner.email === 'string' && owner.email.includes('@')
        ? owner.email.trim()
        : undefined

    return { driveId, driveType, displayName, email }
  }

  async login(remote: string): Promise<AccountInfo> {
    this.requireBin()
    this.loginCancelled = false
    this.authUrl = null
    const bin = this.requireBin()
    this.emitLogin({ status: 'starting', message: '正在启动 Microsoft 登录…' })
    log('info', '启动 rclone authorize')

    const child = spawn(bin, ['authorize', 'onedrive', '--auth-no-open-browser'], {
      windowsHide: true,
      env: { ...process.env, ...proxyEnv(this.getSettings()), NO_COLOR: '1' }
    })
    this.loginChild = child

    let stdout = ''
    let stderr = ''
    let openedUrl = ''

    const result = await new Promise<{ token: string; stderr: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('授权超时，请重试'))
        killProcess(child)
      }, LOGIN_TIMEOUT_MS)

      const finish = (error: Error | null, token?: string): void => {
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve({ token: token || '', stderr })
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
        const token = extractToken(stdout)
        if (token) {
          finish(null, token)
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
        const match = stderr.match(/https?:\/\/127\.0\.0\.1:\d+\/auth\?[^\s"'<>]+/)
        if (match && match[0] !== openedUrl) {
          openedUrl = match[0]
          this.authUrl = openedUrl
          this.emitLogin({
            status: 'waiting',
            message: '请在浏览器中登录 Microsoft 账户并授权 OneDrive',
            authUrl: openedUrl
          })
          shell.openExternal(openedUrl).catch((error) => {
            log('warn', '无法自动打开浏览器', String(error))
          })
        }
        if (/failed|error|denied|cancel/i.test(stderr) && /NOTICE|ERROR/i.test(stderr)) {
          // Keep the full stderr; the process usually exits shortly after a fatal error.
        }
      })
      child.on('error', (error) => finish(error))
      child.on('exit', (code) => {
        clearTimeout(timeout)
        if (this.loginCancelled) {
          finish(new Error('已取消登录'))
          return
        }
        const token = extractToken(stdout)
        if (token) {
          resolve({ token, stderr })
          return
        }
        reject(new Error(cleanLoginError(stderr, code)))
      })
    }).finally(() => {
      this.loginChild = null
    })

    if (this.loginCancelled) throw new Error('已取消登录')
    if (!result.token) throw new Error('未能获取 Microsoft 授权令牌')

    this.emitLogin({ status: 'waiting', message: '授权成功，正在保存账户信息…' })
    const drive = await this.createRemote(remote, result.token)
    const quota = await this.about(remote).catch(() => null)
    const account: AccountInfo = {
      remoteName: remote,
      displayName: drive.displayName || 'OneDrive',
      email: drive.email,
      connectedAt: Date.now(),
      quota: quota || undefined
    }
    this.emitLogin({ status: 'success', message: 'OneDrive 登录成功' })
    log('info', 'OneDrive 登录成功', {
      email: account.email,
      driveType: drive.driveType
    })
    return account
  }

  private async createRemote(remote: string, token: string): Promise<DriveIdentity> {
    const drive = await this.fetchDriveIdentity(token)
    const backupPath = `${this.configFile}.backup`
    const hadConfig = fs.existsSync(this.configFile)
    if (hadConfig) fs.copyFileSync(this.configFile, backupPath)
    try {
      await this.exec(['config', 'delete', remote], { timeoutMs: 30_000 }).catch(() => undefined)
      const result = await this.exec(
        [
          'config',
          'create',
          remote,
          'onedrive',
          'drive_type',
          drive.driveType,
          'drive_id',
          drive.driveId,
          'token',
          token,
          '--non-interactive'
        ],
        { timeoutMs: 60_000 }
      )
      if (result.code !== 0) {
        throw new Error(extractErrorMessage(result) || '保存 OneDrive 授权失败')
      }
      const check = await this.exec(['config', 'show', remote], { timeoutMs: 30_000 })
      if (check.code !== 0) throw new Error('OneDrive 授权配置校验失败')
      fs.rmSync(backupPath, { force: true })
      return drive
    } catch (error) {
      if (hadConfig && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, this.configFile)
        fs.rmSync(backupPath, { force: true })
      }
      throw error
    }
  }

  cancelLogin(): void {
    this.loginCancelled = true
    if (this.loginChild) {
      killProcess(this.loginChild)
      this.loginChild = null
    }
    this.emitLogin({ status: 'idle', message: '已取消登录' })
  }

  async openLoginUrl(): Promise<void> {
    if (this.authUrl) await shell.openExternal(this.authUrl)
  }

  async logout(remote: string): Promise<void> {
    await this.exec(['config', 'delete', remote], { timeoutMs: 30_000 })
  }

  async mkdir(remote: string, remotePath: string): Promise<void> {
    await this.execOrThrow(['mkdir', this.remoteSpec(remote, remotePath)], { timeoutMs: 60_000 })
  }

  async deleteItem(remote: string, remotePath: string, isDir: boolean): Promise<void> {
    await this.execOrThrow(
      [isDir ? 'purge' : 'deletefile', this.remoteSpec(remote, remotePath)],
      { timeoutMs: 10 * 60_000 }
    )
  }

  async renameItem(
    remote: string,
    remotePath: string,
    newName: string,
    isDir: boolean
  ): Promise<void> {
    void isDir
    const parent = path.posix.dirname(remotePath)
    const nextPath = parent === '.' ? newName : `${parent}/${newName}`
    await this.execOrThrow(
      ['moveto', this.remoteSpec(remote, remotePath), this.remoteSpec(remote, nextPath)],
      { timeoutMs: 5 * 60_000 }
    )
  }

  async copyto(remote: string, remotePath: string, localPath: string): Promise<void> {
    await this.execOrThrow(
      ['copyto', this.remoteSpec(remote, remotePath), localPath, '--retries', '4'],
      { timeoutMs: 30 * 60_000 }
    )
  }

  async link(remote: string, remotePath: string): Promise<string> {
    const output = await this.execOrThrow(['link', this.remoteSpec(remote, remotePath)], {
      timeoutMs: 60_000
    })
    const url = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^https?:\/\//.test(line))
    if (!url) throw new Error('OneDrive 未返回分享链接')
    return url
  }

  async preview(remote: string, item: RemoteItem): Promise<PreviewResult> {
    const ext = path.extname(item.name).toLowerCase()
    const isImage = item.mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)
    const isText =
      item.mimeType.startsWith('text/') ||
      item.mimeType === 'application/json' ||
      TEXT_EXTENSIONS.has(ext)

    if (isText) {
      const result = await this.exec(
        ['cat', this.remoteSpec(remote, item.path), '--head', '524288'],
        { timeoutMs: 60_000 }
      )
      if (result.code !== 0) throw new Error(extractErrorMessage(result))
      const truncated = item.size > 512 * 1024
      return {
        kind: 'text',
        name: item.name,
        size: item.size,
        text: result.stdout,
        truncated
      }
    }

    if (isImage && item.size <= 20 * 1024 * 1024) {
      const tmpPath = await this.downloadPreview(remote, item)
      const data = fs.readFileSync(tmpPath)
      const mime =
        IMAGE_MIMES.has(item.mimeType) || item.mimeType.startsWith('image/')
          ? item.mimeType
          : mimeFromExtension(ext)
      return {
        kind: 'image',
        name: item.name,
        size: item.size,
        dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        mimeType: mime
      }
    }

    return {
      kind: 'unsupported',
      name: item.name,
      size: item.size,
      mimeType: item.mimeType
    }
  }

  async downloadPreview(remote: string, item: RemoteItem): Promise<string> {
    const dir = path.join(app.getPath('userData'), 'preview')
    fs.mkdirSync(dir, { recursive: true })
    const safeName = sanitizeFileName(item.name) || 'preview.bin'
    const target = path.join(dir, `${Date.now()}-${safeName}`)
    await this.copyto(remote, item.path, target)
    return target
  }

  async openItem(remote: string, item: RemoteItem): Promise<void> {
    const target = await this.downloadPreview(remote, item)
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  }

  readConfigFile(): string | null {
    try {
      return fs.readFileSync(this.configFile, 'utf8')
    } catch {
      return null
    }
  }

  writeConfigFile(content: string): void {
    if (fs.existsSync(this.configFile)) {
      fs.copyFileSync(this.configFile, `${this.configFile}.import-backup`)
    }
    fs.writeFileSync(this.configFile, content, 'utf8')
  }
}

function spawnCapture(
  bin: string,
  args: string[],
  options: {
    timeoutMs?: number
    env?: Record<string, string>
    maxOutput?: number
  } = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, ...options.env }
    })
    let stdout = ''
    let stderr = ''
    const maxOutput = options.maxOutput ?? 64 * 1024 * 1024
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          killProcess(child)
          reject(new Error(`操作超时（${Math.round((options.timeoutMs || 0) / 1000)} 秒）`))
        }, options.timeoutMs)
      : null
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      if (timeout) clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })
}

export function killProcess(child: ChildProcess): void {
  if (!child.pid) {
    try {
      child.kill()
    } catch {
      // ignore
    }
    return
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    } catch {
      child.kill()
    }
  } else {
    child.kill('SIGKILL')
  }
}

function extractToken(output: string): string | null {
  const lines = output.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (!line.startsWith('{') || !line.includes('access_token')) continue
    try {
      const parsed = JSON.parse(line)
      if (typeof parsed.access_token === 'string') return line
    } catch {
      // keep looking
    }
  }
  return null
}

function extractAccessToken(token: string): string | null {
  try {
    const parsed = JSON.parse(token) as Record<string, unknown>
    return typeof parsed.access_token === 'string' && parsed.access_token.trim()
      ? parsed.access_token.trim()
      : null
  } catch {
    return null
  }
}

function parseRemoteSection(
  content: string,
  remote: string
): { type?: string; token?: string; driveId?: string; driveType?: string } | null {
  const escaped = remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content
    .replace(/^\uFEFF/, '')
    .match(new RegExp(`(?:^|\\r?\\n)\\[${escaped}\\](?:\\r?\\n|$)([\\s\\S]*?)(?=\\r?\\n\\[|$)`))
  if (!match) return null

  const values = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key) values.set(key, value)
  }
  return {
    type: values.get('type'),
    token: values.get('token'),
    driveId: values.get('drive_id'),
    driveType: values.get('drive_type')
  }
}

function cleanLoginError(stderr: string, code: number | null): string {
  const cleaned = stderr
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\s+/, '').trim())
    .filter((line) => line && !/NOTICE: (Make sure|Log in|Waiting)/i.test(line))
    .join(' ')
    .slice(0, 500)
  return cleaned || `登录进程退出（代码 ${code ?? '未知'}），请重试`
}

function extractErrorMessage(result: ExecResult): string {
  const source = result.stderr || result.stdout
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line)
        if (typeof parsed.msg === 'string' && parsed.msg.trim()) return parsed.msg.trim().slice(0, 800)
      } catch {
        // ignore
      }
    }
  }
  const plain = lines.filter((line) => !line.startsWith('{'))
  const message = plain[plain.length - 1] || `rclone 退出码 ${result.code}`
  return message
    .replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} [A-Z]+:\s*/, '')
    .replace(/^Fatal error:\s*/i, '')
    .slice(0, 800)
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120)
}

function mimeFromExtension(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.svg':
      return 'image/svg+xml'
    case '.avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}
