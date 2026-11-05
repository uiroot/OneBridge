import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Cloud,
  CloudUpload,
  Download,
  ExternalLink,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import type { RemoteItem } from '@shared/types'
import { useAppStore } from '../store/app'
import {
  cn,
  fileExtension,
  formatBytes,
  formatDateTime,
  isFinalStatus
} from '../lib/utils'
import { ConfirmDialog, PromptDialog } from '../components/Dialogs'
import { Dropdown } from '../components/Dropdown'
import { FilePreviewModal } from '../components/FilePreviewModal'
import { EmptyState, PageHeader } from '../components/Layout'
import { FileGlyph, Spinner, StorageBar } from '../components/Visuals'

type ViewMode = 'list' | 'grid'

export function FilesPage(): React.JSX.Element {
  const account = useAppStore((state) => state.config?.account)
  const rclone = useAppStore((state) => state.rclone)
  const jobs = useAppStore((state) => state.jobs)
  const setPage = useAppStore((state) => state.setPage)
  const startLogin = useAppStore((state) => state.startLogin)

  const [path, setPath] = useState('')
  const [items, setItems] = useState<RemoteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>('list')
  const [preview, setPreview] = useState<RemoteItem | null>(null)
  const [renameItem, setRenameItem] = useState<RemoteItem | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<RemoteItem[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const requestRef = useRef(0)
  const handledJobs = useRef<Set<string>>(
    new Set(useAppStore.getState().jobs.filter((job) => isFinalStatus(job.status)).map((job) => job.id))
  )

  const connected = Boolean(account)
  const engineReady = Boolean(rclone?.installed)
  const quota = account?.quota

  const load = useCallback(async (target: string): Promise<void> => {
    const token = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.listFiles(target)
      if (requestRef.current !== token) return
      setItems(result)
      setSelected(new Set())
    } catch (cause) {
      if (requestRef.current !== token) return
      setItems([])
      setError(
        cause instanceof Error
          ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
          : String(cause)
      )
    } finally {
      if (requestRef.current === token) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!connected || !engineReady) return
    void load(path)
  }, [path, connected, engineReady, load])

  useEffect(() => {
    let shouldReload = false
    for (const job of jobs) {
      if (!isFinalStatus(job.status) || handledJobs.current.has(job.id)) continue
      handledJobs.current.add(job.id)
      if (job.trigger === 'browser' && job.status === 'success') shouldReload = true
    }
    if (!shouldReload) return
    const timer = setTimeout(() => void load(path), 900)
    return () => clearTimeout(timer)
  }, [jobs, path, load])

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.name.toLowerCase().includes(needle))
  }, [items, query])

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.path)),
    [items, selected]
  )
  const segments = path.split('/').filter(Boolean)
  const allSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selected.has(item.path))

  const navigate = (target: string): void => {
    setPath(target)
    setQuery('')
  }

  const toggle = (target: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
  }

  const toggleAll = (): void => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredItems.map((item) => item.path)))
    }
  }

  const activate = (item: RemoteItem): void => {
    if (item.isDir) navigate(item.path)
    else setPreview(item)
  }

  const uploadSelectedFiles = async (): Promise<void> => {
    const paths = await window.api.pickLocalFiles()
    if (!paths.length) return
    setUploading(true)
    try {
      await window.api.uploadFiles(paths, path)
      toast.success(`已将 ${paths.length} 个文件加入上传队列`, {
        description: path ? `目标：OneDrive:/${path}` : '目标：OneDrive 根目录'
      })
    } catch (cause) {
      toast.error('上传失败', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    } finally {
      setUploading(false)
    }
  }

  const uploadFolder = async (): Promise<void> => {
    const folder = await window.api.pickLocalFolder()
    if (!folder) return
    setUploading(true)
    try {
      await window.api.uploadFiles([folder], path)
      toast.success('已将文件夹加入上传队列', {
        description: folder
      })
    } catch (cause) {
      toast.error('上传失败', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    } finally {
      setUploading(false)
    }
  }

  const downloadItems = async (list: RemoteItem[]): Promise<void> => {
    if (!list.length) return
    const localDir = await window.api.pickLocalFolder()
    if (!localDir) return
    try {
      await window.api.downloadItems(
        list.map((item) => ({ name: item.name, path: item.path, isDir: item.isDir })),
        localDir
      )
      toast.success(`已将 ${list.length} 个项目加入下载队列`, {
        description: `保存到：${localDir}`
      })
    } catch (cause) {
      toast.error('下载失败', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    }
  }

  const shareItem = async (item: RemoteItem): Promise<void> => {
    try {
      const url = await window.api.linkItem({
        name: item.name,
        path: item.path,
        isDir: item.isDir
      })
      toast.success('分享链接已复制到剪贴板', { description: url })
    } catch (cause) {
      toast.error('获取分享链接失败', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    }
  }

  const openWithSystem = async (item: RemoteItem): Promise<void> => {
    try {
      await window.api.openItem({ name: item.name, path: item.path, isDir: item.isDir })
    } catch (cause) {
      toast.error('无法打开文件', {
        description:
          cause instanceof Error
            ? cause.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
            : String(cause)
      })
    }
  }

  const refresh = (): void => {
    void load(path)
  }

  if (!connected || !engineReady) {
    return (
      <div className="page-shell">
        <PageHeader title="云端文件" subtitle="浏览、上传、下载与预览 OneDrive 文件" />
        <div className="card">
          <EmptyState
            icon={<Cloud size={25} />}
            title={!engineReady ? '传输引擎尚未安装' : '连接 OneDrive 后浏览云端文件'}
            description={
              !engineReady
                ? '先在设置中安装 rclone 传输引擎，然后登录 Microsoft 账户。'
                : '登录个人 OneDrive 账户后，即可像资源管理器一样浏览、上传、下载、重命名和分享文件。'
            }
            action={
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setPage('settings')}>
                  打开设置
                </button>
                {engineReady ? (
                  <button type="button" className="btn btn-primary" onClick={() => void startLogin()}>
                    连接 OneDrive
                  </button>
                ) : null}
              </div>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="云端文件"
        subtitle={
          <>
            <span>{account?.email || account?.displayName || 'OneDrive'}</span>
            {quota && quota.total > 0 ? (
              <span className="ml-2 text-[var(--text-muted)]">
                {formatBytes(quota.used)} / {formatBytes(quota.total)}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <button type="button" className="btn" onClick={() => void uploadFolder()} disabled={uploading}>
              <FolderOpen size={13} />
              上传文件夹
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={13} />
              新建文件夹
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void uploadSelectedFiles()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              上传文件
            </button>
          </>
        }
      />

      <div className="card mb-3 flex flex-wrap items-center gap-2 px-3 py-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-[11.5px]">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--panel-hover)]',
              segments.length === 0 ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
            )}
            onClick={() => navigate('')}
          >
            <Cloud size={13} className="text-sky-400" />
            OneDrive
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/')
            const last = index === segments.length - 1
            return (
              <span key={target} className="flex items-center gap-0.5">
                <ChevronRight size={11} className="text-[var(--text-muted)]" />
                <button
                  type="button"
                  className={cn(
                    'max-w-[170px] truncate rounded-md px-2 py-1 transition-colors hover:bg-[var(--panel-hover)]',
                    last ? 'font-medium text-[var(--text)]' : 'text-[var(--text-muted)]'
                  )}
                  onClick={() => navigate(target)}
                  title={segment}
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </nav>

        <div className="relative min-w-[160px] flex-1 sm:max-w-[220px]">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            className="input input-sm !h-[30px] pl-7 text-[11px]"
            placeholder="筛选当前文件夹…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="segmented !p-[2px]">
          <button
            type="button"
            className={cn('segmented-item !px-2 !py-1', view === 'list' && 'active')}
            onClick={() => setView('list')}
            aria-label="列表视图"
            title="列表视图"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className={cn('segmented-item !px-2 !py-1', view === 'grid' && 'active')}
            onClick={() => setView('grid')}
            aria-label="网格视图"
            title="网格视图"
          >
            <LayoutGrid size={13} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-icon btn-sm"
          onClick={refresh}
          title="刷新"
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {selectedItems.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2">
          <span className="text-[11px] font-medium text-[var(--brand-text)]">
            已选择 {selectedItems.length} 项
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void downloadItems(selectedItems)}
            >
              <Download size={12} />
              下载
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setPendingDelete(selectedItems)}
            >
              <Trash2 size={12} />
              删除
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm btn-ghost"
              onClick={() => setSelected(new Set())}
              title="清除选择"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <Spinner size={14} className="text-sky-400" />
            <span className="text-[11.5px] text-[var(--text-muted)]">正在读取 OneDrive 文件…</span>
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0"
            >
              <div className="skeleton h-4 w-4" />
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="skeleton h-3 w-[34%]" />
              <div className="skeleton ml-auto h-3 w-20" />
              <div className="skeleton h-3 w-14" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card">
          <EmptyState
            icon={<Cloud size={25} />}
            title="无法读取此文件夹"
            description={error}
            action={
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm" onClick={() => navigate('')}>
                  返回根目录
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={refresh}>
                  <RefreshCw size={12} />
                  重试
                </button>
              </div>
            }
          />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={query ? <Search size={24} /> : <Folder size={25} />}
            title={query ? '没有匹配的文件' : '这个文件夹是空的'}
            description={
              query
                ? `没有找到包含「${query}」的文件或文件夹。`
                : '把文件或整个文件夹直接上传到这里，OneDrive 会保留目录结构。'
            }
            action={
              query ? (
                <button type="button" className="btn btn-sm" onClick={() => setQuery('')}>
                  清除筛选
                </button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="btn btn-sm" onClick={() => void uploadFolder()}>
                    <FolderOpen size={12} />
                    上传文件夹
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void uploadSelectedFiles()}
                  >
                    <CloudUpload size={12} />
                    上传文件
                  </button>
                </div>
              )
            }
          />
        </div>
      ) : view === 'list' ? (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[38px] !px-4">
                  <SelectAllCheckbox checked={allSelected} onChange={toggleAll} />
                </th>
                <th>名称</th>
                <th className="w-[150px]">修改时间</th>
                <th className="w-[100px]">类型</th>
                <th className="w-[100px] text-right">大小</th>
                <th className="w-[92px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isSelected = selected.has(item.path)
                return (
                  <tr
                    key={item.path}
                    className={cn('file-row', isSelected && 'selected')}
                    onClick={() => toggle(item.path)}
                    onDoubleClick={() => activate(item)}
                  >
                    <td className="!px-4" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(item.path)}
                        aria-label={`选择 ${item.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileGlyph name={item.name} isDir={item.isDir} size="sm" />
                        <button
                          type="button"
                          className="min-w-0 truncate text-left text-[12px] text-[var(--text)] hover:text-[var(--brand-text)]"
                          onClick={(event) => {
                            event.stopPropagation()
                            activate(item)
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </button>
                        {item.isDir ? (
                          <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />
                        ) : null}
                      </div>
                    </td>
                    <td className="text-[10.5px] text-[var(--text-muted)]">
                      {formatDateTime(item.modTime)}
                    </td>
                    <td className="text-[10.5px] text-[var(--text-muted)]">
                      {item.isDir ? '文件夹' : fileExtension(item.name).toUpperCase() || '文件'}
                    </td>
                    <td className="text-right font-mono text-[10.5px] text-[var(--text-soft)]">
                      {item.isDir ? '—' : formatBytes(item.size)}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {!item.isDir ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setPreview(item)}
                            title="预览"
                          >
                            <Eye size={13} />
                          </button>
                        ) : null}
                        <Dropdown
                          width={216}
                          items={[
                            {
                              label: item.isDir ? '打开文件夹' : '预览文件',
                              icon: item.isDir ? <FolderOpen size={13} /> : <Eye size={13} />,
                              onClick: () => activate(item)
                            },
                            {
                              label: item.isDir ? '下载文件夹' : '下载文件',
                              icon: <Download size={13} />,
                              onClick: () => void downloadItems([item])
                            },
                            ...(!item.isDir
                              ? [
                                  {
                                    label: '用默认应用打开',
                                    icon: <ExternalLink size={13} />,
                                    onClick: () => void openWithSystem(item)
                                  }
                                ]
                              : []),
                            {
                              label: '获取分享链接',
                              icon: <Link2 size={13} />,
                              onClick: () => void shareItem(item)
                            },
                            {
                              label: '重命名',
                              icon: <Pencil size={13} />,
                              separatorBefore: true,
                              onClick: () => setRenameItem(item)
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={13} />,
                              danger: true,
                              onClick: () => setPendingDelete([item])
                            }
                          ]}
                          trigger={
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              aria-label="更多操作"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filteredItems.map((item) => {
            const isSelected = selected.has(item.path)
            return (
              <div
                key={item.path}
                className={cn(
                  'card card-hover group relative flex cursor-default flex-col p-3 transition-colors',
                  isSelected && '!border-sky-400/40 !bg-sky-400/[0.07]'
                )}
                onClick={() => toggle(item.path)}
                onDoubleClick={() => activate(item)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(item.path)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`选择 ${item.name}`}
                  />
                  <div onClick={(event) => event.stopPropagation()}>
                    <Dropdown
                      width={216}
                      items={[
                        {
                          label: item.isDir ? '打开文件夹' : '预览文件',
                          icon: item.isDir ? <FolderOpen size={13} /> : <Eye size={13} />,
                          onClick: () => activate(item)
                        },
                        {
                          label: '下载',
                          icon: <Download size={13} />,
                          onClick: () => void downloadItems([item])
                        },
                        ...(!item.isDir
                          ? [
                              {
                                label: '用默认应用打开',
                                icon: <ExternalLink size={13} />,
                                onClick: () => void openWithSystem(item)
                              }
                            ]
                          : []),
                        {
                          label: '获取分享链接',
                          icon: <Link2 size={13} />,
                          onClick: () => void shareItem(item)
                        },
                        {
                          label: '重命名',
                          icon: <Pencil size={13} />,
                          separatorBefore: true,
                          onClick: () => setRenameItem(item)
                        },
                        {
                          label: '删除',
                          icon: <Trash2 size={13} />,
                          danger: true,
                          onClick: () => setPendingDelete([item])
                        }
                      ]}
                      trigger={
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm !h-6 !w-6 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="更多操作"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="flex flex-1 flex-col items-center gap-2.5 px-1 pb-1 text-center"
                  onClick={(event) => {
                    event.stopPropagation()
                    activate(item)
                  }}
                >
                  <FileGlyph name={item.name} isDir={item.isDir} size="lg" />
                  <span className="line-clamp-2 min-h-[32px] break-all text-[11px] font-medium leading-relaxed text-[var(--text-soft)]">
                    {item.name}
                  </span>
                </button>
                <div className="mt-1 flex items-center justify-between text-[9px] text-[var(--text-muted)]">
                  <span>{item.isDir ? '文件夹' : fileExtension(item.name).toUpperCase() || '文件'}</span>
                  <span className="font-mono">{item.isDir ? '—' : formatBytes(item.size)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[9.5px] text-[var(--text-muted)]">
        <span>
          {filteredItems.length} 个项目
          {query ? `（共 ${items.length} 个）` : ''}
        </span>
        {quota && quota.total > 0 ? (
          <span className="flex items-center gap-2">
            <span>空间</span>
            <span className="w-24">
              <StorageBar used={quota.used} total={quota.total} />
            </span>
            <span className="font-mono">{formatBytes(quota.free ?? Math.max(0, quota.total - quota.used))} 可用</span>
          </span>
        ) : null}
      </div>

      <FilePreviewModal item={preview} onClose={() => setPreview(null)} />

      {renameItem ? (
        <PromptDialog
          title="重命名"
          label={`为「${renameItem.name}」输入新名称`}
          initialValue={renameItem.name}
          confirmLabel="重命名"
          onConfirm={async (value) => {
            await window.api.renameItem(
              { name: renameItem.name, path: renameItem.path, isDir: renameItem.isDir },
              value
            )
            toast.success('重命名成功')
            await load(path)
          }}
          onClose={() => setRenameItem(null)}
        />
      ) : null}

      {newFolderOpen ? (
        <PromptDialog
          title="新建文件夹"
          label="文件夹名称"
          placeholder="例如：项目资料"
          confirmLabel="创建"
          onConfirm={async (value) => {
            await window.api.createFolder(path, value)
            toast.success('文件夹已创建')
            await load(path)
          }}
          onClose={() => setNewFolderOpen(false)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="删除 OneDrive 内容"
          danger
          message={`确定永久删除这 ${pendingDelete.length} 个项目吗？`}
          detail={`${pendingDelete
            .slice(0, 6)
            .map((item) => item.name)
            .join('、')}${pendingDelete.length > 6 ? ` 等 ${pendingDelete.length} 项` : ''}\n文件夹会被递归删除，删除后无法从 OneDrive 恢复。`}
          confirmLabel="永久删除"
          onConfirm={async () => {
            await window.api.deleteItems(
              pendingDelete.map((item) => ({
                name: item.name,
                path: item.path,
                isDir: item.isDir
              }))
            )
            toast.success('已从 OneDrive 删除')
            await load(path)
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}

function SelectAllCheckbox({
  checked,
  onChange
}: {
  checked: boolean
  onChange: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = false
  }, [checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label="全选"
    />
  )
}
