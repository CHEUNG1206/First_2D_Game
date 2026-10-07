import type { FamilyMember, GameState, LocationId, Phase } from './types.ts'

const WEEKDAY_HOME: Record<string, Phase[]> = {
  mom: ['evening', 'night'],
  dad: ['evening', 'night'],
  sister: ['afternoon', 'evening', 'night'],
}

/**
 * 家人名冊。
 * core 是這個人本來就知道的事，模型學到的新句子另放，不會把這幾句擠掉。
 * 作息決定誰聽得見。週日由在場判斷另外處理，全員留在三樓。
 */
export function createFamily(): FamilyMember[] {
  return [
    {
      id: 'mom',
      name: '陳淑華',
      role: '媽媽',
      trait: '記得你怎麼吃、幾點回家、哪句話不像你。',
      color: '#e36b8a',
      suspicion: 16,
      affection: 48,
      homePhases: WEEKDAY_HOME.mom!,
      core: ['你吃早餐會嫌蛋，而且嫌得很具體。', '你進門會先把鞋子踢歪。'],
      learned: [],
      today: [],
      suspicionAtDawn: 16,
      reassuredToday: false,
    },
    {
      id: 'dad',
      name: '陳建國',
      role: '爸爸',
      trait: '話少。你太冷靜的時候，他會開始回想舊事。',
      color: '#3d6ea8',
      suspicion: 10,
      affection: 42,
      homePhases: WEEKDAY_HOME.dad!,
      core: ['校慶那天你哭了，原因你自己也講不齊。', '你太冷靜的時候，通常是在躲。'],
      learned: [],
      today: [],
      suspicionAtDawn: 10,
      reassuredToday: false,
    },
    {
      id: 'sister',
      name: '陳小雨',
      role: '妹妹',
      trait: '用玩笑試探。接不住玩笑，比答錯還糟。',
      color: '#e09a12',
      suspicion: 22,
      affection: 36,
      homePhases: WEEKDAY_HOME.sister!,
      core: ['你會跟我搶話，也會嫌電視的爛結局。', '你接得住玩笑的時候，才像我哥。'],
      learned: [],
      today: [],
      suspicionAtDawn: 22,
      reassuredToday: false,
    },
  ]
}

export interface AudienceMember {
  member: FamilyMember
  direct: boolean
}

/**
 * 這個人現在人在哪個區域。
 * 週日全部留在三樓住家。平日媽媽守一樓大堂，爸爸在二樓帳房，妹妹上午在書塾。
 * 傍晚之後都回到三樓。
 */
export function memberZone(member: FamilyMember, state: GameState): LocationId {
  if (state.day >= 7) return 'home'
  if (member.homePhases.includes(state.phase)) return 'home'
  if (member.id === 'dad') return 'office'
  if (member.id === 'sister') return 'school'
  return 'store'
}

/** 跟你站在同一區，或你把人拉出來同行，才算聽得見。 */
export function memberIsPresent(member: FamilyMember, state: GameState): boolean {
  if (state.companionId === member.id) return true
  return memberZone(member, state) === state.location
}

/**
 * 發問者一定聽得見（戲把他帶進場）。
 * 其餘家人要當下在場才算旁聽。路人不進這份名單。
 */
export function audienceFor(state: GameState, askerId: string | null): AudienceMember[] {
  if (!askerId) return []
  const asker = state.family.find((member) => member.id === askerId)
  if (!asker) return []
  const others = state.family.filter((member) => member.id !== askerId && memberIsPresent(member, state))
  return [{ member: asker, direct: true }, ...others.map((member) => ({ member, direct: false }))]
}

export function findMember(state: GameState, id: string): FamilyMember | undefined {
  return state.family.find((member) => member.id === id)
}
