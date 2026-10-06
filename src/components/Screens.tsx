import { dayLabel, PHASE_LABEL } from '../game/engine.ts'
import type { EndingId, GameState } from '../game/types.ts'
import { PixelFace } from './PixelFace.tsx'

const INTRO = [
  '載入完成。你站在陳安的房間裡。鞋子的位置、鬧鐘、媽媽喊你的方式，都是這具角色的日常。',
  '這個家裡的人會記住你。他們問的時候沒有選項，你要自己打字。說得太準、太冷、太像說明書，都會被寫下來。',
  '走出這扇門，便利商店和公園的人只會重複同一批句子。他們沒有懷疑，也聽不懂秘密。',
  '任務很單純：過完這七天。不要讓家人發現你是人工智慧，也不要讓他們發現世界是虛擬的。',
]

export function TitleScreen({ onStart, onRules }: { onStart: () => void; onRules: () => void }) {
  return (
    <section className="title-screen">
      <p className="eyebrow">家庭模擬 · 七天觀察週</p>
      <h1>普通的一天</h1>
      <p className="lede">
        俯視的點陣小鎮。你自己走回家、便利商店、公園、公司和學校。家人問你的時候，用鍵盤打自己的話。街上的人只會把同一句話說完。
      </p>
      <div className="title-cast" aria-hidden="true">
        <PixelFace id="mom" />
        <PixelFace id="self" />
        <PixelFace id="dad" />
        <PixelFace id="sister" />
      </div>
      <div className="title-actions">
        <button type="button" className="primary" onClick={onStart}>
          開始這一週
        </button>
        <button type="button" className="text-btn" onClick={onRules}>
          先看規則
        </button>
      </div>
    </section>
  )
}

export function IntroScreen({ step, onNext }: { step: number; onNext: () => void }) {
  return (
    <section className="intro">
      <p className="eyebrow">
        載入 {step + 1} / {INTRO.length}
      </p>
      <h1>陳安</h1>
      <p className="lede">{INTRO[step]}</p>
      <button type="button" className="primary" onClick={onNext}>
        {step >= INTRO.length - 1 ? '走進客廳' : '繼續'}
      </button>
    </section>
  )
}

export function NightScreen({ state, onNext }: { state: GameState; onNext: () => void }) {
  const night = state.night
  if (!night) return null
  return (
    <section className="night-screen">
      <p className="eyebrow">
        {dayLabel(state.day)}夜裡 · 家人交換筆記
      </p>
      <h1>他們以為你睡了</h1>
      <div className="night-cast" aria-hidden="true">
        {state.family.map((member) => (
          <figure key={member.id}>
            <PixelFace id={member.id} />
            <figcaption>{member.role}</figcaption>
          </figure>
        ))}
      </div>
      <ul className="night-lines">
        {night.lines.map((line) => (
          <li key={line.text}>
            <strong>{line.speaker}</strong>
            <span>{line.text}</span>
          </li>
        ))}
      </ul>
      {night.deltas.length > 0 && (
        <ul className="delta-row">
          {night.deltas.map((delta) => (
            <li key={`${delta.label}-${delta.value}`}>
              {delta.label} {delta.value > 0 ? `+${delta.value}` : delta.value}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="primary" onClick={onNext}>
        {night.ending ? '看這一週的結果' : '睡到天亮'}
      </button>
    </section>
  )
}

const ENDING_TITLE: Record<EndingId, string> = {
  survived: '這週過完了',
  uneasy: '還坐在這裡',
  exposed: '對答案',
  meeting: '家人開會',
  confessed: '你自己說的',
}

export function EndingScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const ending = state.ending ?? 'uneasy'
  return (
    <section className={`ending ending-${ending}`}>
      <p className="eyebrow">{dayLabel(state.day)}{PHASE_LABEL[state.phase]}</p>
      <h1>{ENDING_TITLE[ending]}</h1>
      <div className="title-cast" aria-hidden="true">
        {state.family.map((member) => (
          <PixelFace key={member.id} id={member.id} />
        ))}
      </div>
      <p className="lede">{state.endingBlurb}</p>
      <ul className="ending-stats">
        {state.family.map((member) => (
          <li key={member.id}>
            {member.role} 懷疑 {member.suspicion}
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onRestart}>
        再過一週
      </button>
    </section>
  )
}

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="dialog rules" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <h2 id="rules-title">這一週的規則</h2>
        <p>這是一張俯視的點陣小鎮。方向鍵或點地走路，靠近人和家具再按互動。吃飯、說話都不會把一天用掉。回到床上睡，這一天才結束。</p>
        <p>家人沒有固定答案。你用鍵盤打。他們會先找本機的 Qwen，沒有再找 Grok，兩邊都不在就用離線判斷。路人不會學習，也不走這條路。</p>
        <p>只有在場的家人聽得見。平日媽媽在家、爸爸在公司、妹妹在學校。週日全部留在家裡。</p>
        <p>太完整、太空白，都會被記下來。把循環、場景、人工智慧說出口，緩衝也救不了。</p>
        <p>親近可以讓普通差錯輕一點，不能買通洩密。一起吃晚飯只加親近，不算把人安撫好。</p>
        <p>你睡了之後，已經在意你、卻今天沒被安撫的人，會把空白當成證據。上升夠多的筆記，會傳給白天不在場的家人。</p>
        <p>便利商店店員和農人只會重複台詞。他們沒有懷疑。對他們指出循環，家裡不會知道——除非家人就站在旁邊。</p>
        <button type="button" className="primary" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  )
}
