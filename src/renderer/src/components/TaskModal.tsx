import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Cloud,
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Gauge,
  Info,
  Layers,
  ListChecks,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Timer,
  Trash2,
  Zap
} from 'lucide-react'
import type {
  CheckMode,
  PostAction,
  PostActionScope,
  ScheduleMode,
  SyncMode,
  SyncTask,
  TransferPair
} from '@shared/types'
import {
  CHUNK_SIZE_OPTIONS,
  INTERVAL_PRESETS,
  POST_ACTION_META,
  SYNC_MODE_META
} from '@shared/constants'
import { basename, cn } from '../lib/utils'
import { useAppStore } from '../store/app'
import { Modal } from './Modal'
import { CloudFolderPicker } from './CloudFolderPicker'
import { Switch } from './Layout'

const MODE_ICONS: Record<SyncMode, typeof CloudUpload> = {
  'mirror-upload': CloudUpload,
  'mirror-download': CloudDownload,
  upload: ArrowUpToLine,
  download: ArrowDownToLine
}

interface Draft {
  name: string
  groupId: string | null
  mode: SyncMode
  pairs: TransferPair[]
  schedule: ScheduleMode
  intervalMinutes: number
  enabled: boolean
  checkMode: CheckMode
  deleteExtraneous: boolean
  excludes: string
  bandwidthLimit: string
  postAction: PostAction
  postActionScope: PostActionScope
}

function emptyPair(): TransferPair {
  return { id: crypto.randomUUID(), localPath: '', remotePath: '' }
}

export function TaskModal(): React.JSX.Element | null {
  const taskModal = useAppStore((state) => state.taskModal)
  const closeTaskModal = useAppStore((state) => state.closeTaskModal)
  const saveTask = useAppStore((state) => state.saveTask)
  const config = useAppStore((state) => state.config)
  const defaults = config?.settings
  const groups = config?.groups || []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [remotePickerIndex, setRemotePickerIndex] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!taskModal.open) {
      setDraft(null)
      return
    }
    const task = taskModal.task
    setDraft({
      name: task?.name || '',
      groupId: task?.groupId || null,
      mode: task?.mode || 'mirror-upload',
      pairs: task?.pairs.length
        ? task.pairs.map((pair) => ({ ...pair }))
        : [emptyPair()],
      schedule: task?.schedule || 'interval',
      intervalMinutes: task?.intervalMinutes || defaults?.defaultIntervalMinutes || 30,
      enabled: task?.enabled ?? true,
      checkMode: task?.checkMode || 'size-time',
      deleteExtraneous: task?.deleteExtraneous ?? true,
      excludes: (task?.excludes || []).join('\n'),
      bandwidthLimit: task?.bandwidthLimit || '',
      postAction: task?.postAction || 'none',
      postActionScope: task?.postActionScope || 'manual'
    })
    setError(null)
    setSaving(false)
    setRemotePickerIndex(null)
    setAdvancedOpen(
      Boolean(
        task &&
          (task.excludes.length > 0 ||
            task.checkMode === 'checksum' ||
            task.bandwidthLimit ||
            task.postAction !== 'none')
      )
    )
  }, [taskModal.open, taskModal.task, defaults?.defaultIntervalMinutes])

  const isUpload = draft ? draft.mode === 'upload' || draft.mode === 'mirror-upload' : true
  const isMirror = draft ? draft.mode === 'mirror-upload' || draft.mode === 'mirror-download' : true
  const remotePickerPath =
    remotePickerIndex !== null && draft ? draft.pairs[remotePickerIndex]?.remotePath || '' : ''

  const group = useMemo(
    () => groups.find((item) => item.id === draft?.groupId),
    [groups, draft?.groupId]
  )

  if (!taskModal.open || !draft) return null

  const patch = (value: Partial<Draft>): void => {
    setDraft((current) => (current ? { ...current, ...value } : current))
    setError(null)
  }

  const patchPair = (index: number, value: Partial<TransferPair>): void => {
    setDraft((current) => {
      if (!current) return current
      const pairs = current.pairs.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, ...value } : pair
      )
      if (
        index === 0 &&
        value.localPath &&
        !current.name.trim()
      ) {
        return { ...current, pairs, name: basename(value.localPath) }
      }
      return { ...current, pairs }
    })
    setError(null)
  }

  const addPairsFromPaths = (paths: string[], remotePath: string): void => {
    if (!paths.length) return
    setDraft((current) => {
      if (!current) return current
      const existing = current.pairs.filter((pair) => pair.localPath.trim() || pair.remotePath.trim())
      const additions = paths.map((localPath) => ({
        id: crypto.randomUUID(),
        localPath,
        remotePath
      }))
      const pairs = [...existing, ...additions]
      return {
        ...current,
        pairs,
        name:
          current.name.trim() ||
          (paths.length === 1 ? basename(paths[0]) : `同步 ${paths.length} 个项目`)
      }
    })
    setError(null)
  }

  const addFiles = async (): Promise<void> => {
    if (!isUpload) return
    const paths = await window.api.pickLocalFiles()
    if (!paths.length) return
    const baseRemote = draft.pairs[0]?.remotePath || ''
    addPairsFromPaths(paths, baseRemote)
  }

  const addFolder = async (): Promise<void> => {
    const folder = await window.api.pickLocalFolder()
    if (!folder) return
    const baseRemote = draft.pairs[0]?.remotePath || ''
    addPairsFromPaths([folder], baseRemote)
  }

  const addManualPair = (): void => {
    setDraft((current) =>
      current ? { ...current, pairs: [...current.pairs, emptyPair()] } : current
    )
  }

  const removePair = (index: number): void => {
    setDraft((current) => {
      if (!current) return current
      const pairs = current.pairs.filter((_, pairIndex) => pairIndex !== index)
      return { ...current, pairs: pairs.length ? pairs : [emptyPair()] }
    })
  }

  const chooseMode = (mode: SyncMode): void => {
    patch({
      mode,
      deleteExtraneous:
        mode === 'mirror-upload' || mode === 'mirror-download' ? draft.deleteExtraneous : false
    })
  }

  const validate = (): string | null => {
    if (!draft.name.trim()) return '请填写任务名称'
    const pairs = draft.pairs.filter((pair) => pair.localPath.trim())
    if (!pairs.length) return isUpload ? '请至少添加一个本地文件或文件夹' : '请至少添加一个本地保存目录'
    for (const pair of pairs) {
      if (!pair.remotePath.trim() && isUpload) {
        return '请选择 OneDrive 云端目标文件夹'
      }
      if (!pair.remotePath.trim() && !isUpload) {
        return '请选择 OneDrive 云端来源文件夹'
      }
    }
    if (draft.schedule === 'interval' && (!Number.isFinite(draft.intervalMinutes) || draft.intervalMinutes < 1)) {
      return '同步间隔至少为 1 分钟'
    }
    return null
  }

  const submit = async (): Promise<void> => {
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }
    setSaving(true)
    try {
      const existing = taskModal.task
      const payload: SyncTask = {
        id: existing?.id || crypto.randomUUID(),
        name: draft.name.trim(),
        groupId: draft.groupId,
        mode: draft.mode,
        pairs: draft.pairs
          .filter((pair) => pair.localPath.trim())
          .map((pair) => ({
            ...pair,
            localPath: pair.localPath.trim(),
            remotePath: pair.remotePath
              .replace(/\\/g, '/')
              .split('/')
              .map((part) => part.trim())
              .filter(Boolean)
              .join('/')
          })),
        schedule: draft.schedule,
        intervalMinutes: Math.max(1, Math.round(draft.intervalMinutes)),
        enabled: draft.enabled,
        checkMode: draft.checkMode,
        deleteExtraneous: isMirror ? draft.deleteExtraneous : false,
        excludes: draft.excludes
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        bandwidthLimit: draft.bandwidthLimit.trim(),
        postAction: draft.postAction,
        postActionScope: draft.postActionScope,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastRunAt: existing?.lastRunAt,
        lastResult: existing?.lastResult,
        lastError: existing?.lastError,
        nextRunAt: existing?.nextRunAt
      }
      const ok = await saveTask(payload)
      if (ok) closeTaskModal()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        title={taskModal.task ? '编辑同步任务' : '新建同步任务'}
        subtitle="把任意位置的文件夹或文件直接同步到 OneDrive，不会额外占用本地磁盘。"
        icon={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-400">
            <Layers size={16} />
          </span>
        }
        onClose={closeTaskModal}
        widthClass="max-w-[840px]"
        footer={
          <>
            <div className="mr-auto flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              {group ? (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                  {group.name}
                </>
              ) : (
                '自动定时同步'
              )}
            </div>
            <button type="button" className="btn" onClick={closeTaskModal} disabled={saving}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submit()}
              disabled={saving}
            >
              <Save size={13} />
              {saving ? '保存中…' : taskModal.task ? '保存修改' : '创建任务'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div>
              <label className="label">任务名称</label>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="例如：工作文档备份"
                maxLength={80}
              />
            </div>
            <div>
              <label className="label">任务分组</label>
              <select
                className="select"
                value={draft.groupId || ''}
                onChange={(event) => patch({ groupId: event.target.value || null })}
              >
                <option value="">未分组</option>
                {groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label !mb-0">同步方向</label>
              <span className="hint">镜像模式会让云端与本地完全一致</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(SYNC_MODE_META) as SyncMode[]).map((mode) => {
                const meta = SYNC_MODE_META[mode]
                const Icon = MODE_ICONS[mode]
                const active = draft.mode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    className={cn('mode-card', active && 'active')}
                    onClick={() => chooseMode(mode)}
                  >
                    <span className="mode-icon">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text)]">
                        {meta.label}
                        {meta.destructive ? (
                          <ShieldAlert size={10} className="text-amber-400" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--text-muted)]">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {isMirror ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                <div>
                  <div className="text-[11px] font-medium text-[var(--text-soft)]">
                    删除{isUpload ? '云端' : '本地'}多余文件
                  </div>
                  <div className="text-[9.5px] text-[var(--text-muted)]">
                    关闭后仅新增和更新，不删除目标端已有内容
                  </div>
                </div>
                <Switch
                  checked={draft.deleteExtraneous}
                  onChange={(value) => patch({ deleteExtraneous: value })}
                  label="删除多余文件"
                />
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label !mb-0">
                {isUpload ? '本地来源与云端目标' : '云端来源与本地保存位置'}
              </label>
              <span className="hint">
                共 {draft.pairs.filter((pair) => pair.localPath.trim()).length} 个位置
              </span>
            </div>
            <div className="space-y-2">
              {draft.pairs.map((pair, index) => (
                <div key={pair.id} className="source-row !items-start">
                  <span className="mt-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel-solid)] font-mono text-[9px] text-[var(--text-muted)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-[9.5px] text-[var(--text-muted)]">
                        {isUpload ? '本地文件 / 文件夹' : '本地保存目录'}
                      </label>
                      <input
                        className="input input-sm selectable"
                        value={pair.localPath}
                        onChange={(event) => patchPair(index, { localPath: event.target.value })}
                        placeholder={isUpload ? 'C:\\Users\\你\\Documents' : 'D:\\OneDrive 备份'}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 flex items-center gap-1 text-[9.5px] text-[var(--text-muted)]">
                        {isUpload ? 'OneDrive 目标文件夹' : 'OneDrive 来源文件夹'}
                        <Cloud size={9} className="text-sky-400" />
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          className="input input-sm selectable font-mono text-[11px]"
                          value={pair.remotePath}
                          onChange={(event) =>
                            patchPair(index, {
                              remotePath: event.target.value
                                .replace(/\\/g, '/')
                                .replace(/^\/+/, '')
                            })
                          }
                          placeholder="例如：备份/工作"
                        />
                        <button
                          type="button"
                          className="btn btn-icon btn-sm shrink-0"
                          onClick={() => setRemotePickerIndex(index)}
                          title="浏览 OneDrive 文件夹"
                        >
                          <FolderOpen size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm mt-5 shrink-0 text-[var(--text-muted)] hover:text-[var(--danger-text)]"
                    onClick={() => removePair(index)}
                    title="移除这一行"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {isUpload ? (
                <button type="button" className="btn btn-sm" onClick={() => void addFiles()}>
                  <Plus size={12} />
                  添加文件
                </button>
              ) : null}
              <button type="button" className="btn btn-sm" onClick={() => void addFolder()}>
                <Plus size={12} />
                {isUpload ? '添加文件夹' : '添加本地目录'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addManualPair}>
                手动添加一行
              </button>
            </div>
            <p className="hint mt-2 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              {isUpload
                ? 'rclone 会直接读取本地文件并流式上传，不会先复制到其他磁盘。'
                : '云端目录会同步到本地目录。若选择仅下载，不会删除本地已有文件。'}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3.5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[170px]">
                <label className="label">运行方式</label>
                <div className="segmented">
                  <button
                    type="button"
                    className={cn('segmented-item', draft.schedule === 'interval' && 'active')}
                    onClick={() => patch({ schedule: 'interval' })}
                  >
                    <Timer size={11} className="mr-1 inline-block" />
                    自动定时
                  </button>
                  <button
                    type="button"
                    className={cn('segmented-item', draft.schedule === 'manual' && 'active')}
                    onClick={() => patch({ schedule: 'manual' })}
                  >
                    仅手动
                  </button>
                </div>
              </div>
              {draft.schedule === 'interval' ? (
                <div className="min-w-0 flex-1">
                  <label className="label">同步间隔</label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {INTERVAL_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={cn(
                          'chip !h-[27px] !px-2.5 !text-[10.5px]',
                          draft.intervalMinutes === minutes && 'active'
                        )}
                        onClick={() => patch({ intervalMinutes: minutes })}
                      >
                        {intervalShortLabel(minutes)}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={10080}
                        className="input input-sm w-[74px] text-center"
                        value={draft.intervalMinutes}
                        onChange={(event) =>
                          patch({ intervalMinutes: Math.max(1, Number(event.target.value) || 1) })
                        }
                      />
                      <span className="text-[10px] text-[var(--text-muted)]">分钟</span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10.5px] text-[var(--text-muted)]">
                  {draft.enabled ? '启用任务' : '暂停任务'}
                </span>
                <Switch
                  checked={draft.enabled}
                  onChange={(value) => patch({ enabled: value })}
                  label="启用任务"
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-transparent py-1 text-left text-[11px] font-medium text-[var(--text-soft)] transition-colors hover:text-[var(--text)]"
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <SlidersHorizontal size={13} className="text-[var(--text-muted)]" />
              高级选项
              <span className="hint font-normal">
                校验方式、排除规则、限速与完成后操作
              </span>
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                {advancedOpen ? '收起' : '展开'}
              </span>
            </button>

            {advancedOpen ? (
              <div className="mt-3 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label flex items-center gap-1.5">
                      <ListChecks size={11} /> 文件校验方式
                    </label>
                    <select
                      className="select"
                      value={draft.checkMode}
                      onChange={(event) => patch({ checkMode: event.target.value as CheckMode })}
                    >
                      <option value="size-time">大小 + 修改时间（最快）</option>
                      <option value="checksum">校验和（更严格，较慢）</option>
                    </select>
                  </div>
                  <div>
                    <label className="label flex items-center gap-1.5">
                      <Gauge size={11} /> 带宽限制
                    </label>
                    <input
                      className="input selectable"
                      value={draft.bandwidthLimit}
                      onChange={(event) => patch({ bandwidthLimit: event.target.value })}
                      placeholder="留空 = 不限速（最快）"
                    />
                    <p className="hint mt-1">可填写 10M、1G 等；留空即使用全局设置（默认不限速）。</p>
                  </div>
                </div>

                <div>
                  <label className="label">排除规则</label>
                  <textarea
                    className="textarea selectable !min-h-[72px] font-mono text-[11px]"
                    value={draft.excludes}
                    onChange={(event) => patch({ excludes: event.target.value })}
                    placeholder={'每行一条，例如：\n*.tmp\nnode_modules/**\n.DS_Store'}
                  />
                  <p className="hint mt-1">遵循 rclone 过滤语法，每行一个规则。</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <div>
                    <label className="label flex items-center gap-1.5">
                      <Zap size={11} /> 传输完成后
                    </label>
                    <select
                      className="select"
                      value={draft.postAction}
                      onChange={(event) => patch({ postAction: event.target.value as PostAction })}
                    >
                      {(Object.keys(POST_ACTION_META) as PostAction[]).map((action) => (
                        <option key={action} value={action}>
                          {POST_ACTION_META[action].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {draft.postAction !== 'none' ? (
                    <div>
                      <label className="label">生效范围</label>
                      <select
                        className="select"
                        value={draft.postActionScope}
                        onChange={(event) =>
                          patch({ postActionScope: event.target.value as PostActionScope })
                        }
                      >
                        <option value="manual">仅手动运行时</option>
                        <option value="always">每次运行后</option>
                      </select>
                    </div>
                  ) : null}
                </div>
                <p className="hint flex items-start gap-1.5">
                  <Info size={11} className="mt-0.5 shrink-0" />
                  关机操作会先弹出 60 秒倒计时确认，可随时在应用内取消。传输失败时不会执行。
                </p>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[11.5px] text-[var(--danger-text)]">
              {error}
            </div>
          ) : null}
        </div>
      </Modal>

      <CloudFolderPicker
        open={remotePickerIndex !== null}
        title={isUpload ? '选择 OneDrive 目标文件夹' : '选择 OneDrive 来源文件夹'}
        subtitle={
          isUpload
            ? '选中的目录将作为这个来源的上传目标。'
            : '选中的目录将同步到左侧的本地目录。'
        }
        initialPath={remotePickerPath}
        onSelect={(path) => {
          if (remotePickerIndex === null) return
          patchPair(remotePickerIndex, { remotePath: path })
        }}
        onClose={() => setRemotePickerIndex(null)}
      />
    </>
  )
}

function intervalShortLabel(minutes: number): string {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} 天`
  if (minutes >= 60) return `${Math.round(minutes / 60)} 小时`
  return `${minutes} 分钟`
}
