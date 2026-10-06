import { actionById, ACTIONS } from './actions.ts'
import { audienceFor, createFamily, findMember, memberIsPresent } from './family.ts'
import {
  clamp,
  DRIFT,
  EXPOSED_AT,
  MEETING_AT,
  MEETING_COUNT,
  overhearAmount,
  pickDriftTarget,
  scoreSuspicion,
  SHARE_GAIN_MIN,
  SHARE_RATIO,
  UNEASY_AT,
} from './formula.ts'
import { gameLog } from './logger.ts'
import { createNpcs, cycleNpc } from './npcs.ts'
import { CONFESS_EVENT, idleTalk, pickStory, storyFor, storiesNow } from './events.ts'
import type {
  ActionOffer,
  Banner,
  DeltaLine,
  EndingId,
  EventChoice,
  FamilyMember,
  GameState,
  MemoryNote,
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
  if (action.id === 'sleep') {
    gameLog.info(`第${state.day}天去睡覺`)
    return buildNight({ ...next, phase: 'night' })
  }
  return next
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
  if (state.phase === 'night') return buildNight(state)
  const phase = PHASE_ORDER[PHASE_ORDER.indexOf(state.phase) + 1]
  if (!phase) return buildNight(state)
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

/** 走到那個人旁邊再開口。有劇情就進劇情，沒有就閒聊。時間不往前走。 */
export function talkTo(state: GameState, actorId: string): GameState {
  if (state.screen !== 'play') return state
  const story = storyFor(state, actorId)
  if (story) {
    gameLog.info(`走上前跟 ${actorId} 說話：${story.id}`)
    return {
      ...state,
      screen: 'event',
      pendingEvent: story,
      eventAdvances: false,
      seenEvents: [...state.seenEvents, story.id],
    }
  }
  const member = findMember(state, actorId)
  if (!member) return state
  gameLog.info(`跟 ${actorId} 閒聊`)
  return {
    ...state,
    screen: 'event',
    pendingEvent: idleTalk(member, state.day),
    eventAdvances: false,
  }
}

/** 玩家打完的一句話。對話留在畫面上，方便繼續打下一句。 */
export function applySpeech(state: GameState, spoken: SpeechJudgment): GameState {
  if (state.screen !== 'event' || !state.pendingEvent) return state
  const next = applyChoice(state, {
    id: 'spoken',
    text: spoken.reply,
    result: spoken.reply,
    suspicion: spoken.suspicion,
    topic: spoken.topic,
    metaLeak: spoken.metaLeak,
    note: spoken.note,
    humanity: spoken.humanity,
    affection: spoken.affection,
    ending: spoken.ending,
  })
  if (next.ending) {
    gameLog.warn(`結局 ${next.ending}`)
    return { ...next, screen: 'ending', pendingEvent: null }
  }
  return { ...next, screen: 'event', pendingEvent: state.pendingEvent }
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
  return storiesNow(state)
    .map((story) => story.askerId)
    .filter((id): id is string => !!id)
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
  let family = state.family.map((member) => ({ ...member, notes: [...member.notes] }))

  if (action.suspicion) {
    const spec = action.suspicion
    for (const witness of witnesses) {
      const current = family.find((member) => member.id === witness.id)
      if (!current) continue
      const applied = scoreSuspicion({
        amount: spec.amount,
        topic: spec.topic,
        weights: current.weights,
        humanity: state.humanity,
        familiarity: state.familiarity,
        affection: current.affection,
      })
      family = mapMember(family, current.id, (member) =>
        withSuspicion(member, applied, spec.amount < 0, spec.note, spec.topic, state.day),
      )
      deltas.push({ label: `${current.role} 懷疑`, value: applied })
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
  if (!action.suspicion) return present
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
  let family = state.family.map((member) => ({ ...member, notes: [...member.notes] }))
  if (event?.askerId) {
    const asker = family.find((member) => member.id === event.askerId)
    if (asker) {
      const applied = scoreSuspicion({
        amount: choice.suspicion,
        topic: choice.topic,
        weights: asker.weights,
        humanity: state.humanity,
        familiarity: state.familiarity,
        affection: asker.affection,
        metaLeak: choice.metaLeak,
      })
      family = mapMember(family, asker.id, (member) =>
        withSuspicion(member, applied, applied < 0, choice.note, choice.topic, state.day),
      )
      deltas.push({ label: `${asker.role} 懷疑`, value: applied })
      if (choice.affection) {
        family = mapMember(family, asker.id, (member) => ({
          ...member,
          affection: clamp(member.affection + (choice.affection ?? 0), 0, 100),
        }))
        deltas.push({ label: `${asker.role} 親近`, value: choice.affection })
      }
      for (const hear of audienceFor(state, event.askerId)) {
        if (hear.direct) continue
        const heard = overhearAmount(applied, asker.weights[choice.topic], hear.member.weights[choice.topic])
        if (heard === 0) continue
        const overheard = choice.note ? `旁聽：${choice.note}` : undefined
        family = mapMember(family, hear.member.id, (member) =>
          withSuspicion(member, heard, heard < 0, overheard, choice.topic, state.day),
        )
        deltas.push({ label: `${hear.member.role} 旁聽`, value: heard })
      }
    }
  }

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

function withSuspicion(
  member: FamilyMember,
  applied: number,
  reassure: boolean,
  note: string | undefined,
  topic: MemoryNote['topic'],
  day: number,
): FamilyMember {
  const notes =
    note && applied > 0 ? pushNote(member.notes, { day, topic, text: note }) : member.notes
  return {
    ...member,
    suspicion: clamp(member.suspicion + applied, 0, 100),
    reassuredToday: member.reassuredToday || (reassure && applied < 0),
    notes,
  }
}

function pushNote(notes: MemoryNote[], note: MemoryNote): MemoryNote[] {
  const next = [...notes, note]
  return next.length > 4 ? next.slice(next.length - 4) : next
}

function mapMember(
  family: FamilyMember[],
  id: string,
  update: (member: FamilyMember) => FamilyMember,
): FamilyMember[] {
  return family.map((member) => (member.id === id ? update(member) : member))
}

function buildNight(state: GameState): GameState {
  let family = state.family.map((member) => ({ ...member, notes: [...member.notes] }))
  const lines: { speaker: string; text: string }[] = []
  const deltas: DeltaLine[] = []

  const driftId = pickDriftTarget(family)
  if (driftId) {
    family = mapMember(family, driftId, (member) => ({
      ...member,
      suspicion: clamp(member.suspicion + DRIFT, 0, 100),
    }))
    const who = family.find((member) => member.id === driftId)!
    lines.push({
      speaker: who.role,
      text: `${who.name}今天沒有被安撫。空白被記成了「有事」。`,
    })
    deltas.push({ label: `${who.role} 懷疑`, value: DRIFT })
    gameLog.info(`夜間漂移 ${who.id} +${DRIFT}`)
  } else {
    lines.push({ speaker: '家裡', text: '今晚沒有人把空白當成證據。' })
  }

  const ranked = [...family].sort(
    (a, b) => b.suspicion - b.suspicionAtDawn - (a.suspicion - a.suspicionAtDawn),
  )
  const speaker = ranked[0]
  const gain = speaker ? speaker.suspicion - speaker.suspicionAtDawn : 0
  if (speaker && gain >= SHARE_GAIN_MIN) {
    const todayNotes = speaker.notes.filter((note) => note.day === state.day)
    const topic = todayNotes.at(-1)?.topic ?? 'emotion'
    const noteText = todayNotes.at(-1)?.text
    const candidates = family.filter(
      (member) => member.id !== speaker.id && !member.notes.some((note) => note.day === state.day),
    )
    const listener = [...candidates].sort((a, b) => b.weights[topic] - a.weights[topic])[0]
    if (listener) {
      const transfer = Math.max(1, Math.round(gain * SHARE_RATIO))
      family = mapMember(family, listener.id, (member) => ({
        ...member,
        suspicion: clamp(member.suspicion + transfer, 0, 100),
        notes: noteText
          ? pushNote(member.notes, { day: state.day, topic, text: `聽${speaker.role}說：${noteText}` })
          : member.notes,
      }))
      lines.push({
        speaker: speaker.role,
        text: noteText
          ? `${speaker.name}壓低聲音跟${listener.name}說：「${noteText}。」`
          : `${speaker.name}把今天的不對勁告訴了${listener.name}。`,
      })
      deltas.push({ label: `${listener.role} 懷疑`, value: transfer })
      gameLog.warn(`夜間交換 ${speaker.id} -> ${listener.id} +${transfer}`)
    } else {
      lines.push({ speaker: '夜裡', text: '白天在場的人都聽到了。夜裡沒有新的情報。' })
    }
  } else {
    lines.push({ speaker: '夜裡', text: '沒有人交換筆記。路上那些人當然也不會。' })
  }

  const ending = nightEnding(state.day, state.maxDays, family)
  if (ending) gameLog.warn(`第${state.day}天夜結局候選 ${ending}`)
  const reportText = lines.map((line) => line.text).join(' ')
  return {
    ...state,
    family,
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
  if (state.location === 'store') return '便利商店的燈太白。店員的句子比人少。'
  if (state.location === 'park') return '公園。慢跑的人會再講一次天氣。貓不會盤問你。'
  if (state.location === 'office') return '公司。爸爸若在，這裡只有他聽得見。'
  if (state.location === 'school') return '學校。妹妹若在，這裡只有她聽得見。'
  if (state.location === 'street') return '街上。市場的人若在，才算在場。'
  if (state.phase === 'night') return '家裡的燈還亮著。筆記通常在你睡了之後才會合體。'
  if (state.phase === 'morning') return '白天。媽媽在家，爸爸在公司，妹妹在學校。沒有人在倒數，睡了才算一天。'
  if (state.phase === 'afternoon') return '下午人少。不帶妹妹出門的話，沒有觀察者跟去。'
  return '傍晚客廳是滿的。一句話會被三個人聽見。'
}

export function moodFromSuspicion(suspicion: number): 'ok' | 'watch' | 'worry' | 'mad' {
  if (suspicion >= 75) return 'mad'
  if (suspicion >= 50) return 'worry'
  if (suspicion >= 30) return 'watch'
  return 'ok'
}
