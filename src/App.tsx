import { useReducer, useState } from 'react'
import { blip } from './game/audio.ts'
import {
  acknowledgeNight,
  beginWeek,
  chooseAction,
  chooseChoice,
  createInitialState,
} from './game/engine.ts'
import type { GameState } from './game/types.ts'
import { ActionBar, Banner, EventDialog, Hud, Monitor, Stage } from './components/PlayView.tsx'
import { EndingScreen, IntroScreen, NightScreen, Rules, TitleScreen } from './components/Screens.tsx'

type Act =
  | { type: 'start' }
  | { type: 'intro' }
  | { type: 'act'; id: string }
  | { type: 'choice'; id: string }
  | { type: 'night' }
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
    case 'choice':
      return chooseChoice(state, action.id)
    case 'night':
      return acknowledgeNight(state)
    case 'restart':
      return createInitialState()
    default:
      return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

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
            onStart={() => {
              play('ui')
              dispatch({ type: 'start' })
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
          <div className="play">
            <div className="stage-grid">
              <div className="scene-column">
                <Stage state={state} />
                <Banner state={state} />
                {state.screen === 'play' && (
                  <ActionBar
                    state={state}
                    onAction={(id) => {
                      play('ui')
                      dispatch({ type: 'act', id })
                    }}
                  />
                )}
              </div>
              <Monitor state={state} />
            </div>
          </div>
        )}

        {state.screen === 'event' && (
          <EventDialog
            state={state}
            onChoice={(id) => {
              const choice = state.pendingEvent?.choices.find((item) => item.id === id)
              play(choice?.metaLeak ? 'bad' : 'good')
              dispatch({ type: 'choice', id })
            }}
          />
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
