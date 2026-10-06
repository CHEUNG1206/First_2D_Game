/** 觀察者在意的破綻。道具 NPC 不使用這些欄位。 */
export type Topic = 'routine' | 'emotion' | 'memory' | 'meta' | 'sensory' | 'play'

export type Phase = 'morning' | 'afternoon' | 'evening' | 'night'

export type LocationId = 'home' | 'store' | 'park' | 'street' | 'office' | 'school'

export type Screen = 'title' | 'intro' | 'play' | 'event' | 'night' | 'ending'

export type EndingId = 'survived' | 'uneasy' | 'exposed' | 'meeting' | 'confessed'

export interface MemoryNote {
  day: number
  topic: Topic
  text: string
}

/** 會學習的家人。懷疑、筆記、權重都只存在這裡。 */
export interface FamilyMember {
  id: string
  name: string
  role: string
  trait: string
  color: string
  weights: Record<Topic, number>
  suspicion: number
  affection: number
  /** 週一到週六在家的時段。週日由在場判斷另外處理。 */
  homePhases: Phase[]
  notes: MemoryNote[]
  suspicionAtDawn: number
  reassuredToday: boolean
}

/** 不會學習的路人。故意沒有懷疑與筆記。 */
export interface ScriptedNpc {
  id: string
  name: string
  role: string
  location: LocationId
  lines: string[]
  lineIndex: number
  glitching: boolean
}

export interface DeltaLine {
  label: string
  value: number
}

export interface Banner {
  title: string
  text: string
  deltas: DeltaLine[]
}

export interface EventChoice {
  id: string
  text: string
  result: string
  /** 乘上發問者權重之前的帶符號基礎值。負數是安撫。 */
  suspicion: number
  topic: Topic
  /** 說出系統、循環、虛擬世界。這一段不加緩衝。 */
  metaLeak?: boolean
  humanity?: number
  familiarity?: number
  affection?: number
  pocket?: number
  energy?: number
  note?: string
  ending?: EndingId
}

export interface GameEvent {
  id: string
  title: string
  consumesPhase: boolean
  askerId: string | null
  speakerId: string
  speakerName: string
  speakerRole: string
  badge: string
  prompt: string
  inner: string
  choices: EventChoice[]
}

export interface NightLine {
  speaker: string
  text: string
}

export interface NightReport {
  lines: NightLine[]
  deltas: DeltaLine[]
  ending: EndingId | null
}

export interface LogEntry {
  day: number
  phase: Phase
  text: string
}

export interface GameState {
  screen: Screen
  introStep: number
  day: number
  maxDays: number
  phase: Phase
  energy: number
  pocket: number
  humanity: number
  familiarity: number
  family: FamilyMember[]
  npcs: ScriptedNpc[]
  location: LocationId
  companionId: string | null
  log: LogEntry[]
  flags: Record<string, boolean>
  seenEvents: string[]
  pendingEvent: GameEvent | null
  eventAdvances: boolean
  banner: Banner | null
  night: NightReport | null
  ending: EndingId | null
  endingBlurb: string
}

export interface PlayerAction {
  id: string
  label: string
  detail: string
  phases: Phase[]
  location: LocationId
  /** 負數消耗，正數回復。 */
  energy: number
  pocket?: number
  humanity?: number
  familiarity?: number
  affection?: Partial<Record<string, number>>
  affectionAll?: number
  suspicion?: { amount: number; topic: Topic; note?: string }
  /** 有指定時，只有這位在場的家人吃到懷疑變化。 */
  targetId?: string
  /** 出門這個動作本身被家裡的人看見。 */
  observedAt?: 'home' | 'destination'
  companionId?: string
  requiresPresent?: string
  requiresFlag?: string
  absentFlag?: string
  minPocket?: number
  /** 超過就隱藏，例如硬撐只在體力很低時出現。 */
  maxEnergy?: number
  setFlags?: string[]
  clearFlags?: string[]
  confess?: boolean
  result: string | ((state: GameState) => string)
}

export interface ActionOffer {
  id: string
  label: string
  detail: string
  enabled: boolean
  reason: string | null
  hidden: boolean
}
