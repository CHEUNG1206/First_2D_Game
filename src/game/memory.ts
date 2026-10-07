import type { MemoryItem } from './types.ts'

/** 學到的記憶上限。核心記憶不進這個陣列，所以不會被擠掉。 */
const LEARNED_CAP = 12
/** 一天能記進提示詞的見聞。再多 3B 會開始漏看前面的句子。 */
const TODAY_CAP = 16

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function push(items: MemoryItem[], item: MemoryItem, cap: number): MemoryItem[] {
  const text = clean(item.text)
  if (!text || items.some((line) => line.text === text)) return items
  const next = [...items, { ...item, text }]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/** 模型決定留下的一句。滿了就忘掉最舊的那句學到的事。 */
export function remember(learned: MemoryItem[], item: MemoryItem): MemoryItem[] {
  return push(learned, item, LEARNED_CAP)
}

/** 今天看見或聽見的事。夜裡整理完才清。 */
export function perceive(today: MemoryItem[], item: MemoryItem): MemoryItem[] {
  return push(today, item, TODAY_CAP)
}

/**
 * 挑出跟這句話最相關的學到的記憶。
 * 用共同的字計分，不用向量。沒有重疊時補上最近的幾句，避免模型失憶。
 */
export function recall(learned: MemoryItem[], query: string, limit = 4): string[] {
  const chars = new Set([...query].filter((char) => char.trim().length > 0))
  const ranked = learned
    .map((item, index) => {
      let score = 0
      for (const char of item.text) if (chars.has(char)) score += 1
      return { text: item.text, score, index }
    })
    .sort((a, b) => b.score - a.score || b.index - a.index)
  const picked: string[] = []
  for (const item of ranked) {
    if (picked.length >= limit) break
    if (item.score <= 0 && picked.length > 0) break
    if (item.score <= 0 && picked.length === 0) {
      // 沒有重疊：下面改走最近的句子。
      break
    }
    picked.push(item.text)
  }
  if (picked.length < limit) {
    for (const item of [...learned].reverse()) {
      if (picked.length >= limit) break
      if (!picked.includes(item.text)) picked.push(item.text)
    }
  }
  return picked.slice(0, limit)
}
