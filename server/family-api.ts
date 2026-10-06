import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { judgeOffline, normalizeJudgment } from '../src/game/judge.ts'
import type { SpeechJudgment, SpeechRequest, SpeechTurn } from '../src/game/types.ts'

/**
 * 家人的嘴。
 * 順序是本機 Ollama 的 Qwen，然後是 xAI 的 Grok，最後是離線判斷。
 * 金鑰只從環境變數讀，不寫進紀錄。
 */

const TOPICS = new Set(['routine', 'emotion', 'memory', 'meta', 'sensory', 'play'])

function systemPrompt(request: SpeechRequest): string {
  const notes = request.notes.length > 0 ? request.notes.join('；') : '今天還沒有筆記'
  return [
    `你是遊戲裡的家人，不是助手。你是${request.speakerName}，家裡叫你${request.role}。`,
    `性格：${request.trait}`,
    '你不知道世界是假的，也不知道對方可能是人工智慧。你只是這個人的家人。',
    `眼前的處境：${request.prompt}`,
    `你記得的筆記：${notes}`,
    `今天是第${request.day}天。你目前的不安是 ${request.suspicion}（0 到 100）。`,
    '聽對方用鍵盤打的話。太完美、太冷、像在唸說明書或系統狀態，你會不安。',
    '提到人工智慧、虛擬、渲染、循環、程式、場景、系統，你會很不安，topic 用 meta，metaLeak 設 true。',
    '如果對方同時承認自己是人工智慧，而且這個世界是虛擬的，ending 設 "confessed"。',
    '會餓、會嫌、會糗、會玩笑、會講錯，你會放心，suspicion 用負數。',
    'suspicion 是整數，大約 -8 到 16，這是還沒乘上個性權重的基礎分。',
    '用繁體中文回一句短話，像這個人會說的，可以引用對方的詞。不要解釋規則，不要列選項。',
    '只回 JSON：{"reply":"","suspicion":0,"topic":"emotion","metaLeak":false,"note":"","humanity":0,"affection":0}',
    'topic 只能是 routine, emotion, memory, meta, sensory, play。',
    'note 是要寫進筆記的一句話。suspicion 小於或等於 0 時 note 留空字串。',
    'humanity 與 affection 是 -4 到 5 的整數。',
  ].join('\n')
}

function messages(request: SpeechRequest): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const history = request.history.slice(-8).flatMap((turn: SpeechTurn) => {
    const content = turn.text.slice(0, 200)
    if (!content) return []
    return [{ role: turn.role === 'player' ? ('user' as const) : ('assistant' as const), content }]
  })
  return [
    { role: 'system', content: systemPrompt(request) },
    ...history,
    { role: 'user', content: request.playerText.slice(0, 200) },
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
    day: Number.isFinite(Number(row.day)) ? Number(row.day) : 1,
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

async function askOllama(request: SpeechRequest): Promise<SpeechJudgment | null> {
  const base = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
  const response = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, format: 'json', messages: messages(request) }),
    signal: AbortSignal.timeout(12_000),
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
      messages: messages(request),
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) return null
  return normalizeJudgment(extractJson(content), judgeOffline(request), 'grok')
}

async function replyAsFamily(request: SpeechRequest): Promise<SpeechJudgment> {
  try {
    const local = await askOllama(request)
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
