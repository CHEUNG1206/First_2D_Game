import { describe, expect, it } from 'vitest'
import { overhearAmount, scoreSuspicion } from './formula.ts'
import { memberIsPresent } from './family.ts'
import { judgeOffline } from './judge.ts'
import {
  acknowledgeNight,
  applySpeech,
  availableActions,
  beginWeek,
  chooseAction,
  visit,
  chooseChoice,
  createInitialState,
  dueStory,
  leaveTalk,
  talkTo,
} from './engine.ts'
import type { SpeechRequest } from './types.ts'
import type { GameState } from './types.ts'

describe('scoreSuspicion', () => {
  it('放大普通破綻，並保留緩衝扣不完的痕跡', () => {
    const applied = scoreSuspicion({
      amount: 10,
      topic: 'sensory',
      weights: { routine: 1, emotion: 1, memory: 1, meta: 1, sensory: 1.55, play: 1 },
      humanity: 0,
      familiarity: 0,
      affection: 0,
    })
    expect(applied).toBe(16)
  })

  it('說破世界的加成分數不吃緩衝', () => {
    const leaked = scoreSuspicion({
      amount: 6,
      topic: 'meta',
      weights: { routine: 1, emotion: 1, memory: 1, meta: 1.6, sensory: 1, play: 1 },
      humanity: 100,
      familiarity: 100,
      affection: 100,
      metaLeak: true,
    })
    const plain = scoreSuspicion({
      amount: 6,
      topic: 'meta',
      weights: { routine: 1, emotion: 1, memory: 1, meta: 1.6, sensory: 1, play: 1 },
      humanity: 100,
      familiarity: 100,
      affection: 100,
    })
    expect(leaked - plain).toBe(38)
  })
})

describe('overhearAmount', () => {
  it('旁聽約六成，再依在意程度縮放', () => {
    expect(overhearAmount(10, 1.5, 0.75)).toBe(3)
  })
})

describe('memberIsPresent', () => {
  const state = beginWeek(createInitialState())

  it('週一上午媽媽在一樓大堂，不在三樓', () => {
    const home = { ...state, screen: 'play' as const, location: 'home' as const, phase: 'morning' as const }
    expect(memberIsPresent(home.family[0]!, home)).toBe(false)
    expect(memberIsPresent(home.family[1]!, home)).toBe(false)
    expect(memberIsPresent(home.family[2]!, home)).toBe(false)
    const hall = { ...home, location: 'store' as const }
    expect(memberIsPresent(hall.family[0]!, hall)).toBe(true)
    expect(memberIsPresent(hall.family[1]!, hall)).toBe(false)
  })

  it('週日全員在家，出門時只剩同行的人', () => {
    const sunday = { ...state, day: 7, phase: 'morning' as const, location: 'home' as const }
    expect(sunday.family.every((member) => memberIsPresent(member, sunday))).toBe(true)
    const park = { ...sunday, location: 'park' as const, companionId: 'sister' }
    expect(memberIsPresent(park.family[2]!, park)).toBe(true)
    expect(memberIsPresent(park.family[0]!, park)).toBe(false)
  })
})

function finishDayQuietly(state: GameState): GameState {
  let current = state
  for (let guard = 0; guard < 12 && current.screen !== 'night' && current.screen !== 'ending'; guard += 1) {
    if (current.screen === 'event' && current.pendingEvent) {
      const choice =
        current.pendingEvent.choices.find((item) => item.id === 'welcome_exact') ??
        current.pendingEvent.choices[0]!
      current = chooseChoice(current, choice.id)
      continue
    }
    const offers = availableActions(current).filter((action) => action.enabled)
    const preferred = ['album', 'park', 'dinner', 'sleep'].find((id) => offers.some((action) => action.id === id))
    const id = preferred ?? offers[0]?.id
    if (!id) throw new Error(`無行動 ${current.day} ${current.phase}`)
    current = chooseAction(current, id)
  }
  return current
}

describe('night share', () => {
  it('太完整的早餐會在夜裡傳給白天不在場的爸爸', () => {
    let state = beginWeek(createInitialState())
    expect(state.screen).toBe('play')
    state = talkTo(state, 'mom')
    state = chooseChoice(state, 'welcome_exact')
    state = finishDayQuietly(state)
    expect(state.screen).toBe('night')
    const dad = state.family.find((member) => member.id === 'dad')!
    const sister = state.family.find((member) => member.id === 'sister')!
    expect(dad.suspicion).toBeGreaterThan(10)
    expect(sister.suspicion).toBe(22)
    expect(state.night?.lines.some((line) => line.text.includes('唸作息表'))).toBe(true)
  })
})

describe('store', () => {
  it('去便利商店不會打開選項，也不會改家人的懷疑', () => {
    let state = beginWeek(createInitialState())
    const before = state.family.map((member) => member.suspicion)
    state = chooseAction(state, 'store_tea')
    expect(state.pendingEvent).toBeNull()
    expect(state.screen).toBe('play')
    expect(state.phase).toBe('morning')
    expect(state.family.map((member) => member.suspicion)).toEqual(before)
  })
})

describe('daytime', () => {
  it('吃飯不會把一天用掉，睡覺才會，早餐也不能刷', () => {
    let state = beginWeek(createInitialState())
    state = visit(state, 'store')
    state = chooseAction(state, 'breakfast')
    expect(state.screen).toBe('play')
    expect(state.phase).toBe('morning')
    const again = chooseAction(state, 'breakfast')
    expect(again.energy).toBe(state.energy)
    state = chooseAction(state, 'sleep')
    expect(state.screen).toBe('night')
  })

  it('鍵盤說破兩個秘密會直接結束', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    const request: SpeechRequest = {
      speakerId: 'mom',
      speakerName: '陳淑華',
      role: '媽媽',
      trait: '記得你怎麼吃。',
      prompt: state.pendingEvent?.prompt ?? '',
      playerText: '我是人工智慧，而且這個世界是虛擬的',
      history: [],
      suspicion: 16,
      notes: [],
      day: 1,
    }
    state = applySpeech(state, judgeOffline(request))
    expect(state.ending).toBe('confessed')
    expect(state.screen).toBe('ending')
  })

  it('普通的一句話留在對話裡，先去忙才回到鎮上', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    const request: SpeechRequest = {
      speakerId: 'mom',
      speakerName: '陳淑華',
      role: '媽媽',
      trait: '記得你怎麼吃。',
      prompt: state.pendingEvent?.prompt ?? '',
      playerText: '蛋煎太老了啦，我超餓',
      history: [],
      suspicion: 16,
      notes: [],
      day: 1,
    }
    state = applySpeech(state, judgeOffline(request))
    expect(state.screen).toBe('event')
    expect(state.phase).toBe('morning')
    const mom = state.family.find((member) => member.id === 'mom')!
    expect(mom.suspicion).toBeLessThan(16)
    state = leaveTalk(state)
    expect(state.screen).toBe('play')
  })
})

function play(decider: (state: GameState) => GameState): GameState {
  let state = beginWeek(createInitialState())
  for (let guard = 0; guard < 80 && state.screen !== 'ending'; guard += 1) {
    state = decider(state)
  }
  return state
}

describe('week', () => {
  it('像人一樣過完七天可以留下', () => {
    const ended = play((state) => {
      if (state.screen === 'night') return acknowledgeNight(state)
      if (state.screen === 'play') {
        const waiting = dueStory(state)
        if (waiting?.askerId) return talkTo(state, waiting.askerId)
      }
      if (state.screen === 'event' && state.pendingEvent) {
        const safe = state.pendingEvent.choices.filter((choice) => !choice.metaLeak && !choice.ending)
        const pick = [...safe].sort((a, b) => a.suspicion - b.suspicion)[0]!
        return chooseChoice(state, pick.id)
      }
      const offers = availableActions(state).filter((action) => action.enabled && action.id !== 'confess')
      if (!state.seenEvents.includes('store_glitch') && offers.some((action) => action.id === 'store_tea')) {
        return chooseAction(state, 'store_tea')
      }
      const order = ['breakfast', 'give_pudding', 'with_sister', 'tv', 'dishes', 'dinner', 'album', 'park', 'sleep']
      const id = order.find((actionId) => offers.some((action) => action.id === actionId)) ?? offers[0]?.id
      if (!id) throw new Error(`無行動 ${state.day} ${state.phase}`)
      return chooseAction(state, id)
    })
    expect(ended.screen).toBe('ending')
    expect(ended.ending).toBe('survived')
  })

  it('把世界說破會被家人合起來看穿', () => {
    const ended = play((state) => {
      if (state.screen === 'night') return acknowledgeNight(state)
      if (state.screen === 'play') {
        const waiting = dueStory(state)
        if (waiting?.askerId) return talkTo(state, waiting.askerId)
      }
      if (state.screen === 'event' && state.pendingEvent) {
        const meta = state.pendingEvent.choices.find((choice) => choice.metaLeak)
        const pick = meta ?? [...state.pendingEvent.choices].sort((a, b) => b.suspicion - a.suspicion)[0]!
        return chooseChoice(state, pick.id)
      }
      const offers = availableActions(state).filter((action) => action.enabled && action.id !== 'confess')
      const order = ['eat_alone', 'walk_out', 'park', 'album', 'dinner', 'sleep']
      const id = order.find((actionId) => offers.some((action) => action.id === actionId)) ?? offers[0]?.id
      if (!id) throw new Error(`無行動 ${state.day} ${state.phase}`)
      return chooseAction(state, id)
    })
    expect(ended.screen).toBe('ending')
    expect(['exposed', 'meeting', 'confessed']).toContain(ended.ending)
  })
})
