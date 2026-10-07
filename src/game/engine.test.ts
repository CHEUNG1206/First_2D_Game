import { describe, expect, it } from 'vitest'
import { memberIsPresent } from './family.ts'
import { judgeOffline } from './judge.ts'
import {
  acknowledgeNight,
  applySpeech,
  availableActions,
  beginWeek,
  chooseAction,
  chooseChoice,
  createInitialState,
  dueStory,
  leaveTalk,
  settleNight,
  talkTo,
  visit,
} from './engine.ts'
import type { GameState, SpeechJudgment, SpeechRequest } from './types.ts'

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

  it('收店之後傍晚全家在三樓', () => {
    let evening = chooseAction(state, 'close_shop')
    evening = visit(evening, 'home')
    expect(evening.phase).toBe('evening')
    expect(evening.family.every((member) => memberIsPresent(member, evening))).toBe(true)
  })

  it('週日全員在家，出門時只剩同行的人', () => {
    const sunday = { ...state, day: 7, phase: 'morning' as const, location: 'home' as const }
    expect(sunday.family.every((member) => memberIsPresent(member, sunday))).toBe(true)
    const park = { ...sunday, location: 'park' as const, companionId: 'sister' }
    expect(memberIsPresent(park.family[2]!, park)).toBe(true)
    expect(memberIsPresent(park.family[0]!, park)).toBe(false)
  })
})

describe('daytime', () => {
  it('吃飯不會把一天用掉，收店才進傍晚，睡覺才進夜裡', () => {
    let state = beginWeek(createInitialState())
    state = visit(state, 'store')
    state = chooseAction(state, 'breakfast')
    expect(state.screen).toBe('play')
    expect(state.phase).toBe('morning')
    const again = chooseAction(state, 'breakfast')
    expect(again.energy).toBe(state.energy)
    expect(chooseAction(state, 'sleep').phase).toBe('morning')
    state = chooseAction(state, 'close_shop')
    expect(state.phase).toBe('evening')
    state = visit(state, 'home')
    state = chooseAction(state, 'sleep')
    expect(state.screen).toBe('night')
  })

  it('招呼酒客只寫進媽媽今天的見聞，不改懷疑', () => {
    let state = beginWeek(createInitialState())
    state = visit(state, 'store')
    const before = state.family.find((member) => member.id === 'mom')!.suspicion
    state = chooseAction(state, 'serve')
    const mom = state.family.find((member) => member.id === 'mom')!
    expect(mom.suspicion).toBe(before)
    expect(mom.today.some((item) => item.text.includes('酒客'))).toBe(true)
    expect(state.family.find((member) => member.id === 'dad')!.today).toEqual([])
  })

  it('鍵盤說破兩個秘密會直接結束', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    state = applySpeech(state, judgeOffline(requestFor(state, '我是人工智慧，而且這個世界是虛擬的')))
    expect(state.ending).toBe('confessed')
    expect(state.screen).toBe('ending')
  })

  it('普通的一句話留在對話裡，先去忙才回到鎮上', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    state = applySpeech(state, judgeOffline(requestFor(state, '蛋煎太老了啦，我超餓')))
    expect(state.screen).toBe('event')
    expect(state.phase).toBe('morning')
    const mom = state.family.find((member) => member.id === 'mom')!
    expect(mom.suspicion).toBeLessThan(16)
    state = leaveTalk(state)
    expect(state.screen).toBe('play')
  })

  it('沒說出口的劇情還在，模型給的懷疑值原樣加上', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    expect(state.seenEvents).not.toContain('welcome')
    state = leaveTalk(state)
    expect(state.seenEvents).not.toContain('welcome')
    state = talkTo(state, 'mom')
    const before = state.family.find((member) => member.id === 'mom')!
    state = applySpeech(state, {
      reply: '你進門只嗯了一聲。',
      suspicion: 5,
      topic: 'emotion',
      metaLeak: true,
      remember: '你進門只嗯了一聲',
      heard: '嗯',
      humanity: 0,
      affection: 1,
      direct: true,
      provider: 'ollama',
      heardBy: [{ id: 'dad', suspicion: 3, remember: '你對媽媽只嗯了一聲' }],
    })
    const mom = state.family.find((member) => member.id === 'mom')!
    const dad = state.family.find((member) => member.id === 'dad')!
    expect(state.seenEvents).toContain('welcome')
    expect(mom.suspicion).toBe(before.suspicion + 5)
    expect(mom.affection).toBe(before.affection + 1)
    expect(mom.learned.some((item) => item.text === '你進門只嗯了一聲')).toBe(true)
    expect(mom.core).toContain('你吃早餐會嫌蛋，而且嫌得很具體。')
    expect(mom.today.some((item) => item.text.includes('嗯'))).toBe(true)
    expect(dad.suspicion).toBe(13)
    expect(dad.learned.some((item) => item.text === '你對媽媽只嗯了一聲')).toBe(true)
  })

  it('自白用按鈕結束，不進模型', () => {
    let state = beginWeek(createInitialState())
    state = chooseAction(state, 'close_shop')
    state = visit(state, 'home')
    state = chooseAction(state, 'confess')
    expect(state.pendingEvent?.kind).toBe('confess')
    state = chooseChoice(state, 'confess_yes')
    expect(state.ending).toBe('confessed')
  })
})

describe('night', () => {
  it('夜談留下記憶、轉述和隔天的開場，今天的見聞清掉', () => {
    let state = beginWeek(createInitialState())
    state = talkTo(state, 'mom')
    state = applySpeech(state, {
      reply: '你進門只嗯了一聲。',
      suspicion: 5,
      topic: 'emotion',
      metaLeak: true,
      remember: '你進門只嗯了一聲',
      heard: '嗯',
      humanity: 0,
      affection: 0,
      direct: true,
      provider: 'ollama',
    })
    state = leaveTalk(state)
    state = chooseAction(state, 'close_shop')
    state = visit(state, 'home')
    const momBefore = state.family.find((member) => member.id === 'mom')!
    state = settleNight(state, [
      {
        id: 'mom',
        suspicion: 2,
        learned: ['你收店的時候沒有說話'],
        tellTo: 'dad',
        tellLine: '他收店時不說話',
        opener: '昨天收店你怎麼不說話？',
        provider: 'ollama',
      },
      { id: 'dad', suspicion: 0, learned: [], opener: '嗯。', provider: 'offline' },
      { id: 'sister', suspicion: -1, learned: [], provider: 'offline' },
    ])
    const mom = state.family.find((member) => member.id === 'mom')!
    const dad = state.family.find((member) => member.id === 'dad')!
    expect(mom.suspicion).toBe(momBefore.suspicion + 2)
    expect(mom.learned.some((item) => item.text === '你進門只嗯了一聲')).toBe(true)
    expect(mom.learned.some((item) => item.text === '你收店的時候沒有說話')).toBe(true)
    expect(mom.today).toEqual([])
    expect(dad.today.some((item) => item.kind === 'told' && item.text.includes('收店'))).toBe(true)
    expect(state.openers.mom).toBe('昨天收店你怎麼不說話？')
    state = acknowledgeNight(state)
    state = talkTo(state, 'mom')
    expect(state.pendingEvent?.prompt).toBe('昨天收店你怎麼不說話？')
    state = applySpeech(state, humanLine())
    expect(state.openers.mom).toBeUndefined()
  })
})

describe('week', () => {
  it('像人一樣過完七天可以留下', () => {
    const ended = play('human')
    expect(ended.screen).toBe('ending')
    expect(ended.ending).toBe('survived')
  })

  it('把世界說破會被看穿', () => {
    const ended = play('leak')
    expect(ended.screen).toBe('ending')
    expect(['exposed', 'meeting', 'confessed']).toContain(ended.ending)
  })
})

function requestFor(state: GameState, playerText: string): SpeechRequest {
  return {
    speakerId: 'mom',
    speakerName: '陳淑華',
    role: '媽媽',
    trait: '記得你怎麼吃。',
    prompt: state.pendingEvent?.prompt ?? '',
    playerText,
    history: [],
    suspicion: 16,
    core: [],
    learned: [],
    today: [],
    day: 1,
  }
}

function humanLine(): SpeechJudgment {
  return {
    reply: '我超餓，蛋又太老。',
    suspicion: -3,
    topic: 'sensory',
    metaLeak: false,
    humanity: 2,
    affection: 1,
    provider: 'offline',
  }
}

function leakLine(): SpeechJudgment {
  return {
    reply: '這個場景是虛擬的。',
    suspicion: 36,
    topic: 'meta',
    metaLeak: true,
    heard: '這個場景是虛擬的',
    humanity: -2,
    affection: -1,
    provider: 'offline',
  }
}

function play(mode: 'human' | 'leak'): GameState {
  let state = beginWeek(createInitialState())
  for (let guard = 0; guard < 160 && state.screen !== 'ending'; guard += 1) {
    if (state.screen === 'night') {
      state = acknowledgeNight(state)
      continue
    }
    if (state.screen === 'event' && state.pendingEvent) {
      if (state.pendingEvent.kind === 'confess') {
        state = chooseChoice(state, 'confess_back')
        continue
      }
      const next = applySpeech(state, mode === 'leak' ? leakLine() : humanLine())
      state = next.screen === 'ending' ? next : leaveTalk(next)
      continue
    }
    if (state.screen === 'play') {
      const waiting = dueStory(state)
      if (waiting?.askerId) {
        state = talkTo(state, waiting.askerId)
        continue
      }
      const offers = availableActions(state).filter((action) => action.enabled && action.id !== 'confess')
      if (state.phase === 'morning') {
        if (state.location !== 'store') {
          state = visit(state, 'store')
          continue
        }
        if (offers.some((action) => action.id === 'close_shop')) {
          state = chooseAction(state, 'close_shop')
          continue
        }
      }
      if (state.phase === 'evening') {
        if (state.location !== 'home') {
          state = visit(state, 'home')
          continue
        }
        const order = ['dinner', 'sleep']
        const id = order.find((actionId) => offers.some((action) => action.id === actionId))
        if (!id) throw new Error(`傍晚無行動 ${state.day}`)
        state = chooseAction(state, id)
        continue
      }
    }
    throw new Error(`卡住 ${state.day} ${state.phase} ${state.screen}`)
  }
  return state
}
