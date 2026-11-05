import { useEffect, useState } from 'react'
import type { JobStatus, PostAction } from '@shared/types'

export function cn(...inputs: Array<string | number | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ')
}

export function formatBytes(bytes: number | undefined | null, decimals = 1): string {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const size = value / 1024 ** index
  return `${size.toFixed(index === 0 ? 0 : decimals)} ${units[index]}`
}

export function formatSpeed(bytesPerSecond: number | undefined | null): string {
  const value = Number(bytesPerSecond)
  if (!Number.isFinite(value) || value <= 0) return '0 B/s'
  return `${formatBytes(value)}/s`
}

export function formatDuration(seconds: number | undefined | null): string {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '0 秒'
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded} 秒`
  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60)
    const secs = rounded % 60
    return secs ? `${minutes} 分 ${secs} 秒` : `${minutes} 分钟`
  }
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.round((rounded % 3600) / 60)
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
}

export function formatDurationMs(ms: number | undefined | null): string {
  return formatDuration((Number(ms) || 0) / 1000)
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds <= 0) return '即将完成'
  return formatDuration(seconds)
}

export function formatDateTime(timestamp: number | string | undefined | null): string {
  if (!timestamp) return '—'
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatTime(timestamp: number | undefined | null): string {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp))
}

export function timeAgo(timestamp: number | undefined | null, now = Date.now()): string {
  if (!timestamp) return '从未'
  const diff = Math.max(0, now - timestamp)
  if (diff < 45_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return formatDateTime(timestamp)
}

export function formatCountdown(timestamp: number | undefined | null, now = Date.now()): string {
  if (!timestamp) return '手动运行'
  const diff = timestamp - now
  if (diff <= 0) return '即将开始'
  if (diff < 60_000) return `${Math.ceil(diff / 1000)} 秒后`
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)} 分钟后`
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000)
    const minutes = Math.ceil((diff % 3_600_000) / 60_000)
    return minutes ? `${hours} 小时 ${minutes} 分后` : `${hours} 小时后`
  }
  return formatDateTime(timestamp)
}

export function formatPercent(value: number | undefined | null): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(number)))}%`
}

export function initials(name: string | undefined | null): string {
  const value = String(name || '').trim()
  if (!value) return 'OB'
  const clean = value.includes('@') ? value.split('@')[0] : value
  const words = clean.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

export function truncateMiddle(value: string, max = 46): string {
  if (value.length <= max) return value
  const half = Math.floor((max - 1) / 2)
  return `${value.slice(0, half)}…${value.slice(-half)}`
}

export function basename(value: string): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || value
}

export function dirnamePosix(value: string): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function joinRemote(base: string, name: string): string {
  const cleanBase = base.replace(/^\/+|\/+$/g, '')
  return cleanBase ? `${cleanBase}/${name}` : name
}

export function joinLocal(base: string, name: string): string {
  if (!base) return name
  const separator = base.includes('\\') ? '\\' : '/'
  return `${base.replace(/[\\/]+$/, '')}${separator}${name}`
}

export function fileExtension(name: string): string {
  const match = name.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : ''
}

export function isFinalStatus(status: JobStatus): boolean {
  return status === 'success' || status === 'error' || status === 'cancelled'
}

export function isActiveStatus(status: JobStatus): boolean {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'cancelling'
  )
}

export function isPausedStatus(status: JobStatus): boolean {
  return status === 'paused'
}

export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '传输中'
    case 'paused':
      return '已暂停'
    case 'cancelling':
      return '正在取消'
    case 'success':
      return '已完成'
    case 'error':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

export const triggerLabel: Record<'manual' | 'schedule' | 'browser', string> = {
  manual: '手动',
  schedule: '定时',
  browser: '文件管理'
}

export const postActionLabel: Record<PostAction, string> = {
  none: '无操作',
  'monitor-off': '关闭显示器',
  lock: '锁定屏幕',
  sleep: '睡眠',
  hibernate: '休眠',
  shutdown: '关机'
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
