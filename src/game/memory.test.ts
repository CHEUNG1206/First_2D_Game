import { describe, expect, it } from 'vitest'
import { perceive, recall, remember } from './memory.ts'
import type { MemoryItem } from './types.ts'

function line(text: string, day = 1): MemoryItem {
  return { day, kind: 'said', text }
}

describe('memory', () => {
  it('學到的記憶滿了會忘掉最舊的，核心記憶不在這個陣列', () => {
    let learned: MemoryItem[] = []
    for (let index = 0; index < 13; index += 1) learned = remember(learned, line(`第${index}句`))
    expect(learned).toHaveLength(12)
    expect(learned.some((item) => item.text === '第0句')).toBe(false)
    expect(learned.some((item) => item.text === '第12句')).toBe(true)
  })

  it('同一句不重複記', () => {
    const once = remember([line('你會嫌蛋')], line('你會嫌蛋'))
    expect(once).toHaveLength(1)
  })

  it('挑出跟這句話重疊最多的記憶', () => {
    const learned = [line('校慶那天你哭了'), line('你吃早餐會嫌蛋')]
    expect(recall(learned, '蛋煎太老了', 1)).toEqual(['你吃早餐會嫌蛋'])
  })

  it('今天的見聞有上限', () => {
    let today: MemoryItem[] = []
    for (let index = 0; index < 20; index += 1) today = perceive(today, line(`見聞${index}`))
    expect(today).toHaveLength(16)
  })
})
