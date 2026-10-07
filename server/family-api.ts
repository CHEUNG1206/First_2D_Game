import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { judgeOffline, normalizeJudgment } from '../src/game/judge.ts'
import type { HeardJudgment, MemoryListener, SpeechJudgment, SpeechRequest, SpeechTurn } from '../src/game/types.ts'

/**
 * 家人的嘴。
 * 順序是本機 Ollama 的 Qwen，然後是 xAI 的 Grok，最後是離線判斷。
 * 金鑰只從環境變數讀，不寫進紀錄。
 */

const TOPICS = new Set(['routine', 'emotion', 'memory', 'meta', 'sensory', 'play'])

function memoryBlock(label: string, lines: string[] | undefined): string {
  const items = (lines ?? []).map((line) => line.trim()).filter((line) => line.length > 0)
  if (items.length === 0) return `${label}：沒有`
  return `${label}：\n${items.map((line) => `- ${line}`).join('\n')}`
}

/**
 * 懷疑變化由模型自己比對記憶後決定。
 * 提示詞只說明這個人是誰、記得什麼，不給公式、不給權重。
 */
function systemPrompt(request: SpeechRequest, overheard: boolean): string {
  const who = overheard
    ? `你站在旁邊聽。你是${request.speakerName}，家裡叫你${request.role}。這句話不是對你說的，你還是用自己的記憶來聽。`
    : `你是遊戲裡的家人，不是助手。你是${request.speakerName}，家裡叫你${request.role}。`
  const notes = request.notes.length > 0 ? request.notes.join('；') : '今天還沒有筆記'
  return [
    who,
    `性格：${request.trait}`,
    '你不知道世界是假的，也不知道對方可能是人工智慧。你只是這個人的家人。',
    `眼前的處境：${request.prompt}`,
    memoryBlock('長期記憶', request.longTerm),
    memoryBlock('短期記憶', request.shortTerm),
    `今天的筆記：${notes}`,
    `今天是第${request.day}天。你目前的不安是 ${request.suspicion}（0 到 100）。`,
    '把這句話跟長期記憶、短期記憶放在一起比。suspicion 是這一輪的變化量，不是新的總分。',
    '跟你記得的這個人吻合，或會餓、會嫌、會糗、會玩笑、會講錯，不安就下降，用負整數。',
    '跟記憶矛盾、太冷、太完美、像在唸說明書，不安就上升，用正整數。',
    '長期記憶沒提過的新事，可以上升一點，也可以先寫進 remember。',
    '提到人工智慧、虛擬、渲染、循環、程式、場景、系統，不安要明顯上升，topic 用 meta，metaLeak 設 true。',
    '如果對方同時承認自己是人工智慧，而且這個世界是虛擬的，ending 設 "confessed"。',
    'remember 是要留下的一句長期記憶。沒有新的就留空字串。',
    'reply 是你說給對方聽的一句話。不要扮演對方，不要用對方的稱呼叫自己。',
    '用繁體中文，像這個人會說的，可以引用對方的詞。不要解釋你怎麼比較，不要列選項。',
    '例子：對方說「你踢我那下超痛」。你是妹妹，長期記憶寫過他接得住玩笑。reply 可以是「還是這麼幼稚。」suspicion 用負數。',
    '只回 JSON：{"reply":"","suspicion":0,"topic":"emotion","metaLeak":false,"note":"","remember":"","humanity":0,"affection":0,"ending":""}',
    'topic 只能是 routine, emotion, memory, meta, sensory, play。',
    'note 是今天要記得的一句話。suspicion 小於或等於 0 時 note 留空字串。',
    'humanity：這句話像會生活的人就用正整數，像說明書就用負整數。',
    'affection：你聽了更親近就用正整數，更想退開就用負整數。兩者都是 -4 到 5。',
    'ending 沒有就留空字串。',
  ].join('\n')
}

function messages(request: SpeechRequest, overheard: boolean): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const history = overheard
    ? []
    : request.history.slice(-8).flatMap((turn: SpeechTurn) => {
        const content = turn.text.slice(0, 200)
        if (!content) return []
        return [{ role: turn.role === 'player' ? ('user' as const) : ('assistant' as const), content }]
      })
  const heard = overheard ? `你聽見這句話：${request.playerText.slice(0, 200)}` : request.playerText.slice(0, 200)
  return [
    { role: 'system', content: systemPrompt(request, overheard) },
    ...history,
    { role: 'user', content: heard },
  ]
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 20_000) {
        reject(new Error('body'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function asRequest(raw: unknown): SpeechRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.playerText !== 'string' || typeof row.speakerId !== 'string') return null
  const history = Array.isArray(row.history)
    ? row.history
        .filter((turn): turn is SpeechTurn => {
          if (!turn || typeof turn !== 'object') return false
          const item = turn as Record<string, unknown>
          return (item.role === 'family' || item.role === 'player') && typeof item.text === 'string'
        })
        .slice(-8)
    : []
  const notes = Array.isArray(row.notes) ? row.notes.filter((note): note is string => typeof note === 'string').slice(-4) : []
  const others = Array.isArray(row.others)
    ? row.others.map(asListener).filter((item): item is MemoryListener => item !== null).slice(0, 2)
    : []
  return {
    speakerId: row.speakerId,
    speakerName: typeof row.speakerName === 'string' ? row.speakerName : '家人',
    role: typeof row.role === 'string' ? row.role : '家人',
    trait: typeof row.trait === 'string' ? row.trait : '',
    prompt: typeof row.prompt === 'string' ? row.prompt : '',
    playerText: row.playerText.trim().slice(0, 200),
    history,
    suspicion: Number.isFinite(Number(row.suspicion)) ? Number(row.suspicion) : 0,
    notes,
    longTerm: asLines(row.longTerm, 8),
    shortTerm: asLines(row.shortTerm, 8),
    others,
    day: Number.isFinite(Number(row.day)) ? Number(row.day) : 1,
  }
}

function asLines(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim().slice(0, 80))
    .filter((line) => line.length > 0)
    .slice(-cap)
}

function asListener(value: unknown): MemoryListener | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null
  return {
    id: row.id,
    name: row.name,
    role: typeof row.role === 'string' ? row.role : '家人',
    trait: typeof row.trait === 'string' ? row.trait : '',
    suspicion: Number.isFinite(Number(row.suspicion)) ? Number(row.suspicion) : 0,
    longTerm: asLines(row.longTerm, 8),
    shortTerm: asLines(row.shortTerm, 8),
  }
}

/** 旁聽者用自己的記憶聽同一句話，不繼承發問者的對話紀錄。 */
function listenerRequest(speaker: SpeechRequest, other: MemoryListener): SpeechRequest {
  return {
    ...speaker,
    speakerId: other.id,
    speakerName: other.name,
    role: other.role,
    trait: other.trait,
    suspicion: other.suspicion,
    notes: [],
    longTerm: other.longTerm,
    shortTerm: other.shortTerm,
    others: [],
    history: [],
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no json')
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  if (typeof parsed.topic === 'string' && !TOPICS.has(parsed.topic)) parsed.topic = 'emotion'
  return parsed
}

async function askOllama(request: SpeechRequest, overheard: boolean): Promise<SpeechJudgment | null> {
  const base = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
  // 旁聽排在發問者後面。本機一次只跑一個，多留一點時間才不會被前面的人卡住。
  const response = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, format: 'json', messages: messages(request, overheard) }),
    signal: AbortSignal.timeout(overheard ? 20_000 : 12_000),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { message?: { content?: string } }
  const content = data.message?.content
  if (!content) return null
  return normalizeJudgment(extractJson(content), judgeOffline(request), 'ollama')
}

async function askGrok(request: SpeechRequest): Promise<SpeechJudgment | null> {
  const key = process.env.XAI_API_KEY || process.env.GROK_API_KEY
  if (!key) return null
  const model = process.env.GROK_MODEL || 'grok-3'
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: messages(request, false),
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) return null
  return normalizeJudgment(extractJson(content), judgeOffline(request), 'grok')
}

async function askSpeaker(request: SpeechRequest): Promise<SpeechJudgment> {
  try {
    const local = await askOllama(request, false)
    if (local) return local
  } catch {
    // 本機模型沒開，換下一條。
  }
  try {
    const remote = await askGrok(request)
    if (remote) return remote
  } catch {
    // 遠端沒有金鑰或這次失敗，改用離線判斷。
  }
  return judgeOffline(request)
}

async function askListener(request: SpeechRequest, other: MemoryListener): Promise<HeardJudgment | null> {
  try {
    const judged = await askOllama(listenerRequest(request, other), true)
    if (!judged?.direct) return null
    return { id: other.id, suspicion: judged.suspicion, remember: judged.remember }
  } catch {
    return null
  }
}

/**
 * 先問正在說話的人，問到了再讓在場的家人各自用自己的記憶聽。
 * 旁聽失敗不丟掉發問者的回答。離線判斷沒有 direct，引擎會改走公式。
 */
async function replyAsFamily(request: SpeechRequest): Promise<SpeechJudgment> {
  const speaker = await askSpeaker(request)
  if (speaker.provider !== 'ollama' || !speaker.direct) return speaker
  const listeners = request.others ?? []
  if (listeners.length === 0) return speaker
  const heardBy = (await Promise.all(listeners.map((other) => askListener(request, other)))).filter(
    (item): item is HeardJudgment => item !== null,
  )
  return heardBy.length > 0 ? { ...speaker, heardBy } : speaker
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method' })
    return
  }
  try {
    const request = asRequest(JSON.parse(await readBody(req)) as unknown)
    if (!request || !request.playerText) {
      send(res, 400, { error: 'text' })
      return
    }
    const judgment = await replyAsFamily(request)
    send(res, 200, judgment)
  } catch {
    send(res, 400, { error: 'bad request' })
  }
}

/** 掛在開發伺服器與 preview 上，遊戲本體不直接持有金鑰。 */
export function familyApi(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use('/api/talk', (req, res, next) => {
      if (!req.url) {
        next()
        return
      }
      void handle(req, res)
    })
  }
  return {
    name: 'family-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
