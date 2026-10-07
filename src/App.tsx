import { useEffect, useReducer, useState } from 'react'
import { blip } from './game/audio.ts'
import { askNight } from './game/ask.ts'
import {
  acknowledgeNight,
  applySpeech,
  beginWeek,
  chooseAction,
  chooseChoice,
  createInitialState,
  leaveTalk,
  prepareSleep,
  settleNight,
  talkTo,
  visit,
} from './game/engine.ts'
import { clearSave, loadGame, saveGame } from './game/save.ts'
import type { GameState, LocationId, NightJudgment, SpeechJudgment } from './game/types.ts'
import { Banner, Hud, Monitor } from './components/PlayView.tsx'
import { TalkBox } from './components/TalkBox.tsx'
import { World } from './world/World.tsx'
import { EndingScreen, IntroScreen, NightScreen, Rules, TitleScreen } from './components/Screens.tsx'

type Act =
  | { type: 'start' }
  | { type: 'intro' }
  | { type: 'act'; id: string }
  | { type: 'talk'; id: string }
  | { type: 'visit'; location: LocationId }
  | { type: 'speech'; judgment: SpeechJudgment }
  | { type: 'choice'; id: string }
  | { type: 'leave' }
  | { type: 'night' }
  | { type: 'settle'; nights: NightJudgment[] }
  | { type: 'continue'; state: GameState }
  | { type: 'restart' }

function reducer(state: GameState, action: Act): GameState {
  switch (action.type) {
    case 'start':
      return { ...state, screen: 'intro', introStep: 0 }
    case 'intro':
      if (state.introStep >= 3) return beginWeek(state)
      return { ...state, introStep: state.introStep + 1 }
    case 'act':
      return chooseAction(state, action.id)
    case 'talk':
      return talkTo(state, action.id)
    case 'visit':
      return visit(state, action.location)
    case 'speech':
      return applySpeech(state, action.judgment)
    case 'choice':
      return chooseChoice(state, action.id)
    case 'leave':
      return leaveTalk(state)
    case 'night':
      return acknowledgeNight(state)
    case 'settle': {
      const slept = prepareSleep(state)
      if (!slept) return state
      return settleNight(slept, action.nights)
    }
    case 'continue':
      return action.state
    case 'restart':
      return createInitialState()
    default:
      return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [familyOpen, setFamilyOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [settling, setSettling] = useState(false)
  const hasSave = state.screen === 'title' && loadGame() !== null

  useEffect(() => {
    if (state.screen === 'ending') {
      clearSave()
      return
    }
    if (state.screen === 'title') return
    saveGame(state)
  }, [state])

  function play(kind: 'ui' | 'good' | 'bad' | 'night') {
    if (soundOn) blip(kind)
  }

  const inWeek = state.screen === 'play' || state.screen === 'event' || state.screen === 'night'

  return (
    <main className="desk">
      <div className={`cabinet phase-${state.phase}`}>
        {inWeek && (
          <Hud
            state={state}
            soundOn={soundOn}
            onToggleSound={() => {
              play('ui')
              setSoundOn((on) => !on)
            }}
            onRules={() => {
              play('ui')
              setRulesOpen(true)
            }}
          />
        )}

        {state.screen === 'title' && (
          <TitleScreen
            hasSave={hasSave}
            onStart={() => {
              play('ui')
              clearSave()
              dispatch({ type: 'start' })
            }}
            onContinue={() => {
              const saved = loadGame()
              if (!saved) return
              play('ui')
              dispatch({ type: 'continue', state: saved })
            }}
            onRules={() => setRulesOpen(true)}
          />
        )}

        {state.screen === 'intro' && (
          <IntroScreen
            step={state.introStep}
            onNext={() => {
              play('ui')
              dispatch({ type: 'intro' })
            }}
          />
        )}

        {(state.screen === 'play' || state.screen === 'event') && (
          <div className={familyOpen ? 'world-layout with-family' : 'world-layout'}>
            <div className="scene-column">
              <World
                state={state}
                locked={state.screen !== 'play' || rulesOpen || settling}
                onAction={(id) => {
                  play('ui')
                  if (id === 'sleep') {
                    if (!prepareSleep(state)) return
                    setSettling(true)
                    void askNight(state).then((nights) => {
                      dispatch({ type: 'settle', nights })
                      setSettling(false)
                      play('night')
                    })
                    return
                  }
                  dispatch({ type: 'act', id })
                }}
                onTalk={(id) => {
                  play('ui')
                  dispatch({ type: 'talk', id })
                }}
                onVisit={(location) => dispatch({ type: 'visit', location })}
                onOpenFamily={() => setFamilyOpen((open) => !open)}
              />
              {state.screen === 'play' && <Banner state={state} />}
            </div>
            {familyOpen && <Monitor state={state} />}
          </div>
        )}

        {state.screen === 'event' && (
          <TalkBox
            state={state}
            onSpoken={(judgment) => {
              play(judgment.metaLeak || judgment.suspicion > 0 ? 'bad' : 'good')
              dispatch({ type: 'speech', judgment })
            }}
            onLeave={() => {
              play('ui')
              dispatch({ type: 'leave' })
            }}
            onChoice={(id) => {
              play('ui')
              dispatch({ type: 'choice', id })
            }}
          />
        )}

        {settling && (
          <section className="night-screen">
            <p className="eyebrow">夜裡</p>
            <h1>他們在交換</h1>
            <p className="lede">你睡著之後，每個人把自己今天看見的事整理一遍。</p>
          </section>
        )}

        {state.screen === 'night' && (
          <NightScreen
            state={state}
            onNext={() => {
              play('night')
              dispatch({ type: 'night' })
            }}
          />
        )}

        {state.screen === 'ending' && (
          <EndingScreen
            state={state}
            onRestart={() => {
              play('ui')
              dispatch({ type: 'restart' })
            }}
          />
        )}

        {rulesOpen && (
          <Rules
            onClose={() => {
              play('ui')
              setRulesOpen(false)
            }}
          />
        )}
      </div>
    </main>
  )
}
