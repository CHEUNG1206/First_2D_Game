import type { EndingId, SpeechJudgment, SpeechRequest, Topic } from './types.ts'

/**
 * 沒有模型時的家人。
 * 規則固定、可重播：太像說明書、太空白、說破系統都會被記；
 * 會餓、會嫌、會玩笑就放心。模型回來之後走同一份欄位。
 */

const TOPICS: Topic[] = ['routine', 'emotion', 'memory', 'meta', 'sensory', 'play']

const AI_WORD = /人工智慧|人工智能|\bAI\b|智能體/
const WORLD_WORD = /虛擬|假的世界|不是真的|模擬世界|這個世界是/
const META_WORD = /人工智慧|人工智能|虛擬|渲染|循環|程式|程序|場景|系統|伺服器|腳本|演算法|模擬|\bNPC\b|\bAI\b/i
const ROBOT_WORD = /狀態|定義|依照|範圍|穩定|偏差|鈉|溫度|報告|處理|參數|讀檔|清單|秒|克/
const FLAT_WORD = /^(嗯|哦|喔|好|好的|不知道|沒感覺|沒事|還好|無|……|\.{1,3}|。|哦。|嗯。)$/
const HUMAN_WORD = /好像|還是|超|啦|欸|餓|嫌|怕|糗|討厭|好吃|好累|幹嘛|笨蛋|肚子|哈哈|想吃|太老|太鹹|太甜|踢|幼稚|失敗|好香|難過|煩/

interface Voice {
  human: (quote: string) => string
  meta: (quote: string) => string
  robot: (quote: string) => string
  flat: () => string
  neutral: (quote: string) => string
  confess: () => string
}

const VOICE: Record<string, Voice> = {
  mom: {
    human: (quote) => `你說「${quote}」。還是這麼嫌東嫌西，鍋鏟可以繼續動了。`,
    meta: (quote) => `「${quote}」……你把話說得好奇怪。媽媽看著你，沒有立刻笑。`,
    robot: (quote) => `我是在問你這個人，不是在聽「${quote}」這種報告。`,
    flat: () => '旅途累到話都沒了？她皺著眉，把盤子轉了一下。',
    neutral: (quote) => `「${quote}」。她嗯了一聲，好像還在等你說得更像自己。`,
    confess: () => '她把鍋鏟放下。「你先坐。把剛剛那句，用家人聽得懂的方式再說一次。」',
  },
  dad: {
    human: (quote) => `他「嗯」了一聲。「${quote}。這才像你會講的。」`,
    meta: (quote) => `他看了你很久。「${quote}。這不像我們家的句子。」`,
    robot: (quote) => `「${quote}。」他把東西放下。「你記得太整齊了。」`,
    flat: () => '他沒有把話收回去。過了幾秒才說：「也對。」語氣卻不是在同意。',
    neutral: (quote) => `「${quote}。」他點一下頭，視線還停在你臉上。`,
    confess: () => '他很慢地說：「我們先不吃飯。你坐著。告訴我們你到底是誰。」',
  },
  sister: {
    human: (quote) => `她噴笑。「${quote}。你還是很幼稚。」在這個家，那句話是誇獎。`,
    meta: (quote) => `笑停住了。「${quote}。你幹嘛回答得好像真的被問到。」`,
    robot: (quote) => `她重複了一遍：「${quote}。」然後沒有再笑。`,
    flat: () => '她哦了一聲，把椅子轉回去。「好喔。那我就自己記著。」',
    neutral: (quote) => `「${quote}。」她歪頭。「可以再講得不像作業一點嗎。」`,
    confess: () => '妹妹第一個開口：「……你可不可以講人話。」她聽懂的不是名詞。',
  },
}

function voiceOf(id: string): Voice {
  return VOICE[id] ?? VOICE.mom!
}

function quote(text: string): string {
  const clean = text.replace(/\s+/g, '').slice(0, 14)
  return clean.length > 0 ? clean : '……'
}

function clipNote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 28)
  return clean.length > 0 ? clean : '一句聽起來不像人的話'
}

function base(partial: Omit<SpeechJudgment, 'provider'>): SpeechJudgment {
  return { ...partial, provider: 'offline' }
}

/**
 * 把模型吐出來的 JSON 收成遊戲認得的判斷。收不回來就用離線那份。
 * 模型自己決定懷疑變化，這裡只擋壞掉的數字（例如 999），不乘個性權重。
 * 離線判斷仍夾在 -8 到 16，因為那條路之後還會進公式。
 */
export function normalizeJudgment(raw: unknown, fallback: SpeechJudgment, provider: SpeechJudgment['provider']): SpeechJudgment {
  if (!raw || typeof raw !== 'object') return fallback
  const row = raw as Record<string, unknown>
  const reply = typeof row.reply === 'string' ? row.reply.trim().slice(0, 80) : ''
  if (!reply) return fallback
  const direct = provider === 'ollama' || provider === 'grok'
  const topic = TOPICS.includes(row.topic as Topic) ? (row.topic as Topic) : fallback.topic
  const suspicionRaw = Number(row.suspicion)
  const suspicion = Number.isFinite(suspicionRaw)
    ? Math.max(direct ? -40 : -8, Math.min(direct ? 40 : 16, Math.round(suspicionRaw)))
    : fallback.suspicion
  const humanityRaw = Number(row.humanity)
  const affectionRaw = Number(row.affection)
  const humanity = Number.isFinite(humanityRaw) ? Math.max(-4, Math.min(5, Math.round(humanityRaw))) : 0
  const affection = Number.isFinite(affectionRaw) ? Math.max(-4, Math.min(5, Math.round(affectionRaw))) : 0
  const metaLeak = direct ? row.metaLeak === true : row.metaLeak === true || (topic === 'meta' && suspicion >= 6)
  const note = typeof row.note === 'string' ? row.note.trim().slice(0, 40) : ''
  const remember = typeof row.remember === 'string' ? row.remember.trim().slice(0, 40) : ''
  const ending: EndingId | undefined = row.ending === 'confessed' || fallback.ending === 'confessed' ? 'confessed' : undefined
  return {
    reply,
    suspicion,
    topic,
    metaLeak,
    note: note.length > 0 ? note : undefined,
    remember: remember.length > 0 ? remember : undefined,
    direct: direct || undefined,
    humanity,
    affection,
    ending,
    provider,
  }
}

/**
 * 離線家人。同一句話永遠得到同一個判斷，方便測試，也讓沒有金鑰時玩得下去。
 */
export function judgeOffline(request: SpeechRequest): SpeechJudgment {
  const text = request.playerText.trim()
  const voice = voiceOf(request.speakerId)
  const said = quote(text)
  if (AI_WORD.test(text) && WORLD_WORD.test(text)) {
    return base({
      reply: voice.confess(),
      suspicion: 10,
      topic: 'meta',
      metaLeak: true,
      note: '自己說出兩個秘密',
      humanity: -4,
      affection: -2,
      ending: 'confessed',
    })
  }
  if (META_WORD.test(text)) {
    return base({
      reply: voice.meta(said),
      suspicion: 8,
      topic: 'meta',
      metaLeak: true,
      note: clipNote(text),
      humanity: -3,
      affection: 0,
    })
  }
  const digits = text.match(/\d/g)?.length ?? 0
  if (ROBOT_WORD.test(text) || digits >= 2) {
    const topic: Topic = request.speakerId === 'dad' ? 'memory' : 'routine'
    return base({
      reply: voice.robot(said),
      suspicion: 10,
      topic,
      metaLeak: false,
      note: clipNote(text),
      humanity: -3,
      affection: 0,
    })
  }
  if (text.length <= 2 || FLAT_WORD.test(text)) {
    return base({
      reply: voice.flat(),
      suspicion: 7,
      topic: 'emotion',
      metaLeak: false,
      note: '只回了很短的一句',
      humanity: -1,
      affection: -1,
    })
  }
  if (HUMAN_WORD.test(text)) {
    const topic: Topic = /好吃|餓|鹹|甜|老|香|肚子/.test(text) ? 'sensory' : /哈哈|笨|幼稚|踢|玩笑|糗/.test(text) ? 'play' : 'emotion'
    return base({
      reply: voice.human(said),
      suspicion: -4,
      topic,
      metaLeak: false,
      humanity: 2,
      affection: 2,
    })
  }
  return base({
    reply: voice.neutral(said),
    suspicion: 2,
    topic: 'emotion',
    metaLeak: false,
    humanity: 0,
    affection: 0,
  })
}
