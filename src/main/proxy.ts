import type { Session } from 'electron'
import type { AppSettings } from '@shared/types'
import { log } from './logger'

const BYPASS = 'localhost,127.0.0.1,::1'

let systemProxyEnv: Record<string, string> = {}

function envForUrl(url: string): Record<string, string> {
  return {
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    ALL_PROXY: url,
    http_proxy: url,
    https_proxy: url,
    all_proxy: url,
    NO_PROXY: BYPASS,
    no_proxy: BYPASS
  }
}

/** Build the proxy URL used by rclone and Chromium. Empty string means no proxy. */
export function proxyUrl(settings: AppSettings): string {
  if (settings.proxyMode !== 'custom') return ''
  const host = settings.proxyHost.trim()
  if (!host) return ''
  const port = Math.min(65_535, Math.max(1, Math.round(settings.proxyPort || 0)))
  const user = settings.proxyUsername.trim()
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(settings.proxyPassword)}@` : ''
  return `${settings.proxyProtocol}://${auth}${host}:${port}`
}

/**
 * Environment overrides for rclone child processes. rclone (Go) reads the
 * standard HTTP_PROXY / HTTPS_PROXY / ALL_PROXY variables.
 */
export function proxyEnv(settings: AppSettings): Record<string, string> {
  if (settings.proxyMode === 'custom') {
    const url = proxyUrl(settings)
    if (url) return envForUrl(url)
  }
  if (settings.proxyMode === 'direct') {
    // Blank values make Go ignore an inherited proxy from the parent process.
    return {
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      http_proxy: '',
      https_proxy: '',
      all_proxy: '',
      NO_PROXY: BYPASS,
      no_proxy: BYPASS
    }
  }
  // "system" mode: rclone has no Windows proxy support, so the resolved
  // Chromium proxy is reused. When Windows has no proxy, inherit the
  // environment unchanged.
  return systemProxyEnv
}

/** Distinct value used to detect proxy setting changes without touching the session. */
export function proxyKey(settings: AppSettings): string {
  return [
    settings.proxyMode,
    settings.proxyProtocol,
    settings.proxyHost,
    String(settings.proxyPort),
    settings.proxyUsername,
    settings.proxyPassword
  ].join('\u0000')
}

/**
 * Apply the proxy to Electron's default session so net.fetch (Microsoft Graph,
 * rclone download) follows the same route as rclone transfers.
 */
export async function applyProxy(session: Session, settings: AppSettings): Promise<void> {
  try {
    if (settings.proxyMode === 'custom') {
      const url = proxyUrl(settings)
      if (url) {
        await session.setProxy({ proxyRules: url, proxyBypassRules: '<local>' })
      } else {
        await session.setProxy({ mode: 'direct' })
      }
      systemProxyEnv = {}
    } else if (settings.proxyMode === 'direct') {
      await session.setProxy({ mode: 'direct' })
      systemProxyEnv = {}
    } else {
      await session.setProxy({ mode: 'system' })
      systemProxyEnv = await resolveSystemProxy(session)
    }
    log('info', '网络代理已应用', {
      mode: settings.proxyMode,
      protocol: settings.proxyMode === 'custom' ? settings.proxyProtocol : undefined,
      host: settings.proxyMode === 'custom' ? settings.proxyHost : undefined,
      port: settings.proxyMode === 'custom' ? settings.proxyPort : undefined
    })
  } catch (error) {
    log('warn', '应用网络代理失败', String(error))
  }
}

/** Translate Chromium's system proxy result into rclone environment variables. */
async function resolveSystemProxy(session: Session): Promise<Record<string, string>> {
  try {
    const result = await session.resolveProxy('https://graph.microsoft.com')
    const first = result.split(';')[0]?.trim() || ''
    const match = /^(PROXY|SOCKS5|SOCKS4|HTTPS)\s+(\S+)$/i.exec(first)
    if (!match) return {}
    const kind = match[1].toUpperCase()
    const endpoint = match[2]
    const scheme = kind === 'SOCKS5' ? 'socks5' : kind === 'SOCKS4' ? 'socks4' : 'http'
    log('info', '读取系统代理', { kind, endpoint })
    return envForUrl(`${scheme}://${endpoint}`)
  } catch (error) {
    log('warn', '读取系统代理失败', String(error))
    return {}
  }
}
