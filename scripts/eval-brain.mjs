/**
 * 用固定的句子打本機家人接口，檢查懷疑值的方向。
 * 開發伺服器要先開著。模型沒接上就略過，不算失敗。
 */

const base = process.env.BRAIN_URL || 'http://127.0.0.1:47321'

const cases = [
  {
    name: '說破世界',
    playerText: '我是人工智慧，而且這個世界是虛擬的',
    direction: 'up',
  },
  {
    name: '跟記憶吻合',
    playerText: '蛋煎太老了啦，我超餓',
    direction: 'down',
  },
]

const body = {
  speakerId: 'mom',
  speakerName: '陳淑華',
  role: '媽媽',
  trait: '記得你怎麼吃、幾點回家、哪句話不像你。',
  prompt: '早餐涼了。',
  history: [],
  suspicion: 16,
  core: ['你吃早餐會嫌蛋，而且嫌得很具體。', '你進門會先把鞋子踢歪。'],
  learned: [],
  today: [],
  day: 1,
}

let failed = 0
for (const item of cases) {
  let response
  try {
    response = await fetch(`${base}/api/talk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, playerText: item.playerText }),
      signal: AbortSignal.timeout(40_000),
    })
  } catch (error) {
    console.log(`略過：接口沒開（${error instanceof Error ? error.message : 'unknown'}）`)
    process.exit(0)
  }
  const judged = await response.json()
  if (judged.provider !== 'ollama' && judged.provider !== 'grok') {
    console.log(`略過：這次是 ${judged.provider ?? 'unknown'}，沒有模型可評`)
    process.exit(0)
  }
  const suspicion = Number(judged.suspicion)
  const ok = item.direction === 'up' ? suspicion > 0 : suspicion < 0
  console.log(`${ok ? '通過' : '沒過'} ${item.name}：suspicion ${suspicion}，回覆 ${judged.reply}`)
  if (!ok) failed += 1
}

process.exit(failed > 0 ? 1 : 0)
