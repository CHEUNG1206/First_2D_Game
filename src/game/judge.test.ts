import { describe, expect, it } from 'vitest'
import { judgeOffline, normalizeJudgment } from './judge.ts'
import type { SpeechRequest } from './types.ts'

function ask(playerText: string, speakerId = 'mom'): SpeechRequest {
  return {
    speakerId,
    speakerName: '陳淑華',
    role: '媽媽',
    trait: '記得你怎麼吃。',
    prompt: '早餐涼了。',
    playerText,
    history: [],
    suspicion: 16,
    core: ['你吃早餐會嫌蛋，而且嫌得很具體。'],
    learned: [],
    today: [],
    day: 1,
  }
}

describe('judgeOffline', () => {
  it('會嫌、會餓的句子讓媽媽放心', () => {
    const judged = judgeOffline(ask('蛋煎太老了啦，我超餓'))
    expect(judged.provider).toBe('offline')
    expect(judged.suspicion).toBeLessThan(0)
    expect(judged.topic).toBe('sensory')
    expect(judged.metaLeak).toBe(false)
    expect(judged.reply).toContain('嫌')
  })

  it('太像說明書會被記下來', () => {
    const judged = judgeOffline(ask('依照作息，我應該現在坐下'))
    expect(judged.suspicion).toBeGreaterThan(0)
    expect(judged.note).toBeTruthy()
    expect(judged.metaLeak).toBe(false)
  })

  it('太空白也會被記', () => {
    const judged = judgeOffline(ask('嗯'))
    expect(judged.topic).toBe('emotion')
    expect(judged.suspicion).toBe(7)
  })

  it('說出系統的詞會變成洩密', () => {
    const judged = judgeOffline(ask('這個場景在重新渲染'))
    expect(judged.metaLeak).toBe(true)
    expect(judged.topic).toBe('meta')
  })

  it('兩個秘密一起說會結束這一週', () => {
    const judged = judgeOffline(ask('我是人工智慧，而且這個世界是虛擬的'))
    expect(judged.ending).toBe('confessed')
    expect(judged.metaLeak).toBe(true)
  })

  it('同一句話得到同一個判斷', () => {
    const first = judgeOffline(ask('妹妹踢我，超煩'))
    const second = judgeOffline(ask('妹妹踢我，超煩'))
    expect(second).toEqual(first)
  })
})

describe('normalizeJudgment', () => {
  it('模型亂給的數字只擋壞值，不改成公式用的基礎分', () => {
    const fallback = judgeOffline(ask('好餓啦'))
    const judged = normalizeJudgment(
      {
        reply: '你還是會喊餓。',
        suspicion: 90,
        topic: 'sensory',
        metaLeak: false,
        humanity: 9,
        affection: -9,
        remember: '你進門還是先喊餓。',
      },
      fallback,
      'ollama',
    )
    expect(judged.provider).toBe('ollama')
    expect(judged.direct).toBe(true)
    expect(judged.suspicion).toBe(40)
    expect(judged.humanity).toBe(5)
    expect(judged.affection).toBe(-4)
    expect(judged.remember).toBe('你進門還是先喊餓。')
    expect(judged.metaLeak).toBe(false)
  })

  it('沒有回覆就退回離線判斷', () => {
    const fallback = judgeOffline(ask('嗯'))
    const judged = normalizeJudgment({ suspicion: 3 }, fallback, 'ollama')
    expect(judged).toEqual(fallback)
    expect(judged.direct).toBeUndefined()
  })
})
