import { availableActions, dayLabel, moodFromSuspicion, objectiveText, PHASE_LABEL, sceneCaption } from '../game/engine.ts'
import { audienceFor, memberIsPresent } from '../game/family.ts'
import type { ActionOffer, GameState } from '../game/types.ts'
import { Chibi } from './sprites.tsx'

function Bar({
  label,
  value,
  max = 100,
  tone,
}: {
  label: string
  value: number
  max?: number
  tone: string
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="bar">
      <div className="bar-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div className={`bar-fill tone-${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function suspicionTone(value: number): string {
  if (value >= 75) return 'bad'
  if (value >= 50) return 'warn'
  if (value >= 30) return 'watch'
  return 'good'
}

export function Hud({
  state,
  soundOn,
  onToggleSound,
  onRules,
}: {
  state: GameState
  soundOn: boolean
  onToggleSound: () => void
  onRules: () => void
}) {
  const top = Math.max(...state.family.map((member) => member.suspicion))
  return (
    <header className="hud">
      <div className="hud-date">
        <strong>
          {dayLabel(state.day)}
          {PHASE_LABEL[state.phase]}
        </strong>
        <span>
          第 {state.day} / {state.maxDays} 天
        </span>
      </div>
      <Bar label="體力" value={state.energy} tone="energy" />
      <Bar label="人味" value={state.humanity} tone="human" />
      <Bar label="熟悉" value={state.familiarity} tone="human" />
      <div className="pocket">
        <span>零用錢</span>
        <strong>{state.pocket}</strong>
      </div>
      <div className="hud-actions">
        <button type="button" className="text-btn" onClick={onRules}>
          規則
        </button>
        <button type="button" className="text-btn" onClick={onToggleSound} aria-pressed={soundOn}>
          {soundOn ? '音效開' : '音效關'}
        </button>
      </div>
      <span className="sr-only">{top >= 60 ? '有家人快要看穿你' : '觀察還在進行'}</span>
    </header>
  )
}

export function Stage({ state }: { state: GameState }) {
  const present = state.family.filter((member) => memberIsPresent(member, state))
  return (
    <section className={`scene scene-${state.location} phase-${state.phase}`} aria-label="現在的場景">
      <div className="window" aria-hidden="true">
        <div className="sky" />
      </div>
      <p className="caption">{sceneCaption(state)}</p>
      <div className="cast">
        <figure>
          <Chibi id="self" mood={state.humanity >= 40 ? 'ok' : 'watch'} />
          <figcaption>你</figcaption>
        </figure>
        {state.location === 'home' &&
          present.map((member) => (
            <figure key={member.id}>
              <Chibi id={member.id} mood={moodFromSuspicion(member.suspicion)} />
              <figcaption>{member.role}</figcaption>
            </figure>
          ))}
        {state.location === 'store' && (
          <figure className={state.npcs.find((npc) => npc.id === 'clerk')?.glitching ? 'glitch' : ''}>
            <Chibi id="clerk" />
            <figcaption>
              {state.npcs.find((npc) => npc.id === 'clerk')?.glitching ? '店員_03' : '店員'}
            </figcaption>
          </figure>
        )}
        {state.location === 'park' && (
          <>
            <figure className={state.npcs.find((npc) => npc.id === 'jogger')?.glitching ? 'glitch' : ''}>
              <Chibi id="jogger" />
              <figcaption>路人</figcaption>
            </figure>
            <figure className="cat" aria-hidden="true">
              <div className="cat-body" />
              <figcaption>貓</figcaption>
            </figure>
          </>
        )}
      </div>
    </section>
  )
}

export function Monitor({ state }: { state: GameState }) {
  const hot = state.family.some((member) => member.suspicion >= 60)
  return (
    <aside className={`monitor ${hot ? 'danger' : ''}`}>
      <p className="objective">{objectiveText(state)}</p>
      <h2>家人 · 會對答案</h2>
      <ul className="family-list">
        {state.family.map((member) => {
          const here = memberIsPresent(member, state)
          return (
            <li key={member.id}>
              <div className="who">
                <Chibi id={member.id} mood={moodFromSuspicion(member.suspicion)} />
                <div>
                  <strong>
                    {member.role} {member.name}
                  </strong>
                  <em className={here ? 'here' : 'away'}>{here ? '在場' : '不在'}</em>
                  <p>{member.trait}</p>
                </div>
              </div>
              <Bar label="懷疑" value={member.suspicion} tone={suspicionTone(member.suspicion)} />
              <Bar label="親近" value={member.affection} tone="love" />
              {member.notes.length > 0 && (
                <p className="note">記住了：{member.notes[member.notes.length - 1]!.text}</p>
              )}
            </li>
          )
        })}
      </ul>
      <h2>路上的人 · 不會學習</h2>
      <ul className="npc-list">
        {state.npcs.map((npc) => (
          <li key={npc.id} className={npc.glitching ? 'glitch' : ''}>
            <strong>
              {npc.glitching ? `${npc.name}_03` : npc.name}
              <span>{npc.role}</span>
            </strong>
            <ol>
              {npc.lines.map((line, index) => (
                <li key={`${npc.id}-${index}`} className={index === npc.lineIndex ? 'current' : ''}>
                  {line}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function ActionBar({
  state,
  onAction,
}: {
  state: GameState
  onAction: (id: string) => void
}) {
  const actions = availableActions(state).filter((action) => !action.hidden)
  return (
    <div className="actions" role="group" aria-label="這個時段可以做的事">
      {actions.map((action) => (
        <ActionButton key={action.id} action={action} onAction={onAction} />
      ))}
    </div>
  )
}

function ActionButton({ action, onAction }: { action: ActionOffer; onAction: (id: string) => void }) {
  return (
    <button
      type="button"
      className={action.id === 'confess' ? 'action danger' : 'action'}
      disabled={!action.enabled}
      onClick={() => onAction(action.id)}
    >
      <strong>{action.label}</strong>
      <span>{action.enabled ? action.detail : action.reason}</span>
    </button>
  )
}

export function Banner({ state }: { state: GameState }) {
  if (!state.banner) return null
  const bad = state.banner.deltas.some((delta) => delta.label.includes('懷疑') && delta.value > 0)
  return (
    <section className={`banner ${bad ? 'bad' : 'good'}`}>
      <h2>{state.banner.title}</h2>
      <p>{state.banner.text}</p>
      {state.banner.deltas.length > 0 && (
        <ul>
          {state.banner.deltas.map((delta) => (
            <li key={`${delta.label}-${delta.value}`} className={delta.value > 0 && delta.label.includes('懷疑') ? 'up' : delta.value < 0 ? 'down' : ''}>
              {delta.label} {delta.value > 0 ? `+${delta.value}` : delta.value}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function EventDialog({
  state,
  onChoice,
}: {
  state: GameState
  onChoice: (id: string) => void
}) {
  const event = state.pendingEvent
  if (!event) return null
  const audience = audienceFor(state, event.askerId)
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <div className="dialog-head">
          <Chibi id={event.speakerId} mood={event.askerId ? moodFromSuspicion(state.family.find((member) => member.id === event.askerId)?.suspicion ?? 0) : 'ok'} />
          <div>
            <p className="badge">{event.badge}</p>
            <h2 id="event-title">
              {event.speakerRole} · {event.speakerName}
            </h2>
            <p className="event-name">{event.title}</p>
          </div>
        </div>
        <p className="prompt">{event.prompt}</p>
        <blockquote>
          <span>只有你聽得見</span>
          {event.inner}
        </blockquote>
        <p className="audience">
          {audience.length === 0
            ? '沒有家人聽得見。這句話不會被記下來。'
            : `聽得見：${audience.map((item) => `${item.member.role}${item.direct ? '' : '（旁聽）'}`).join('、')}`}
        </p>
        <div className="choices">
          {event.choices.map((choice) => (
            <button key={choice.id} type="button" className="action" onClick={() => onChoice(choice.id)}>
              {choice.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
