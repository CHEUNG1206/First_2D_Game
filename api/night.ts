import { asNightMembers, judgeNight } from '../server/family-core.ts'

/** 發佈到網路時的夜談。只試 Grok，沒有金鑰就用離線判斷。 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 })
  try {
    const members = asNightMembers(await request.json())
    if (!members) return Response.json({ error: 'members' }, { status: 400 })
    return Response.json({ judgments: await judgeNight(members, { local: false }) })
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
}
