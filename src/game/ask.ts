import { judgeOffline, nightOffline } from './judge.ts'
import { gameLog } from './logger.ts'
import { nightRequests } from './engine.ts'
import type { GameState, NightJudgment, SpeechJudgment, SpeechRequest } from './types.ts'

/**
 * 先問本機的對話接口。
 * 接口裡會再試 Qwen、再試 Grok。兩邊都不在，或這次請求失敗，就用離線家人。
 * 金鑰只留在伺服器，這裡看不到。
 */
export async function askFamily(request: SpeechRequest): Promise<SpeechJudgment> {
  const payload: SpeechRequest = {
    ...request,
    playerText: request.playerText.trim().slice(0, 200),
    history: request.history.slice(-8).map((turn) => ({
      role: turn.role,
      text: turn.text.slice(0, 200),
    })),
  }
  try {
    const response = await fetch('/api/talk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`talk ${response.status}`)
    const data = (await response.json()) as SpeechJudgment
    if (!data || typeof data.reply !== 'string' || !data.provider) throw new Error('talk shape')
    gameLog.info(`家人回答來自 ${data.provider}`)
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    gameLog.warn(`家人接口改走離線判斷 ${message}`)
    return judgeOffline(payload)
  }
}

/** 睡覺之後問夜談。接口失敗就用離線整理，畫面會標出來。 */
export async function askNight(state: GameState): Promise<NightJudgment[]> {
  const members = nightRequests(state)
  try {
    const response = await fetch('/api/night', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ members }),
    })
    if (!response.ok) throw new Error(`night ${response.status}`)
    const data = (await response.json()) as { judgments?: NightJudgment[] }
    if (!data.judgments || data.judgments.length === 0) throw new Error('night shape')
    gameLog.info(`夜談來自 ${data.judgments.map((item) => item.provider).join(',')}`)
    return data.judgments
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    gameLog.warn(`夜談改走離線判斷 ${message}`)
    return members.map((member) => nightOffline(member))
  }
}
