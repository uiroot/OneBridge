import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Cloud,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Loader2,
  Pause,
  Timer,
  type LucideIcon
} from 'lucide-react'
import type { JobStatus, TaskHealth } from '@shared/types'
import { cn, fileExtension, formatBytes, initials } from '../lib/utils'

const ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  image: { icon: FileImage, className: 'text-sky-400' },
  video: { icon: FileVideo, className: 'text-violet-400' },
  audio: { icon: FileAudio, className: 'text-pink-400' },
  archive: { icon: FileArchive, className: 'text-amber-400' },
  code: { icon: FileCode2, className: 'text-emerald-400' },
  sheet: { icon: FileSpreadsheet, className: 'text-emerald-400' },
  text: { icon: FileText, className: 'text-blue-400' },
  folder: { icon: Folder, className: 'text-amber-400' }
}

export function fileCategory(name: string): keyof typeof ICON_MAP {
  const ext = fileExtension(name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) return 'archive'
  if (
    [
      'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'htm', 'css', 'scss', 'py', 'rs',
      'go', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'ps1', 'bat', 'sql', 'xml', 'yml', 'yaml'
    ].includes(ext)
  )
    return 'code'
  if (['xls', 'xlsx', 'csv', 'numbers', 'ods'].includes(ext)) return 'sheet'
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'pages'].includes(ext)) return 'text'
  return 'text'
}

export function FileGlyph({
  name,
  isDir,
  size = 'md'
}: {
  name: string
  isDir?: boolean
  size?: 'sm' | 'md' | 'lg'
}): React.JSX.Element {
  const category = isDir ? 'folder' : fileCategory(name)
  const meta = ICON_MAP[category] || ICON_MAP.text
  const Icon = meta.icon
  const dimension = size === 'sm' ? 'h-6 w-6 rounded-md' : size === 'lg' ? 'h-11 w-11 rounded-xl' : ''
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 21 : 16
  return (
    <span className={cn('file-glyph', dimension)} aria-hidden="true">
      <Icon size={iconSize} className={meta.className} strokeWidth={1.8} />
    </span>
  )
}

export function StatusBadge({
  status,
  label
}: {
  status: JobStatus | TaskHealth | 'idle'
  label?: string
}): React.JSX.Element {
  if (status === 'running' || status === 'queued' || status === 'cancelling') {
    return (
      <span className="badge badge-running">
        <Loader2 size={10} className="animate-spin" />
        {label ||
          (status === 'running' ? '传输中' : status === 'queued' ? '排队中' : '正在取消')}
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={10} />
        {label || '已完成'}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="badge badge-error">
        <AlertTriangle size={10} />
        {label || '失败'}
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="badge">
        <Ban size={10} />
        {label || '已取消'}
      </span>
    )
  }
  if (status === 'paused') {
    return (
      <span className="badge badge-warning">
        <Pause size={10} />
        {label || '已暂停'}
      </span>
    )
  }
  if (status === 'idle') {
    return (
      <span className="badge badge-muted">
        <Timer size={10} />
        {label || '等待运行'}
      </span>
    )
  }
  return <span className="badge">{label || status}</span>
}

export function StorageBar({
  used,
  total,
  className
}: {
  used: number
  total: number
  className?: string
}): React.JSX.Element {
  const percent = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0
  return (
    <div className={cn('w-full', className)}>
      <div className="progress" style={{ height: 5 }}>
        <span
          className="progress-bar"
          style={{
            width: `${Math.max(1, percent)}%`,
            background:
              percent > 90
                ? 'linear-gradient(90deg, #fb7185, #f43f5e)'
                : percent > 75
                  ? 'linear-gradient(90deg, #fbbf24, #f97316)'
                  : undefined
          }}
        />
      </div>
    </div>
  )
}

export function Avatar({
  name,
  size = 36,
  className,
  fallback = 'OB'
}: {
  name?: string
  size?: number
  className?: string
  fallback?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-lg',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.32),
        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
        boxShadow: '0 8px 20px -10px rgba(56,189,248,.7)'
      }}
    >
      {initials(name) || fallback}
    </span>
  )
}

export function Spinner({
  size = 14,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return <Loader2 size={size} className={cn('animate-spin', className)} />
}

export function CloudBadge({
  connected,
  label
}: {
  connected: boolean
  label?: string
}): React.JSX.Element {
  return (
    <span className="badge">
      <Cloud size={10} className={connected ? 'text-sky-400' : 'text-[var(--text-muted)]'} />
      {label || (connected ? 'OneDrive' : '未连接')}
    </span>
  )
}
