import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

let logFile = ''

export function initLogger(): string {
  const dir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(dir, { recursive: true })
  logFile = path.join(dir, 'main.log')
  try {
    const stat = fs.statSync(logFile)
    if (stat.size > 4 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`)
  } catch {
    // no existing log
  }
  return logFile
}

export function getLogPath(): string {
  return logFile
}

export function log(level: Level, message: string, meta?: unknown): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
    meta === undefined ? '' : ` ${safeJson(meta)}`
  }`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  if (!logFile) return
  try {
    fs.appendFileSync(logFile, `${line}\n`)
  } catch {
    // logging must never crash the app
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
