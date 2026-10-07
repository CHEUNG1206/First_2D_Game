/** 觀察者在意的破綻。道具 NPC 不使用這些欄位。 */
export type Topic = 'routine' | 'emotion' | 'memory' | 'meta' | 'sensory' | 'play'

export type Phase = 'morning' | 'afternoon' | 'evening' | 'night'

export type LocationId = 'home' | 'store' | 'park' | 'street' | 'office' | 'school'

export type Screen = 'title' | 'intro' | 'play' | 'event' | 'night' | 'ending'

export type EndingId = 'survived' | 'uneasy' | 'exposed' | 'meeting' | 'confessed'

/** 家人今天看見、聽見，或夜裡被轉告的一件事。 */
export interface MemoryItem {
  day: number
  kind: 'heard' | 'saw' | 'said' | 'told'
  text: string
}

/**
 * 會學習的家人。
 * core 是寫好的設定，永遠不刪。learned 是模型決定留下的事。today 是今天的見聞，夜裡整理完就清掉。
 */
export interface FamilyMember {
  id: string
  name: string
  role: string
  trait: string
  color: string
  suspicion: number
  affection: number
  /** 週一到週六在家的時段。週日由在場判斷另外處理。 */
  homePhases: Phase[]
  core: string[]
  learned: MemoryItem[]
  today: MemoryItem[]
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
  /** talk 用鍵盤。confess 用按鈕，不進模型。 */
  kind: 'talk' | 'confess'
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
  /** 夜裡模型為每個人寫好的下一句開場。說出口之後清掉。 */
  openers: Record<string, string>
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
  /** 在場的家人會把這句話記進今天的見聞。懷疑留給模型。 */
  seen?: string
  /** 有指定時，只有這位在場的家人看見。 */
  targetId?: string
  /** 出門這個動作本身被家裡的人看見。 */
  observedAt?: 'home' | 'destination'
  /** 人已經站在現場。不要把邏輯位置再搬去別的建築。 */
  keepLocation?: boolean
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

export interface SpeechTurn {
  role: 'family' | 'player'
  text: string
}

/** 站在旁邊、也要自己聽的家人。 */
export interface MemoryListener {
  id: string
  name: string
  role: string
  trait: string
  suspicion: number
  core: string[]
  learned: string[]
  today: string[]
}

/** 模型聽完之後，給這個人的懷疑變化和要留下的長期記憶。 */
export interface HeardJudgment {
  id: string
  suspicion: number
  remember?: string
}

/** 送給家人模型的這一輪。提示詞只描述處境，回答由玩家自己打。 */
export interface SpeechRequest {
  speakerId: string
  speakerName: string
  role: string
  trait: string
  prompt: string
  playerText: string
  history: SpeechTurn[]
  suspicion: number
  core: string[]
  /** 已經挑過、跟這句話有關的學到的記憶。 */
  learned: string[]
  today: string[]
  others?: MemoryListener[]
  day: number
}

/**
 * 家人聽完一句話之後的判斷。
 * direct 為真時，suspicion 是模型自己決定的變化，程式不再乘權重。
 */
export interface SpeechJudgment {
  reply: string
  suspicion: number
  topic: Topic
  metaLeak: boolean
  note?: string
  remember?: string
  heard?: string
  heardBy?: HeardJudgment[]
  /** 這份分數來自模型對記憶的判斷，不進公式。 */
  direct?: boolean
  humanity: number
  affection: number
  ending?: EndingId
  provider: 'ollama' | 'grok' | 'offline'
}

/** 送給夜談的一位家人。 */
export interface NightRequest {
  id: string
  name: string
  role: string
  trait: string
  suspicion: number
  day: number
  core: string[]
  learned: string[]
  today: MemoryItem[]
  others: { id: string; name: string; role: string }[]
}

/** 模型把一天整理完之後的決定。suspicion 是變化量。 */
export interface NightJudgment {
  id: string
  suspicion: number
  learned: string[]
  tellTo?: string
  tellLine?: string
  opener?: string
  provider: 'ollama' | 'grok' | 'offline'
}
