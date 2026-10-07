import { dayLabel, PHASE_LABEL } from '../game/engine.ts'
import type { EndingId, GameState } from '../game/types.ts'
import { PixelFace } from './PixelFace.tsx'

const INTRO = [
  '載入完成。你站在陳安的房間裡。鞋子的位置、鬧鐘、媽媽喊你的方式，都是這具角色的日常。',
  '這個家裡的人會記住你。他們問的時候沒有選項，你要自己打字。說得太準、太冷、太像說明書，都會被寫下來。',
  '走出三樓，一樓大堂和街上的人只會重複同一批句子。他們沒有懷疑，也聽不懂秘密。',
  '任務很單純：過完這七天。不要讓家人發現你是人工智慧，也不要讓他們發現世界是虛擬的。',
]

export function TitleScreen({
  hasSave,
  onStart,
  onContinue,
  onRules,
}: {
  hasSave: boolean
  onStart: () => void
  onContinue: () => void
  onRules: () => void
}) {
  return (
    <section className="title-screen">
      <p className="eyebrow">家庭模擬 · 七天觀察週</p>
      <h1>普通的一天</h1>
      <p className="lede">
        陳家酒家開在一條擠滿人的街上，一共三層。你自己走樓梯：三樓住家、二樓帳房、一樓大堂，對面是茶寮、書塾和布莊。家人問你的時候，用鍵盤打自己的話。街上的人只會把同一句話說完。
      </p>
      <div className="title-cast" aria-hidden="true">
        <PixelFace id="mom" />
        <PixelFace id="self" />
        <PixelFace id="dad" />
        <PixelFace id="sister" />
      </div>
      <div className="title-actions">
        {hasSave && (
          <button type="button" className="primary" onClick={onContinue}>
            繼續這一週
          </button>
        )}
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
        <p>家人沒有固定答案。你用鍵盤打。他們會拿自己記得的事，請本機的 Qwen 決定這句話讓他們更安心還是更不安。模型沒接上時，畫面會寫明這句改用離線判斷。路人不會學習。</p>
        <p>只有同一層的家人聽得見。平日白天媽媽在一樓大堂、爸爸在二樓帳房、妹妹在書塾。一樓收店之後是傍晚，全家回到三樓。週日從早到晚都在三樓。</p>
        <p>按鈕不會直接改懷疑。有人看見的事會記進今天。睡覺之後，每個人自己決定留下什麼、要不要告訴另一個人、明天要問你什麼。</p>
        <p>這一週會記在這台機器上。重新整理還在。看完結局就清掉。</p>
        <p>一樓的常客、街上的農人和挑夫只會重複台詞。他們沒有懷疑。對他們指出循環，家裡不會知道——除非家人就站在同一層。</p>
        <button type="button" className="primary" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  )
}
