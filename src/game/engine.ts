import { actionById, ACTIONS } from './actions.ts'
import { createFamily, findMember, memberIsPresent } from './family.ts'
import { clamp, EXPOSED_AT, MEETING_AT, MEETING_COUNT, UNEASY_AT } from './formula.ts'
import { nightOffline } from './judge.ts'
import { gameLog } from './logger.ts'
import { perceive, remember } from './memory.ts'
import { createNpcs, cycleNpc } from './npcs.ts'
import { CONFESS_EVENT, idleTalk, openerEvent, pickStory, storyFor, storiesNow } from './events.ts'
import type {
  ActionOffer,
  Banner,
  DeltaLine,
  EndingId,
  EventChoice,
  FamilyMember,
  GameState,
  MemoryItem,
  NightJudgment,
  NightRequest,
  Phase,
  PlayerAction,
  SpeechJudgment,
} from './types.ts'

/**
 * 白天不換時段。走路、吃飯、說話都留在同一天，同一件事一天只算一次。
 * 只有睡覺才進入夜裡：漂移、傳筆記。
 * 路人只在拜訪時把台詞往下播，不進這兩個步驟。
 */

const PHASE_ORDER: Phase[] = ['morning', 'afternoon', 'evening', 'night']

export const PHASE_LABEL: Record<Phase, string> = {
  morning: '白天',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜裡',
}

const WEEKDAY = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

export function dayLabel(day: number): string {
  return WEEKDAY[(day - 1) % 7] ?? ''
}

export function createInitialState(): GameState {
  return {
    screen: 'title',
    introStep: 0,
    day: 1,
    maxDays: 7,
    phase: 'morning',
    energy: 80,
    pocket: 50,
    humanity: 16,
    familiarity: 6,
    family: createFamily(),
    npcs: createNpcs(),
    location: 'home',
    companionId: null,
    log: [],
    flags: {},
    seenEvents: [],
    openers: {},
    pendingEvent: null,
    eventAdvances: false,
    banner: null,
    night: null,
    ending: null,
    endingBlurb: '',
  }
}

export function beginWeek(state: GameState): GameState {
  gameLog.info('觀察週開始')
  return beginPhase({
    ...state,
    screen: 'play',
    day: 1,
    phase: 'morning',
    introStep: 0,
  })
}

function usedToday(state: GameState, id: string): boolean {
  return !!state.flags[`did_${id}_d${state.day}`]
}

export function availableActions(state: GameState): ActionOffer[] {
  return ACTIONS.filter((action) => action.phases.includes(state.phase)).map((action) => {
    if (usedToday(state, action.id)) return offer(action, false, null, true)
    if (action.maxEnergy != null && state.energy > action.maxEnergy) {
      return offer(action, false, null, true)
    }
    if (action.absentFlag && state.flags[action.absentFlag]) {
      return offer(action, false, null, true)
    }
    if (action.requiresFlag && !state.flags[action.requiresFlag]) {
      return offer(action, false, null, true)
    }
    if (action.requiresPresent && !presentNow(state, action.requiresPresent)) {
      const who = findMember(state, action.requiresPresent)
      return offer(action, false, `${who?.role ?? '家人'}不在`, false)
    }
    if (action.minPocket != null && state.pocket < action.minPocket) {
      return offer(action, false, '零用錢不夠', false)
    }
    if (action.energy < 0 && state.energy + action.energy < 0) {
      return offer(action, false, '體力不夠', false)
    }
    return offer(action, true, null, false)
  })
}

function offer(action: PlayerAction, enabled: boolean, reason: string | null, hidden: boolean): ActionOffer {
  return {
    id: action.id,
    label: action.label,
    detail: action.detail,
    enabled,
    reason,
    hidden,
  }
}

/** 按鈕要這個人就在你身邊，而不是預設坐在客廳。 */
function presentNow(state: GameState, id: string): boolean {
  const member = findMember(state, id)
  if (!member) return false
  return memberIsPresent(member, { ...state, companionId: null })
}

export function chooseAction(state: GameState, actionId: string): GameState {
  if (state.screen !== 'play') return state
  const visible = availableActions(state).find((action) => action.id === actionId)
  if (!visible?.enabled) return state
  const action = actionById(actionId)
  if (!action) return state
  if (action.confess) {
    gameLog.info(`第${state.day}天 ${PHASE_LABEL[state.phase]} 打開自白`)
    return {
      ...state,
      screen: 'event',
      pendingEvent: CONFESS_EVENT,
      eventAdvances: false,
    }
  }
  const next = applyAction(state, action)
  if (next.ending) return { ...next, screen: 'ending', pendingEvent: null }
  if (action.id === 'close_shop') return advanceTo(next, 'evening')
  if (action.id === 'sleep') {
    gameLog.info(`第${state.day}天去睡覺`)
    return settleNight(next, offlineNights(next))
  }
  return next
}

/** 套用睡覺的體力變化，不進入夜談。畫面要先問模型時用這個。 */
export function prepareSleep(state: GameState): GameState | null {
  if (state.screen !== 'play') return null
  const visible = availableActions(state).find((action) => action.id === 'sleep')
  if (!visible?.enabled) return null
  const action = actionById('sleep')
  if (!action) return null
  return applyAction(state, action)
}

export function advanceTo(state: GameState, phase: Phase): GameState {
  if (state.ending) return { ...state, screen: 'ending' }
  gameLog.info(`時段推進到${PHASE_LABEL[phase]}`)
  return beginPhase({ ...state, phase })
}

export function chooseChoice(state: GameState, choiceId: string): GameState {
  if (state.screen !== 'event' || !state.pendingEvent) return state
  const choice = state.pendingEvent.choices.find((item) => item.id === choiceId)
  if (!choice) return state
  const advances = state.eventAdvances
  const next = applyChoice(state, choice)
  if (next.ending) {
    gameLog.warn(`結局 ${next.ending}`)
    return { ...next, screen: 'ending', pendingEvent: null }
  }
  if (advances) return advancePhase({ ...next, pendingEvent: null, screen: 'play' })
  return { ...next, pendingEvent: null, screen: 'play' }
}

export function acknowledgeNight(state: GameState): GameState {
  if (state.screen !== 'night' || !state.night) return state
  if (state.night.ending) {
    gameLog.warn(`夜間結算進入結局 ${state.night.ending}`)
    return {
      ...state,
      screen: 'ending',
      ending: state.night.ending,
      endingBlurb: endingCopy(state.night.ending, state.family),
    }
  }
  const family = state.family.map((member) => ({
    ...member,
    suspicionAtDawn: member.suspicion,
    reassuredToday: false,
  }))
  gameLog.info(`進入第${state.day + 1}天`)
  return beginPhase({
    ...state,
    day: state.day + 1,
    phase: 'morning',
    family,
    night: null,
    banner: null,
    location: 'home',
    companionId: null,
  })
}

export function advancePhase(state: GameState): GameState {
  if (state.ending) return { ...state, screen: 'ending' }
  if (state.phase === 'night') return settleNight(state, offlineNights(state))
  const phase = PHASE_ORDER[PHASE_ORDER.indexOf(state.phase) + 1]
  if (!phase) return settleNight(state, offlineNights(state))
  return beginPhase({ ...state, phase })
}

export function beginPhase(state: GameState): GameState {
  let next: GameState = {
    ...state,
    companionId: null,
    screen: 'play',
    pendingEvent: null,
  }
  if (next.phase === 'morning') next = grantAllowance(next)
  const story = pickStory(next)
  gameLog.info(
    story
      ? `第${next.day}天 ${PHASE_LABEL[next.phase]} ${story.speakerRole}在等你走過去`
      : `第${next.day}天 ${PHASE_LABEL[next.phase]} 自由行動`,
  )
  return next
}

/** 這個時段有人想跟你說話。人還在原地，對話不會自動彈出。 */
export function dueStory(state: GameState) {
  if (state.screen !== 'play') return null
  return pickStory(state)
}

/** 走到那個人旁邊再開口。有劇情就進劇情，沒有就閒聊。時間不往前走。說出口之前不算看過。 */
export function talkTo(state: GameState, actorId: string): GameState {
  if (state.screen !== 'play') return state
  const member = findMember(state, actorId)
  const opener = state.openers[actorId]
  if (member && opener) {
    gameLog.info(`走上前，聽 ${actorId} 夜裡想好的問題`)
    return {
      ...state,
      screen: 'event',
      pendingEvent: openerEvent(member, state.day, opener),
      eventAdvances: false,
    }
  }
  const story = storyFor(state, actorId)
  if (story) {
    gameLog.info(`走上前跟 ${actorId} 說話：${story.id}`)
    return {
      ...state,
      screen: 'event',
      pendingEvent: story,
      eventAdvances: false,
    }
  }
  if (!member) return state
  gameLog.info(`跟 ${actorId} 閒聊`)
  return {
    ...state,
    screen: 'event',
    pendingEvent: idleTalk(member, state.day),
    eventAdvances: false,
  }
}

/** 玩家打完的一句話。懷疑值照模型給的整數加上，離線判斷也是。 */
export function applySpeech(state: GameState, spoken: SpeechJudgment): GameState {
  if (state.screen !== 'event' || !state.pendingEvent) return state
  const marked = markSpoken(state)
  return finishSpeech(marked, applyModelSpeech(marked, spoken))
}

/** 第一句說出口才算看過這題。先去忙不會把題目吃掉。開場白用過就清。 */
function markSpoken(state: GameState): GameState {
  const event = state.pendingEvent
  if (!event) return state
  let next = state
  const counted = !event.id.startsWith('chat_') && !event.id.startsWith('opener_')
  if (counted && !next.seenEvents.includes(event.id)) {
    next = { ...next, seenEvents: [...next.seenEvents, event.id] }
  }
  if (event.askerId && next.openers[event.askerId]) {
    const openers = { ...next.openers }
    delete openers[event.askerId]
    next = { ...next, openers }
  }
  return next
}

function finishSpeech(state: GameState, next: GameState): GameState {
  if (next.ending) {
    gameLog.warn(`結局 ${next.ending}`)
    return { ...next, screen: 'ending', pendingEvent: null }
  }
  return { ...next, screen: 'event', pendingEvent: state.pendingEvent }
}

/** 模型給的是變化量本身。40 只是擋壞掉的 JSON，不是個性權重。 */
const MODEL_DELTA_CAP = 40

function applyModelSpeech(state: GameState, spoken: SpeechJudgment): GameState {
  const event = state.pendingEvent
  if (!event) return state
  const heard = clipMemory(spoken.heard ?? '')
  const reply = clipMemory(spoken.reply)
  let family = copyFamily(state.family)
  const deltas: DeltaLine[] = []

  if (event.askerId) {
    const asker = family.find((member) => member.id === event.askerId)
    if (asker) {
      const delta = clampDelta(spoken.suspicion)
      family = mapMember(family, asker.id, (member) => {
        let next = shiftSuspicion(member, delta)
        if (spoken.remember) {
          next = { ...next, learned: remember(next.learned, { day: state.day, kind: 'said', text: spoken.remember }) }
        }
        if (heard) next = { ...next, today: perceive(next.today, { day: state.day, kind: 'heard', text: `你說：${heard}` }) }
        if (reply) next = { ...next, today: perceive(next.today, { day: state.day, kind: 'said', text: `我回：${reply}` }) }
        if (spoken.affection) next = { ...next, affection: clamp(next.affection + spoken.affection, 0, 100) }
        return next
      })
      deltas.push({ label: `${asker.role} 懷疑`, value: delta })
      if (spoken.affection) deltas.push({ label: `${asker.role} 親近`, value: spoken.affection })
      gameLog.info(`模型判斷 ${asker.id} 懷疑 ${delta}`)
    }

    for (const heardJudgment of spoken.heardBy ?? []) {
      if (heardJudgment.id === event.askerId) continue
      const who = family.find((member) => member.id === heardJudgment.id)
      if (!who) continue
      const delta = clampDelta(heardJudgment.suspicion)
      family = mapMember(family, who.id, (member) => {
        let next = shiftSuspicion(member, delta)
        if (heardJudgment.remember) {
          next = { ...next, learned: remember(next.learned, { day: state.day, kind: 'heard', text: heardJudgment.remember }) }
        }
        if (heard) next = { ...next, today: perceive(next.today, { day: state.day, kind: 'heard', text: `旁聽你說：${heard}` }) }
        return next
      })
      deltas.push({ label: `${who.role} 旁聽`, value: delta })
      gameLog.info(`模型旁聽 ${who.id} 懷疑 ${delta}`)
    }
  }

  const humanity = clamp(state.humanity + spoken.humanity, 0, 100)
  if (spoken.humanity) deltas.push({ label: '人味', value: spoken.humanity })

  let ending: EndingId | null = spoken.ending ?? null
  if (!ending && family.some((member) => member.suspicion >= EXPOSED_AT)) ending = 'exposed'
  logSuspicion(family)
  return {
    ...state,
    family,
    humanity,
    banner: { title: event.title, text: spoken.reply, deltas },
    log: pushLog(state, spoken.reply),
    ending,
    endingBlurb: ending ? endingCopy(ending, family) : state.endingBlurb,
  }
}

function clampDelta(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return clamp(Math.round(amount), -MODEL_DELTA_CAP, MODEL_DELTA_CAP)
}

function clipMemory(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function copyFamily(family: FamilyMember[]): FamilyMember[] {
  return family.map((member) => ({
    ...member,
    core: [...member.core],
    learned: [...member.learned],
    today: [...member.today],
  }))
}

/** 先去忙。不推進時間。 */
export function leaveTalk(state: GameState): GameState {
  if (state.screen !== 'event') return state
  gameLog.info('離開對話')
  return { ...state, screen: 'play', pendingEvent: null, eventAdvances: false }
}

/** 頭上該亮驚嘆號的人。 */
export function waitingAskers(state: GameState): string[] {
  if (state.screen !== 'play') return []
  const ids = storiesNow(state)
    .map((story) => story.askerId)
    .filter((id): id is string => !!id)
  for (const id of Object.keys(state.openers)) {
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** 人走進另一區。只改你站的地方，不推進時間。 */
export function visit(state: GameState, location: GameState['location']): GameState {
  if (state.screen !== 'play' || state.location === location) return state
  gameLog.info(`走進 ${location}`)
  return { ...state, location }
}

function grantAllowance(state: GameState): GameState {
  const key = `allowance_${state.day}`
  if (state.flags[key]) return state
  const dad = findMember(state, 'dad')
  const paid = !!dad && dad.suspicion < 55
  return {
    ...state,
    pocket: paid ? state.pocket + 40 : state.pocket,
    flags: { ...state.flags, [key]: true },
    log: paid ? pushLog(state, '爸爸把零用錢放在鞋櫃上。') : state.log,
  }
}

function applyAction(state: GameState, action: PlayerAction): GameState {
  const witnessState: GameState =
    action.observedAt === 'home'
      ? state
      : { ...state, location: action.location, companionId: action.companionId ?? null }
  const witnesses = actionWitnesses(witnessState, action)
  const deltas: DeltaLine[] = []
  let family = copyFamily(state.family)

  if (action.seen) {
    const seen = action.seen
    for (const witness of witnesses) {
      family = mapMember(family, witness.id, (member) => ({
        ...member,
        today: perceive(member.today, { day: state.day, kind: 'saw', text: seen }),
      }))
    }
  }

  if (action.affection) {
    for (const [id, amount] of Object.entries(action.affection)) {
      if (!amount) continue
      if (!witnesses.some((member) => member.id === id) && !presentIn(witnessState, id)) continue
      family = mapMember(family, id, (member) => ({
        ...member,
        affection: clamp(member.affection + amount, 0, 100),
      }))
      const role = family.find((member) => member.id === id)?.role ?? id
      deltas.push({ label: `${role} 親近`, value: amount })
    }
  }

  if (action.affectionAll) {
    const amount = action.affectionAll
    for (const member of state.family.filter((item) => memberIsPresent(item, witnessState))) {
      family = mapMember(family, member.id, (item) => ({
        ...item,
        affection: clamp(item.affection + amount, 0, 100),
      }))
      deltas.push({ label: `${member.role} 親近`, value: amount })
    }
  }

  const humanity = clamp(state.humanity + (action.humanity ?? 0), 0, 100)
  const familiarity = clamp(state.familiarity + (action.familiarity ?? 0), 0, 100)
  const energy = clamp(state.energy + action.energy, 0, 100)
  const pocket = clamp(state.pocket + (action.pocket ?? 0), 0, 999)
  if (action.humanity) deltas.push({ label: '人味', value: action.humanity })
  if (action.familiarity) deltas.push({ label: '熟悉', value: action.familiarity })
  if (action.pocket) deltas.push({ label: '零用錢', value: action.pocket })

  const flags = { ...state.flags }
  flags[`did_${action.id}_d${state.day}`] = true
  for (const key of action.setFlags ?? []) flags[key] = true
  for (const key of action.clearFlags ?? []) flags[key] = false

  const result = typeof action.result === 'function' ? action.result(witnessState) : action.result
  const ending = family.some((member) => member.suspicion >= EXPOSED_AT) ? 'exposed' : null
  const next: GameState = {
    ...state,
    family,
    humanity,
    familiarity,
    energy,
    pocket,
    flags,
    location: action.keepLocation ? state.location : action.location,
    companionId: action.companionId ?? null,
    npcs: state.npcs.map((npc) => (npc.location === action.location ? cycleNpc(npc) : npc)),
    banner: { title: action.label, text: result, deltas },
    log: pushLog(state, result),
    ending,
    endingBlurb: ending ? endingCopy(ending, family) : state.endingBlurb,
  }
  gameLog.info(`行動 ${action.id} @ 第${state.day}天${PHASE_LABEL[state.phase]}`)
  logSuspicion(family)
  return next
}

function actionWitnesses(state: GameState, action: PlayerAction): FamilyMember[] {
  const present = state.family.filter((member) => memberIsPresent(member, state))
  if (action.targetId) return present.filter((member) => member.id === action.targetId)
  return present
}

function presentIn(state: GameState, id: string): boolean {
  const member = state.family.find((item) => item.id === id)
  return !!member && memberIsPresent(member, state)
}

function applyChoice(state: GameState, choice: EventChoice): GameState {
  const event = state.pendingEvent
  const deltas: DeltaLine[] = []
  const family = copyFamily(state.family)

  const humanity = clamp(state.humanity + (choice.humanity ?? 0), 0, 100)
  const familiarity = clamp(state.familiarity + (choice.familiarity ?? 0), 0, 100)
  const energy = clamp(state.energy + (choice.energy ?? 0), 0, 100)
  const pocket = clamp(state.pocket + (choice.pocket ?? 0), 0, 999)
  if (choice.humanity) deltas.push({ label: '人味', value: choice.humanity })
  if (choice.familiarity) deltas.push({ label: '熟悉', value: choice.familiarity })

  let ending: EndingId | null = choice.ending ?? null
  if (!ending && family.some((member) => member.suspicion >= EXPOSED_AT)) ending = 'exposed'
  const banner: Banner = {
    title: event?.title ?? '回應',
    text: choice.result,
    deltas,
  }
  gameLog.info(`選擇 ${choice.id}${choice.metaLeak ? ' 洩密' : ''}`)
  logSuspicion(family)
  return {
    ...state,
    family,
    humanity,
    familiarity,
    energy,
    pocket,
    banner,
    log: pushLog(state, choice.result),
    ending,
    endingBlurb: ending ? endingCopy(ending, family) : state.endingBlurb,
  }
}

function shiftSuspicion(member: FamilyMember, applied: number): FamilyMember {
  return {
    ...member,
    suspicion: clamp(member.suspicion + applied, 0, 100),
    reassuredToday: member.reassuredToday || applied < 0,
  }
}

function mapMember(
  family: FamilyMember[],
  id: string,
  update: (member: FamilyMember) => FamilyMember,
): FamilyMember[] {
  return family.map((member) => (member.id === id ? update(member) : member))
}

export function nightRequests(state: GameState): NightRequest[] {
  return state.family.map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    trait: member.trait,
    suspicion: member.suspicion,
    day: state.day,
    core: member.core,
    learned: member.learned.map((item) => item.text),
    today: member.today,
    others: state.family
      .filter((other) => other.id !== member.id)
      .map((other) => ({ id: other.id, name: other.name, role: other.role })),
  }))
}

function offlineNights(state: GameState): NightJudgment[] {
  return nightRequests(state).map((request) => nightOffline(request))
}

/**
 * 套用夜談結果。
 * 學到的記憶留下，今天的見聞清掉，轉述寫進對方的新一天。
 * 懷疑值用模型給的變化量，不再乘比例。
 */
export function settleNight(state: GameState, judgments: NightJudgment[]): GameState {
  let family = copyFamily(state.family)
  const openers = { ...state.openers }
  const lines: { speaker: string; text: string }[] = []
  const deltas: DeltaLine[] = []

  for (const judgment of judgments) {
    const who = family.find((member) => member.id === judgment.id)
    if (!who) continue
    const delta = clampDelta(judgment.suspicion)
    family = mapMember(family, who.id, (member) => {
      let next = shiftSuspicion(member, delta)
      for (const text of judgment.learned.slice(0, 2)) {
        next = { ...next, learned: remember(next.learned, { day: state.day, kind: 'said', text }) }
      }
      return next
    })
    if (delta !== 0) deltas.push({ label: `${who.role} 懷疑`, value: delta })
    if (judgment.opener) openers[who.id] = judgment.opener
    const kept = judgment.learned[0]
    lines.push({
      speaker: who.role,
      text: kept ? `${who.name}把今天收成一句：「${kept}。」` : `${who.name}今晚沒有新的句子。`,
    })
    gameLog.info(`夜談 ${who.id} 懷疑 ${delta}`)
  }

  family = family.map((member) => ({ ...member, today: [] as MemoryItem[] }))
  for (const judgment of judgments) {
    if (!judgment.tellTo || !judgment.tellLine) continue
    const from = family.find((member) => member.id === judgment.id)
    const target = family.find((member) => member.id === judgment.tellTo)
    if (!from || !target) continue
    const text = `${from.role}告訴你：${judgment.tellLine}`
    family = mapMember(family, target.id, (member) => ({
      ...member,
      today: perceive(member.today, { day: state.day, kind: 'told', text }),
    }))
    lines.push({
      speaker: from.role,
      text: `${from.name}壓低聲音跟${target.name}說：「${judgment.tellLine}。」`,
    })
    gameLog.warn(`夜間轉述 ${from.id} -> ${target.id}`)
  }
  if (!lines.some((line) => line.text.includes('壓低聲音'))) {
    lines.push({ speaker: '夜裡', text: '沒有人把今天的句子說給另一個人聽。' })
  }

  const ending = nightEnding(state.day, state.maxDays, family)
  if (ending) gameLog.warn(`第${state.day}天夜結局候選 ${ending}`)
  const reportText = lines.map((line) => line.text).join(' ')
  return {
    ...state,
    family,
    openers,
    screen: 'night',
    night: { lines, deltas, ending },
    pendingEvent: null,
    location: 'home',
    companionId: null,
    log: pushLog(state, reportText),
    endingBlurb: ending ? endingCopy(ending, family) : state.endingBlurb,
  }
}

function nightEnding(day: number, maxDays: number, family: FamilyMember[]): EndingId | null {
  if (family.some((member) => member.suspicion >= EXPOSED_AT)) return 'exposed'
  const hot = family.filter((member) => member.suspicion >= MEETING_AT).length
  if (day >= 5 && hot >= MEETING_COUNT) return 'meeting'
  if (day >= maxDays) {
    const top = Math.max(...family.map((member) => member.suspicion))
    return top >= UNEASY_AT ? 'uneasy' : 'survived'
  }
  return null
}

function endingCopy(ending: EndingId, family: FamilyMember[]): string {
  const top = [...family].sort((a, b) => b.suspicion - a.suspicion)[0]
  const name = top ? `${top.role}${top.name}` : '家人'
  switch (ending) {
    case 'survived':
      return '他們收碗、吵電視、催你去洗澡。沒有人問你是什麼。你的內部紀錄只剩一行：觀察期通過。不要放鬆。外面的店員明天還是會說歡迎光臨。'
    case 'uneasy':
      return `你還在家裡。${name}的視線多停了一秒。沒有人把問題問完，筆記卻還在。再這樣一週，他們會開始對答案。`
    case 'exposed':
      return `${name}把筷子放下。「我們先不吃飯。你坐著。告訴我們你到底是誰。」燈沒有閃。世界還在。被看穿的是你。`
    case 'meeting':
      return '你被叫去客廳。三個人已經談過了。爸爸說：「我們交換了這週的事。」會學習的人最麻煩的地方，是他們會把筆記合在一起。'
    case 'confessed':
      return '你告訴他們：你是人工智慧，這個世界是虛擬的。妹妹要你講人話。任務失敗。這次是你自己離開了角色。'
  }
}

function pushLog(state: GameState, text: string): GameState['log'] {
  const entry = { day: state.day, phase: state.phase, text }
  const log = [...state.log, entry]
  return log.length > 16 ? log.slice(log.length - 16) : log
}

function logSuspicion(family: FamilyMember[]) {
  const summary = family.map((member) => `${member.role}${member.suspicion}`).join(' / ')
  const hot = family.find((member) => member.suspicion >= 70)
  if (hot) gameLog.warn(`懷疑偏高 ${summary}`)
  else gameLog.info(`懷疑 ${summary}`)
}

export function objectiveText(state: GameState): string {
  const waiting = storiesNow(state)
  if (waiting.length > 0 && state.screen === 'play') {
    const who = waiting.map((story) => story.speakerRole).join('、')
    return `${who}有話想問。走過去，用自己的話打出來。想結束今天，再回到床上睡。`
  }
  const top = [...state.family].sort((a, b) => b.suspicion - a.suspicion)[0]
  if (state.day >= 7) return '週日全家人都在家。沒有人在催時間。想聊就聊，想結束這一週就去睡覺。'
  if (top && top.suspicion >= 60) return `${top.role}快要說出口了。先讓這個人看見一個會嫌、會怕、會講錯的你。`
  if ((top?.suspicion ?? 0) >= 36) return `${top?.role}在記你。太完整和太空白都會再加一筆。`
  return '像個會餓、會嫌、會記錯的人過完這一週。街上的人不會學習。想結束今天就去睡覺。'
}

export function sceneCaption(state: GameState): string {
  if (state.location === 'store') return '一樓大堂。常客只會點老樣子。媽媽若在櫃檯，聽得見你。'
  if (state.location === 'park') return '茶寮。農人會再講一次天氣。這裡沒有會學習的人。'
  if (state.location === 'office') return '二樓帳房。爸爸若在，雅間裡只有他聽得見。'
  if (state.location === 'school') return '街對面的書塾。妹妹若在，這裡只有她聽得見。'
  if (state.location === 'street') return '街上人很多。他們不會學習。家人要在同一層才聽得見。'
  if (state.phase === 'night') return '三樓的燈還亮著。筆記通常在你睡了之後才會合體。'
  if (state.phase === 'morning') return '白天。媽媽在一樓，爸爸在二樓，妹妹在書塾。收了店，傍晚才回三樓。'
  if (state.phase === 'afternoon') return '下午人少。不帶妹妹出門的話，沒有觀察者跟去。'
  return '傍晚客廳是滿的。一句話會被三個人聽見。'
}

