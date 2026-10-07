import { asRequest, judgeSpeech } from '../server/family-core.ts'

/** 發佈到網路時使用。只試 Grok，沒有金鑰就用離線判斷。 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 })
  try {
    const speech = asRequest(await request.json())
    if (!speech?.playerText) return Response.json({ error: 'text' }, { status: 400 })
    return Response.json(await judgeSpeech(speech, { local: false }))
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
}
