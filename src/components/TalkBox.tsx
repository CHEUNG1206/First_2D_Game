import { useEffect, useRef, useState } from 'react'
import { askFamily } from '../game/ask.ts'
import { audienceFor } from '../game/family.ts'
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
}: {
  state: GameState
  onSpoken: (judgment: SpeechJudgment) => void
  onLeave: () => void
}) {
  const event = state.pendingEvent
  if (!event) return null
  return <TalkSession key={event.id} state={state} scene={event} onSpoken={onSpoken} onLeave={onLeave} />
}

function TalkSession({
  state,
  scene,
  onSpoken,
  onLeave,
}: {
  state: GameState
  scene: GameEvent
  onSpoken: (judgment: SpeechJudgment) => void
  onLeave: () => void
}) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState<SpeechTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<SpeechJudgment['provider'] | null>(null)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const member = state.family.find((item) => item.id === scene.askerId)
  useEffect(() => {
    const node = logRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [lines])
  const audience = audienceFor(state, scene.askerId)

  async function send() {
    const playerText = text.trim()
    if (!playerText || busy) return
    setBusy(true)
    setFailed(false)
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
        notes: member?.notes.map((note) => note.text) ?? [],
        longTerm: member?.longTerm ?? [],
        shortTerm: member?.shortTerm ?? [],
        others: audience
          .filter((item) => !item.direct)
          .map((item) => ({
            id: item.member.id,
            name: item.member.name,
            role: item.member.role,
            trait: item.member.trait,
            suspicion: item.member.suspicion,
            longTerm: item.member.longTerm,
            shortTerm: item.member.shortTerm,
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
              {busy ? '在聽…' : '說出口'}
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
              ? '離線判斷。接上本機 Qwen 或 Grok 之後，會改由模型回答。'
              : scene.inner}
        </p>
      </div>
    </section>
  )
}
