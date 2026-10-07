import { useEffect, useRef, useState } from 'react'
import { askFamily } from '../game/ask.ts'
import { audienceFor } from '../game/family.ts'
import { recall } from '../game/memory.ts'
import type { GameEvent, GameState, SpeechJudgment, SpeechTurn } from '../game/types.ts'
import { PixelFace } from './PixelFace.tsx'

const PROVIDER_LABEL = {
  ollama: '本機 Qwen',
  grok: 'Grok',
  offline: '離線判斷',
} as const

/**
 * 底部對話。開場白是家人的，回答由鍵盤打。
 * 可以連續講，先去忙不會把這一天用掉。
 */
export function TalkBox({
  state,
  onSpoken,
  onLeave,
  onChoice,
}: {
  state: GameState
  onSpoken: (judgment: SpeechJudgment) => void
  onLeave: () => void
  onChoice: (id: string) => void
}) {
  const event = state.pendingEvent
  if (!event) return null
  return <TalkSession key={event.id} state={state} scene={event} onSpoken={onSpoken} onLeave={onLeave} onChoice={onChoice} />
}

function TalkSession({
  state,
  scene,
  onSpoken,
  onLeave,
  onChoice,
}: {
  state: GameState
  scene: GameEvent
  onSpoken: (judgment: SpeechJudgment) => void
  onLeave: () => void
  onChoice: (id: string) => void
}) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState<SpeechTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<SpeechJudgment['provider'] | null>(null)
  const [failed, setFailed] = useState(false)
  const [waited, setWaited] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const member = state.family.find((item) => item.id === scene.askerId)
  useEffect(() => {
    const node = logRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [lines])
  const audience = audienceFor(state, scene.askerId)
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => setWaited((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  async function send() {
    const playerText = text.trim()
    if (!playerText || busy) return
    setBusy(true)
    setFailed(false)
    setWaited(0)
    setText('')
    try {
      const judgment = await askFamily({
        speakerId: scene.speakerId,
        speakerName: scene.speakerName,
        role: scene.speakerRole,
        trait: member?.trait ?? '',
        prompt: scene.prompt,
        playerText,
        history: lines,
        suspicion: member?.suspicion ?? 0,
        core: member?.core ?? [],
        learned: recall(member?.learned ?? [], playerText),
        today: member?.today.map((item) => item.text) ?? [],
        others: audience
          .filter((item) => !item.direct)
          .map((item) => ({
            id: item.member.id,
            name: item.member.name,
            role: item.member.role,
            trait: item.member.trait,
            suspicion: item.member.suspicion,
            core: item.member.core,
            learned: recall(item.member.learned, playerText),
            today: item.member.today.map((line) => line.text),
          })),
        day: state.day,
      })
      setLines((prev) => [
        ...prev,
        { role: 'player', text: playerText },
        { role: 'family', text: judgment.reply },
      ])
      setProvider(judgment.provider)
      onSpoken({ ...judgment, heard: playerText })
    } catch {
      setFailed(true)
      setText(playerText)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  if (scene.kind === 'confess') {
    return (
      <section className="talk-dock" role="dialog" aria-modal="true" aria-labelledby="talk-title">
        <div className="talk-portrait">
          <PixelFace id="self" />
          <p className="badge">{scene.badge}</p>
        </div>
        <div className="talk-body">
          <h2 id="talk-title">你 · {scene.speakerName}</h2>
          <p className="prompt">{scene.prompt}</p>
          <div className="talk-actions">
            {scene.choices.map((choice) => (
              <button key={choice.id} type="button" className={choice.ending ? 'primary danger' : 'primary'} onClick={() => onChoice(choice.id)}>
                {choice.text}
              </button>
            ))}
          </div>
          <p className="talk-hint">{scene.inner}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="talk-dock" role="dialog" aria-modal="true" aria-labelledby="talk-title">
      <div className="talk-portrait">
        <PixelFace id={scene.speakerId} />
        <p className="badge">{provider ? PROVIDER_LABEL[provider] : scene.badge}</p>
      </div>
      <div className="talk-body">
        <h2 id="talk-title">
          {scene.speakerRole} · {scene.speakerName}
        </h2>
        <p className="prompt">{scene.prompt}</p>
        <div className="talk-log" ref={logRef}>
          {lines.map((line, index) => (
            <p key={`${line.role}-${index}`} className={line.role === 'player' ? 'me' : 'them'}>
              <strong>{line.role === 'player' ? '你' : scene.speakerRole}</strong>
              {line.text}
            </p>
          ))}
        </div>
        <p className="audience">
          {audience.length === 0
            ? '沒有家人聽得見。這句話不會被記下來。'
            : `聽得見：${audience.map((item) => `${item.member.role}${item.direct ? '' : '（旁聽）'}`).join('、')}`}
        </p>
        <form
          className="talk-form"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            void send()
          }}
        >
          <label className="sr-only" htmlFor="talk-input">
            你的回答
          </label>
          <textarea
            id="talk-input"
            ref={inputRef}
            value={text}
            maxLength={200}
            rows={2}
            placeholder="用自己的話回答。Enter 送出。"
            autoFocus
            disabled={busy}
            onChange={(change) => setText(change.target.value)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter' && !keyEvent.shiftKey && !keyEvent.nativeEvent.isComposing) {
                keyEvent.preventDefault()
                void send()
              }
            }}
          />
          <div className="talk-actions">
            <button type="submit" className="primary" disabled={busy || text.trim().length === 0}>
              {busy ? `在聽… ${waited} 秒` : '說出口'}
            </button>
            <button type="button" className="text-btn" onClick={onLeave} disabled={busy}>
              先去忙
            </button>
          </div>
        </form>
        <p className="talk-hint">
          {failed
            ? '這句沒送成，再試一次。'
            : provider === 'offline'
              ? '模型沒接上，這句改用離線判斷。'
              : scene.inner}
        </p>
      </div>
    </section>
  )
}
