import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Cloud,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  TriangleAlert,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import type { RemoteItem } from '@shared/types'
import { errorMessage } from '../store/app'
import { cn, joinRemote } from '../lib/utils'
import { Modal } from './Modal'
import { FileGlyph } from './Visuals'

export function CloudFolderPicker({
  open,
  title = '选择 OneDrive 文件夹',
  subtitle,
  initialPath = '',
  allowFiles = false,
  onSelect,
  onClose
}: {
  open: boolean
  title?: string
  subtitle?: string
  initialPath?: string
  allowFiles?: boolean
  onSelect: (path: string, name: string, isDir: boolean) => void
  onClose: () => void
}): React.JSX.Element | null {
  const [path, setPath] = useState(initialPath)
  const [items, setItems] = useState<RemoteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<RemoteItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const load = useCallback(async (target: string): Promise<void> => {
    const token = ++requestRef.current
    setLoading(true)
    setError(null)
    setSelectedFile(null)
    try {
      const result = await window.api.listFiles(target)
      if (requestRef.current !== token) return
      setItems(result)
    } catch (cause) {
      if (requestRef.current !== token) return
      setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '') : String(cause))
      setItems([])
    } finally {
      if (requestRef.current === token) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPath(initialPath)
    setCreateOpen(false)
    setFolderName('')
    setCreateError(null)
    void load(initialPath)
  }, [open, initialPath, load])

  if (!open) return null

  const folders = items.filter((item) => item.isDir)
  const files = allowFiles ? items.filter((item) => !item.isDir) : []
  const segments = path.split('/').filter(Boolean)

  const navigate = (next: string): void => {
    setPath(next)
    setCreateOpen(false)
    setCreateError(null)
    void load(next)
  }

  const startCreate = (): void => {
    setCreateOpen(true)
    setFolderName('')
    setCreateError(null)
  }

  const submitCreate = async (): Promise<void> => {
    const name = folderName.trim()
    if (!name) {
      setCreateError('请输入文件夹名称')
      return
    }
    if (/[\\/]/.test(name)) {
      setCreateError('文件夹名称不能包含斜杠')
      return
    }
    if (name === '.' || name === '..') {
      setCreateError('文件夹名称无效')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await window.api.createFolder(path, name)
      const target = joinRemote(path, name)
      setCreateOpen(false)
      setFolderName('')
      setPath(target)
      await load(target)
      toast.success('云端文件夹已创建', { description: `OneDrive:/${target}` })
    } catch (cause) {
      setCreateError(errorMessage(cause))
    } finally {
      setCreating(false)
    }
  }

  const choose = (): void => {
    if (selectedFile) {
      onSelect(selectedFile.path, selectedFile.name, false)
    } else {
      onSelect(path, segments[segments.length - 1] || 'OneDrive', true)
    }
    onClose()
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle || '选择云端目录作为同步目标，或浏览文件夹。'}
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-400">
          <FolderOpen size={16} />
        </span>
      }
      onClose={onClose}
      widthClass="max-w-[620px]"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={choose}>
            {selectedFile ? `选择文件「${selectedFile.name}」` : segments.length ? '选择当前文件夹' : '选择 OneDrive 根目录'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-[11.5px]">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--panel-hover)]',
              segments.length === 0 ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
            )}
            onClick={() => navigate('')}
          >
            <Cloud size={12} className="text-sky-400" />
            OneDrive
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/')
            const last = index === segments.length - 1
            return (
              <span key={target} className="flex items-center gap-1">
                <ChevronRight size={11} className="text-[var(--text-muted)]" />
                <button
                  type="button"
                  className={cn(
                    'max-w-[150px] truncate rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--panel-hover)]',
                    last ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                  )}
                  onClick={() => navigate(target)}
                  title={segment}
                >
                  {segment}
                </button>
              </span>
            )
          })}
          <button
            type="button"
            className={cn(
              'ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-[var(--panel-hover)]',
              createOpen ? 'text-sky-400' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
            onClick={() => (createOpen ? setCreateOpen(false) : startCreate())}
            title="在当前目录新建文件夹"
          >
            <FolderPlus size={11} />
            新建文件夹
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-hover)] hover:text-[var(--text)]"
            onClick={() => void load(path)}
            title="刷新"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        {createOpen ? (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <FolderPlus size={14} className="shrink-0 text-sky-400" />
              <input
                autoFocus
                className="input input-sm min-w-0 flex-1"
                value={folderName}
                placeholder="输入文件夹名称"
                disabled={creating}
                onChange={(event) => {
                  setFolderName(event.target.value)
                  setCreateError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submitCreate()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setCreateOpen(false)
                    setCreateError(null)
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm shrink-0"
                disabled={creating || !folderName.trim()}
                onClick={() => void submitCreate()}
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                创建
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm shrink-0"
                disabled={creating}
                onClick={() => {
                  setCreateOpen(false)
                  setCreateError(null)
                }}
                title="取消新建"
              >
                <X size={12} />
              </button>
            </div>
            {createError ? (
              <div className="mt-1.5 pl-[22px] text-[10px] leading-relaxed text-[var(--danger-text)]">
                {createError}
              </div>
            ) : (
              <div className="mt-1.5 pl-[22px] text-[10px] leading-relaxed text-[var(--text-muted)]">
                将在 {path ? `OneDrive:/${path}` : 'OneDrive 根目录'} 下创建，完成后自动进入该文件夹。
              </div>
            )}
          </div>
        ) : null}

        <div className="h-[320px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-2)]">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[11.5px] text-[var(--text-muted)]">
              <Loader2 size={19} className="animate-spin text-sky-400" />
              正在读取 OneDrive 目录…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
              <TriangleAlert size={22} className="text-[var(--danger-text)]" />
              <div className="max-w-[360px] break-words text-[11.5px] leading-relaxed text-[var(--text-soft)]">
                {error}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => void load(path)}>
                重试
              </button>
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[11.5px] text-[var(--text-muted)]">
              <Folder size={24} className="opacity-40" />
              这个文件夹是空的
            </div>
          ) : (
            <div className="p-1.5">
              {folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--panel-hover)]"
                  onDoubleClick={() => navigate(folder.path)}
                  onClick={() => navigate(folder.path)}
                >
                  <FileGlyph name={folder.name} isDir size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">
                    {folder.name}
                  </span>
                  <ChevronRight size={13} className="text-[var(--text-muted)]" />
                </button>
              ))}
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--panel-hover)]',
                    selectedFile?.path === file.path && 'bg-sky-400/10'
                  )}
                  onClick={() => setSelectedFile(file)}
                >
                  <FileGlyph name={file.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">
                    {file.name}
                  </span>
                  {selectedFile?.path === file.path ? (
                    <span className="badge badge-info">已选择</span>
                  ) : (
                    <FileIcon size={12} className="text-[var(--text-muted)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="hint">
          {allowFiles
            ? '单击文件夹进入，单击文件选中；也可以直接选择当前文件夹，或在此新建文件夹。'
            : '双击或单击文件夹进入，选择后该目录将成为同步目标；也可以直接新建文件夹并进入。'}
        </p>
      </div>
    </Modal>
  )
}
