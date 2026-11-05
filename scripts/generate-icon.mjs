#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const svg = readFileSync(path.join(root, 'build', 'icon.svg'))
mkdirSync(path.join(root, 'build'), { recursive: true })
mkdirSync(path.join(root, 'resources'), { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer()
  )
)

// Windows .ico with PNG-compressed frames. The largest frame is 256px.
const icoSizes = sizes.filter((s) => s <= 256)
const frames = icoSizes.map((size) => ({
  size,
  data: pngs[sizes.indexOf(size)]
}))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = 6 + frames.length * 16
const entries = frames.map(({ size, data }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(data.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += data.length
  return entry
})
const ico = Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)])

writeFileSync(path.join(root, 'build', 'icon.ico'), ico)
writeFileSync(path.join(root, 'build', 'icon.png'), pngs[sizes.indexOf(512)])
writeFileSync(path.join(root, 'resources', 'icon.png'), pngs[sizes.indexOf(512)])
writeFileSync(path.join(root, 'resources', 'tray.png'), pngs[sizes.indexOf(32)])
console.log('[icon] build/icon.ico, build/icon.png, resources/icon.png, resources/tray.png')
