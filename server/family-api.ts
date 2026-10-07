import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { asNightMembers, asRequest, judgeNight, judgeSpeech } from './family-core.ts'

/**
 * 家人的嘴，掛在開發伺服器上。
 * 順序是本機 Qwen，然後是 xAI 的 Grok，最後是離線判斷。
 * 金鑰只從環境變數讀，不寫進紀錄。
 */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 40_000) {
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

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function handleTalk(req: IncomingMessage, res: ServerResponse) {
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
    send(res, 200, await judgeSpeech(request, { local: true }))
  } catch {
    send(res, 400, { error: 'bad request' })
  }
}

async function handleNight(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method' })
    return
  }
  try {
    const members = asNightMembers(JSON.parse(await readBody(req)) as unknown)
    if (!members) {
      send(res, 400, { error: 'members' })
      return
    }
    send(res, 200, { judgments: await judgeNight(members, { local: true }) })
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
      void handleTalk(req, res)
    })
    middlewares.use('/api/night', (req, res, next) => {
      if (!req.url) {
        next()
        return
      }
      void handleNight(req, res)
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
