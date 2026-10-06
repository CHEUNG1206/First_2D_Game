/**
 * 短促的方波提示。開羅那種按鍵聲，不載入音檔。
 * 瀏覽器要等使用者手勢才肯發聲，所以只從點擊呼叫。
 */

let context: AudioContext | null = null

function ctx(): AudioContext | null {
  const Ctx = window.AudioContext
  if (!Ctx) return null
  if (!context) context = new Ctx()
  if (context.state === 'suspended') void context.resume()
  return context
}

export function blip(kind: 'ui' | 'good' | 'bad' | 'night') {
  const audio = ctx()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  const now = audio.currentTime
  const tone = kind === 'bad' ? 180 : kind === 'night' ? 420 : kind === 'good' ? 660 : 520
  osc.type = 'square'
  osc.frequency.setValueAtTime(tone, now)
  gain.gain.setValueAtTime(0.04, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.09)
}
