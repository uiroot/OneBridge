import { useMemo, useState } from 'react'
import {
  Check,
  Layers,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { GROUP_COLORS } from '@shared/constants'
import type { JobView, SyncTask, TaskGroup } from '@shared/types'
import { useAppStore } from '../store/app'
import { cn, isActiveStatus } from '../lib/utils'
import { ConfirmDialog } from '../components/Dialogs'
import { EmptyState, PageHeader } from '../components/Layout'
import { Modal } from '../components/Modal'
import { TaskCard } from '../components/TaskCard'
import { Spinner } from '../components/Visuals'

export function TasksPage(): React.JSX.Element {
  const config = useAppStore((state) => state.config)
  const jobs = useAppStore((state) => state.jobs)
  const groupFilter = useAppStore((state) => state.taskGroupFilter)
  const setGroupFilter = useAppStore((state) => state.setTaskGroupFilter)
  const openTaskModal = useAppStore((state) => state.openTaskModal)
  const deleteTask = useAppStore((state) => state.deleteTask)
  const runAllTasks = useAppStore((state) => state.runAllTasks)
  const [query, setQuery] = useState('')
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SyncTask | null>(null)

  const tasks = config?.tasks || []
  const groups = config?.groups || []
  const activeJobs = jobs.filter((job) => isActiveStatus(job.status))
  const jobByTask = useMemo(() => {
    const map = new Map<string, JobView>()
    for (const job of activeJobs) {
      if (job.taskId && !map.has(job.taskId)) map.set(job.taskId, job)
    }
    return map
  }, [activeJobs])

  const effectiveFilter = groups.some((group) => group.id === groupFilter) ? groupFilter : null
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (effectiveFilter && task.groupId !== effectiveFilter) return false
      if (!needle) return true
      const haystack = [
        task.name,
        ...task.pairs.map((pair) => pair.localPath),
        ...task.pairs.map((pair) => pair.remotePath)
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [tasks, effectiveFilter, query])

  const enabledCount = tasks.filter((task) => task.enabled).length
  const filtering = Boolean(effectiveFilter || query.trim())
  const currentGroup = groups.find((group) => group.id === effectiveFilter)

  return (
    <div className="page-shell">
      <PageHeader
        title="同步任务"
        subtitle={`${tasks.length} 个任务 · ${enabledCount} 个自动同步${activeJobs.length ? ` · ${activeJobs.length} 个传输中` : ''}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setGroupManagerOpen(true)}>
              <Users size={13} />
              管理分组
            </button>
            <button type="button" className="btn" onClick={() => void runAllTasks()} disabled={!enabledCount}>
              <Sparkles size={13} />
              运行全部
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openTaskModal()}>
              <Plus size={14} />
              新建任务
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn('chip', !effectiveFilter && 'active')}
          onClick={() => setGroupFilter(null)}
        >
          <Layers size={12} />
          全部任务
          <span className="chip-count">{tasks.length}</span>
        </button>
        {groups.map((group) => {
          const count = tasks.filter((task) => task.groupId === group.id).length
          return (
            <button
              key={group.id}
              type="button"
              className={cn('chip', effectiveFilter === group.id && 'active')}
              onClick={() => setGroupFilter(group.id)}
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: group.color, boxShadow: `0 0 8px ${group.color}55` }}
              />
              {group.name}
              <span className="chip-count">{count}</span>
            </button>
          )
        })}
        <div className="ml-auto relative min-w-[190px] flex-1 sm:max-w-[260px]">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            className="input input-sm pl-8"
            placeholder="搜索任务或路径…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => setQuery('')}
              aria-label="清除搜索"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card overflow-hidden">
          <EmptyState
            icon={<Sparkles size={25} />}
            title="创建第一个同步任务"
            description="把任意位置的文件夹或文件直接映射到 OneDrive。支持镜像同步、定时运行、断点续传，并且不会额外占用本地磁盘。"
            action={
              <button type="button" className="btn btn-primary btn-lg" onClick={() => openTaskModal()}>
                <Plus size={14} />
                新建同步任务
              </button>
            }
          />
          <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
            {[
              { title: '任意位置', text: '本地文件无需移动到固定目录，直接选择来源即可。' },
              { title: '镜像一致', text: '开启镜像后，目标端多余文件会被自动清理。' },
              { title: '30 分钟定时', text: '默认每 30 分钟同步一次，可为每个任务单独调整。' }
            ].map((item) => (
              <div key={item.title} className="border-b border-[var(--border)] px-5 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <div className="text-[11px] font-semibold text-[var(--text-soft)]">{item.title}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Search size={24} />}
            title="没有匹配的任务"
            description={currentGroup ? `「${currentGroup.name}」分组中没有找到匹配任务。` : '试试更换关键词或清除筛选条件。'}
            action={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setQuery('')
                  setGroupFilter(null)
                }}
              >
                清除筛选
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              group={groups.find((group) => group.id === task.groupId)}
              job={jobByTask.get(task.id)}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      {filtering && filtered.length > 0 ? (
        <div className="mt-3 text-center text-[10px] text-[var(--text-muted)]">
          显示 {filtered.length} / {tasks.length} 个任务
        </div>
      ) : null}

      <GroupManager open={groupManagerOpen} onClose={() => setGroupManagerOpen(false)} />

      {pendingDelete ? (
        <ConfirmDialog
          title="删除同步任务"
          danger
          message={`确定删除「${pendingDelete.name}」吗？`}
          detail="只会移除任务规则，不会删除本地文件或 OneDrive 上的任何内容。"
          confirmLabel="删除任务"
          onConfirm={async () => {
            await deleteTask(pendingDelete.id)
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}

function GroupManager({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const config = useAppStore((state) => state.config)
  const saveGroup = useAppStore((state) => state.saveGroup)
  const deleteGroup = useAppStore((state) => state.deleteGroup)
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (!open) return null

  const groups = config?.groups || []
  const tasks = config?.tasks || []

  const create = async (): Promise<void> => {
    const value = name.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const ok = await saveGroup({
        id: crypto.randomUUID(),
        name: value,
        color,
        createdAt: Date.now()
      })
      if (ok) {
        setName('')
        setColor(GROUP_COLORS[(groups.length + 1) % GROUP_COLORS.length])
      }
    } finally {
      setBusy(false)
    }
  }

  const rename = async (group: TaskGroup): Promise<void> => {
    const value = editingName.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const ok = await saveGroup({ ...group, name: value })
      if (ok) setEditingId(null)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (group: TaskGroup): Promise<void> => {
    if (confirmDeleteId !== group.id) {
      setConfirmDeleteId(group.id)
      return
    }
    setBusy(true)
    try {
      const ok = await deleteGroup(group.id)
      if (ok) setConfirmDeleteId(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="任务分组"
      subtitle="用分组整理不同用途的同步任务，例如「工作」「照片」「备份」。"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-400">
          <Users size={16} />
        </span>
      }
      onClose={onClose}
      widthClass="max-w-[520px]"
      footer={
        <button type="button" className="btn" onClick={onClose}>
          完成
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3.5">
          <label className="label">新建分组</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={name}
              maxLength={30}
              placeholder="输入分组名称"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create()
              }}
            />
            <button
              type="button"
              className="btn btn-primary shrink-0"
              onClick={() => void create()}
              disabled={!name.trim() || busy}
            >
              {busy ? <Spinner size={12} /> : <Plus size={13} />}
              添加
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="mr-1 text-[9.5px] text-[var(--text-muted)]">颜色</span>
            {GROUP_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  'h-5 w-5 rounded-full border-2 transition-transform',
                  color === item ? 'scale-110 border-white/80' : 'border-transparent hover:scale-105'
                )}
                style={{ background: item }}
                onClick={() => setColor(item)}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label !mb-0">已有分组</label>
            <span className="hint">{groups.length} 个</span>
          </div>
          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-7 text-center">
              <Settings2 size={20} className="mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
              <div className="text-[11px] text-[var(--text-muted)]">还没有分组，创建一个来整理任务。</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.map((group) => {
                const count = tasks.filter((task) => task.groupId === group.id).length
                const editing = editingId === group.id
                return (
                  <div
                    key={group.id}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: group.color }}
                    />
                    {editing ? (
                      <>
                        <input
                          className="input input-sm !h-[28px] flex-1"
                          value={editingName}
                          maxLength={30}
                          autoFocus
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void rename(group)
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-soft"
                          onClick={() => void rename(group)}
                          disabled={busy || !editingName.trim()}
                          aria-label="保存名称"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-ghost"
                          onClick={() => setEditingId(null)}
                          aria-label="取消"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11.5px] font-medium text-[var(--text-soft)]">
                            {group.name}
                          </div>
                          <div className="text-[9px] text-[var(--text-muted)]">{count} 个任务</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-icon btn-sm btn-ghost"
                          onClick={() => {
                            setEditingId(group.id)
                            setEditingName(group.name)
                          }}
                          aria-label="重命名分组"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'btn btn-sm',
                            confirmDeleteId === group.id ? 'btn-danger' : 'btn-ghost btn-icon'
                          )}
                          onClick={() => void remove(group)}
                          aria-label={confirmDeleteId === group.id ? '确认删除分组' : '删除分组'}
                          disabled={busy}
                          title={confirmDeleteId === group.id ? '再次点击确认删除' : '删除分组'}
                        >
                          {confirmDeleteId === group.id ? (
                            <span className="flex items-center gap-1 text-[9.5px]">
                              <Trash2 size={11} /> 确认
                            </span>
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="hint mt-2">删除分组不会删除任务，其中的任务会回到「未分组」。</p>
        </div>
      </div>
    </Modal>
  )
}
