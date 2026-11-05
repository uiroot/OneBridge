#!/usr/bin/env node
// Seeds an isolated userData folder with demo data for UI screenshots and manual QA.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const root = process.cwd()
const demoPictures = path.join(root, 'demo-pictures')
mkdirSync(demoPictures, { recursive: true })
const userData = path.resolve(process.argv[2] || path.join(root, 'test-user-data'))
mkdirSync(userData, { recursive: true })

const now = Date.now()
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
const GB = 1024 ** 3

const groups = [
  { id: randomUUID(), name: '工作', color: '#38BDF8', createdAt: now - 20 * day },
  { id: randomUUID(), name: '照片', color: '#F472B6', createdAt: now - 18 * day },
  { id: randomUUID(), name: '备份', color: '#34D399', createdAt: now - 12 * day }
]

const task = (input) => ({
  id: randomUUID(),
  groupId: null,
  schedule: 'interval',
  intervalMinutes: 30,
  enabled: true,
  checkMode: 'size-time',
  deleteExtraneous: true,
  excludes: [],
  bandwidthLimit: '',
  postAction: 'none',
  postActionScope: 'manual',
  createdAt: now - 10 * day,
  updatedAt: now - day,
  ...input
})

const tasks = [
  task({
    name: '工作文档镜像',
    groupId: groups[0].id,
    mode: 'mirror-upload',
    pairs: [
      {
        id: randomUUID(),
        localPath: path.join(root, 'src'),
        remotePath: '工作/源码'
      }
    ],
    intervalMinutes: 30,
    lastRunAt: now - 9 * minute,
    lastResult: 'success',
    nextRunAt: now + 21 * minute,
    postAction: 'none',
    postActionScope: 'manual'
  }),
  task({
    name: '照片库同步',
    groupId: groups[1].id,
    mode: 'mirror-upload',
    pairs: [
      {
        id: randomUUID(),
        localPath: demoPictures,
        remotePath: '照片'
      }
    ],
    intervalMinutes: 120,
    lastRunAt: now - 2 * hour,
    lastResult: 'error',
    lastError: 'OneDrive 上传失败：请求超时，已重试 6 次。请检查网络连接。',
    nextRunAt: now + 58 * minute,
    deleteExtraneous: false
  }),
  task({
    name: '工程配置备份',
    groupId: groups[2].id,
    mode: 'upload',
    pairs: [
      {
        id: randomUUID(),
        localPath: path.join(root, 'package.json'),
        remotePath: '备份/工程'
      },
      {
        id: randomUUID(),
        localPath: path.join(root, 'electron.vite.config.ts'),
        remotePath: '备份/工程'
      }
    ],
    schedule: 'manual',
    intervalMinutes: 30,
    lastRunAt: now - 3 * day,
    lastResult: 'success',
    postAction: 'none',
    postActionScope: 'always'
  }),
  task({
    name: '团队资料下载',
    groupId: groups[0].id,
    mode: 'mirror-download',
    pairs: [
      {
        id: randomUUID(),
        localPath: path.join(root, 'demo-download'),
        remotePath: '工作/文档'
      }
    ],
    intervalMinutes: 60,
    enabled: false,
    lastRunAt: now - 4 * hour,
    lastResult: 'success'
  }),
  task({
    name: '桌面零散文件上传',
    mode: 'upload',
    pairs: [
      {
        id: randomUUID(),
        localPath: path.join(root, 'electron.vite.config.ts'),
        remotePath: '归档/零散文件'
      }
    ],
    intervalMinutes: 30,
    enabled: false,
    lastRunAt: now - 6 * day,
    lastResult: 'cancelled'
  })
]

const history = [
  ['工作文档镜像', 'success', now - 9 * minute, 41_500_000, 18, 32_000, 3],
  ['照片库同步', 'error', now - 2 * hour, 128_000_000, 74, 188_000, 2],
  ['工程配置备份', 'success', now - 3 * day, 284_000, 2, 2_100, 0],
  ['团队资料下载', 'success', now - 4 * hour, 8_200_000, 6, 9_400, 0],
  ['桌面零散文件上传', 'cancelled', now - 6 * day, 120_000, 1, 1_800, 0],
  ['工作文档镜像', 'success', now - 1 * day, 12_800_000, 7, 12_500, 1]
].map(([taskName, status, finishedAt, bytes, files, elapsedMs, deletes]) => ({
  id: `history-${randomUUID()}`,
  jobId: randomUUID(),
  taskId: tasks.find((item) => item.name === taskName)?.id,
  taskName,
  trigger: status === 'cancelled' ? 'browser' : 'schedule',
  status,
  startedAt: finishedAt - elapsedMs,
  finishedAt,
  summary: { bytes, files, errors: status === 'error' ? 1 : 0, elapsedMs, checks: files, deletes },
  error: status === 'error' ? '请求超时，已重试 6 次' : undefined,
  postAction: status === 'success' && taskName.includes('工程') ? 'shutdown' : undefined
}))

const config = {
  version: 1,
  settings: {
    theme: 'dark',
    defaultIntervalMinutes: 30,
    transfers: 12,
    checkers: 24,
    chunkSize: '20M',
    multiThreadStreams: 8,
    bandwidthLimit: '',
    launchAtLogin: false,
    closeToTray: true,
    notifications: true,
    rclonePath: '',
    autoDownloadRclone: true
  },
  account: {
    remoteName: 'onedrive',
    displayName: '演示账户',
    email: 'demo@example.com',
    connectedAt: now - 21 * day,
    quota: { total: 1099511627776, used: 329853488332, free: 769657139444 }
  },
  groups,
  tasks,
  history
}

writeFileSync(path.join(userData, 'config.json'), JSON.stringify(config, null, 2), 'utf8')
writeFileSync(
  path.join(userData, 'rclone.conf'),
  `[onedrive]\ntype = alias\nremote = ${path.join(root, 'demo-cloud')}\n`,
  'utf8'
)
console.log(`[seed-demo] ${userData}`)
