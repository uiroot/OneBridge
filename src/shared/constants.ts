import type { PostAction, SyncMode } from './types'

export const SYNC_MODE_META: Record<
  SyncMode,
  { label: string; shortLabel: string; description: string; destructive?: boolean }
> = {
  'mirror-upload': {
    label: '本地 → 云端镜像',
    shortLabel: '上传镜像',
    description: '让 OneDrive 与本地文件夹保持一致，云端多余文件会被删除',
    destructive: true
  },
  'mirror-download': {
    label: '云端 → 本地镜像',
    shortLabel: '下载镜像',
    description: '让本地文件夹与 OneDrive 保持一致，本地多余文件会被删除',
    destructive: true
  },
  upload: {
    label: '仅上传',
    shortLabel: '仅上传',
    description: '新增或更新文件，不删除 OneDrive 上已有的内容'
  },
  download: {
    label: '仅下载',
    shortLabel: '仅下载',
    description: '新增或更新本地文件，不删除本地已有的内容'
  }
}

export const POST_ACTION_META: Record<PostAction, { label: string; shortLabel: string }> = {
  none: { label: '不执行操作', shortLabel: '无操作' },
  'monitor-off': { label: '关闭显示器（息屏）', shortLabel: '息屏' },
  lock: { label: '锁定屏幕', shortLabel: '锁屏' },
  sleep: { label: '让电脑睡眠', shortLabel: '睡眠' },
  hibernate: { label: '让电脑休眠', shortLabel: '休眠' },
  shutdown: { label: '关闭电脑', shortLabel: '关机' }
}

export const GROUP_COLORS = [
  '#38BDF8',
  '#818CF8',
  '#34D399',
  '#FBBF24',
  '#FB7185',
  '#F472B6',
  '#2DD4BF',
  '#F97316'
]

export const CHUNK_SIZE_OPTIONS = [
  { value: '10M', label: '10 MB · 省内存' },
  { value: '20M', label: '20 MB · 推荐' },
  { value: '40M', label: '40 MB · 高速' },
  { value: '60M', label: '60 MB · 大文件' }
]

export const INTERVAL_PRESETS = [5, 15, 30, 60, 120, 360, 720, 1440]

export const PAGE_TITLES = {
  dashboard: { title: '概览', subtitle: '同步状态与账户空间一览' },
  tasks: { title: '同步任务', subtitle: '管理镜像同步与自动上传规则' },
  files: { title: '云端文件', subtitle: '浏览、上传、下载与预览 OneDrive 文件' },
  transfers: { title: '传输队列', subtitle: '实时进度与历史传输记录' },
  settings: { title: '设置', subtitle: '账户、性能与 OneDrive 同步引擎' }
} as const
