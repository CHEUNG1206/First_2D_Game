import { describe, expect, it } from 'vitest'
import { overhearAmount, scoreSuspicion } from './formula.ts'
import { memberIsPresent } from './family.ts'
import {
  acknowledgeNight,
  availableActions,
  beginWeek,
  chooseAction,
  chooseChoice,
  createInitialState,
} from './engine.ts'
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

  it('週一上午只有媽媽在家', () => {
    const home = { ...state, screen: 'play' as const, location: 'home' as const, phase: 'morning' as const }
    expect(memberIsPresent(home.family[0]!, home)).toBe(true)
    expect(memberIsPresent(home.family[1]!, home)).toBe(false)
    expect(memberIsPresent(home.family[2]!, home)).toBe(false)
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
  it('一個人看見循環時，家人的懷疑不變', () => {
    let state = beginWeek(createInitialState())
    state = chooseChoice(state, 'welcome_mess')
    state = chooseAction(state, 'album')
    const before = state.family.map((member) => member.suspicion)
    state = chooseAction(state, 'store_tea')
    expect(state.pendingEvent?.id).toBe('store_glitch')
    expect(state.pendingEvent?.askerId).toBeNull()
    state = chooseChoice(state, 'glitch_tell')
    expect(state.family.map((member) => member.suspicion)).toEqual(before)
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
