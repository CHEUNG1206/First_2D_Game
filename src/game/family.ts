import type { FamilyMember, GameState, Phase } from './types.ts'

const WEEKDAY_HOME: Record<string, Phase[]> = {
  mom: ['morning', 'evening', 'night'],
  dad: ['evening', 'night'],
  sister: ['afternoon', 'evening', 'night'],
}

/**
 * 家人名冊。權重是這個人會把哪種破綻放大。
 * 作息決定誰聽得見；週日在 engine 的在場判斷裡全體在家。
 */
export function createFamily(): FamilyMember[] {
  return [
    {
      id: 'mom',
      name: '陳淑華',
      role: '媽媽',
      trait: '記得你怎麼吃、幾點回家、哪句話不像你。',
      color: '#e36b8a',
      weights: { routine: 1.35, emotion: 0.9, memory: 1.15, meta: 1.45, sensory: 1.55, play: 0.45 },
      suspicion: 16,
      affection: 48,
      homePhases: WEEKDAY_HOME.mom!,
      notes: [],
      suspicionAtDawn: 16,
      reassuredToday: false,
    },
    {
      id: 'dad',
      name: '陳建國',
      role: '爸爸',
      trait: '話少。你太冷靜的時候，他會開始回想舊事。',
      color: '#3d6ea8',
      weights: { routine: 0.85, emotion: 1.5, memory: 1.35, meta: 1.25, sensory: 0.7, play: 0.4 },
      suspicion: 10,
      affection: 42,
      homePhases: WEEKDAY_HOME.dad!,
      notes: [],
      suspicionAtDawn: 10,
      reassuredToday: false,
    },
    {
      id: 'sister',
      name: '陳小雨',
      role: '妹妹',
      trait: '用玩笑試探。接不住玩笑，比答錯還糟。',
      color: '#e09a12',
      weights: { routine: 0.55, emotion: 1.05, memory: 0.75, meta: 1.6, sensory: 0.65, play: 1.55 },
      suspicion: 22,
      affection: 36,
      homePhases: WEEKDAY_HOME.sister!,
      notes: [],
      suspicionAtDawn: 22,
      reassuredToday: false,
    },
  ]
}

export interface AudienceMember {
  member: FamilyMember
  direct: boolean
}

/** 週日全員在家；出門時只有同行的那位聽得見。 */
export function memberIsPresent(member: FamilyMember, state: GameState): boolean {
  if (state.location !== 'home') return state.companionId === member.id
  if (state.day >= 7) return true
  return member.homePhases.includes(state.phase)
}

/**
 * 發問者一定聽得見（戲把他帶進場）。
 * 其餘家人要當下在場才算旁聽。路人不進這份名單。
 */
export function audienceFor(state: GameState, askerId: string | null): AudienceMember[] {
  if (!askerId) return []
  const asker = state.family.find((member) => member.id === askerId)
  if (!asker) return []
  const others = state.family.filter(
    (member) => member.id !== askerId && memberIsPresent(member, state),
  )
  return [{ member: asker, direct: true }, ...others.map((member) => ({ member, direct: false }))]
}

export function findMember(state: GameState, id: string): FamilyMember | undefined {
  return state.family.find((member) => member.id === id)
}
