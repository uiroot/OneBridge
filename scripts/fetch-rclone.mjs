#!/usr/bin/env node
/**
 * Downloads the latest stable rclone for Windows into resources/bin.
 * Used at install-time so the packaged app can ship with a working engine.
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const binDir = path.join(root, 'resources', 'bin')
const target = path.join(binDir, 'rclone.exe')
const force = process.argv.includes('--force')
const url = 'https://downloads.rclone.org/rclone-current-windows-amd64.zip'

const log = (message) => console.log(`[rclone] ${message}`)

if (os.platform() !== 'win32') {
  log('仅 Windows 需要内置 rclone，跳过。')
  process.exit(0)
}

if (existsSync(target) && !force) {
  log(`已存在 ${target}（${(statSync(target).size / 1024 / 1024).toFixed(1)} MB），跳过下载。`)
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })
const tmpDir = path.join(os.tmpdir(), `onebridge-rclone-${Date.now()}`)
mkdirSync(tmpDir, { recursive: true })
const zipPath = path.join(tmpDir, 'rclone.zip')

try {
  log('正在下载 rclone（约 25 MB）…')
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastTick = 0
  const source = Readable.fromWeb(response.body)
  source.on('data', (chunk) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastTick > 800) {
      lastTick = now
      const pct = total ? ((received / total) * 100).toFixed(0) : '?'
      log(`已下载 ${(received / 1024 / 1024).toFixed(1)} MB (${pct}%)`)
    }
  })
  await pipeline(source, createWriteStream(zipPath))

  log('正在解压…')
  const zip = new AdmZip(zipPath)
  const entry = zip
    .getEntries()
    .find((item) => /rclone\.exe$/i.test(item.entryName) && !item.isDirectory)
  if (!entry) throw new Error('压缩包内未找到 rclone.exe')
  const tempExe = path.join(tmpDir, 'rclone.exe')
  zip.extractEntryTo(entry, tmpDir, false, true)
  const extracted = path.join(tmpDir, path.basename(entry.entryName))
  if (!existsSync(extracted)) throw new Error('解压 rclone.exe 失败')
  if (existsSync(target)) rmSync(target)
  // Temp may live on another volume (C:) than the project (D:), so copy instead of rename.
  copyFileSync(extracted, target)
  log(`完成：${target}`)
} catch (error) {
  console.warn(`[rclone] 自动下载失败：${error.message}`)
  console.warn('[rclone] 应用启动后仍可在设置页重试下载，或手动放置 rclone.exe。')
  // Do not fail npm install when the network is unavailable.
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}
