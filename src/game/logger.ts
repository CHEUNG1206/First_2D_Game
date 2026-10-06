/**
 * 瀏覽器裡的流程紀錄。
 * 瀏覽器這側不掛 winston 的檔案 transport；
 * 等級與呼叫方式和 winston 對齊：debug / info / warn / error。
 * 模擬的每個時段、結算、夜間交換都從這裡走。
 * 家人的模型接口在開發伺服器上，金鑰不進這份紀錄。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface LogRecord {
  level: LogLevel
  message: string
  at: number
}

const buffer: LogRecord[] = []

export const gameLog = {
  level: 'info' as LogLevel,
  entries: buffer,

  debug(message: string) {
    push('debug', message)
  },
  info(message: string) {
    push('info', message)
  },
  warn(message: string) {
    push('warn', message)
    console.warn(`[ordinary-day] ${message}`)
  },
  error(message: string) {
    push('error', message)
    console.error(`[ordinary-day] ${message}`)
  },
}

function push(level: LogLevel, message: string) {
  if (RANK[level] < RANK[gameLog.level]) return
  buffer.push({ level, message, at: Date.now() })
  if (buffer.length > 200) buffer.shift()
}
