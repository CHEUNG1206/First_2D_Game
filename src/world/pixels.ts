/**
 * 上帝視角用的點陣小人。
 * 文字仍用一般字型，點陣只放在人身上，中文才不會糊成一顆顆方塊。
 * 每個字元是一格：o 外框、s 皮膚、h 頭髮、c 衣服、y 異色的眼睛。
 */

export const SPRITE_W = 16

const SELF = [
  '................',
  '.....hhhhhh.....',
  '....hhhhhhhh....',
  '...ohssssssho...',
  '..ohsseeysssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '.....oooooo.....',
  '....occccccco...',
  '...ocscccccsco..',
  '...ocscccccsco..',
  '....occcccco....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
]

const MOM = [
  '......ohho......',
  '.....ohhhho.....',
  '....ohssssho....',
  '...ohssssssho...',
  '..ohhsseesssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '....oppppppo....',
  '...opkcccckpo...',
  '...opccccccpo...',
  '...opsccccspo...',
  '....oppppppo....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
]

const DAD = [
  '................',
  '......hhhh......',
  '.....ohhhhho....',
  '....ohsssssho...',
  '...ohsssssssho..',
  '..ohsgwewgssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '....occccccco...',
  '...occccccccco..',
  '...ocscccccsco..',
  '....occcccco....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
]

const SISTER = [
  '.h............h.',
  '.hh..ohhhho..hh.',
  '..hhohsssshohh..',
  '..ohsseessssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '....occccccco...',
  '...ocscccccsco..',
  '...occccccccco..',
  '....occcccco....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
  '................',
  '................',
]

const CLERK = [
  '.....pppppp.....',
  '....pphhhpp.....',
  '...ohssssssho...',
  '..ohsseessssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '....occccccco...',
  '...ocscccccsco..',
  '...occccccccco..',
  '....occcccco....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
  '................',
  '................',
]

const JOGGER = [
  '.....pppppp.....',
  '....phhhhhp.....',
  '...ohssssssho...',
  '..ohsseessssho..',
  '..ohssssssssho..',
  '...ohssmmssho...',
  '....osssssso....',
  '....occccccco...',
  '...ocscccccsco..',
  '....occcccco....',
  '.....oszzso.....',
  '.....os..so.....',
  '....ob...bo.....',
  '................',
  '................',
  '................',
]

export const SPRITES: Record<string, string[]> = {
  self: SELF,
  mom: MOM,
  dad: DAD,
  sister: SISTER,
  clerk: CLERK,
  jogger: JOGGER,
}

const HAIR: Record<string, string> = {
  self: '#5a3a2a',
  mom: '#3a2a28',
  dad: '#2a241c',
  sister: '#6a3828',
  clerk: '#2a2420',
  jogger: '#243044',
}

const CLOTH: Record<string, string> = {
  self: '#6aaa5a',
  mom: '#fff6ea',
  dad: '#3d6ea8',
  sister: '#f0b429',
  clerk: '#ef6f4e',
  jogger: '#3aa89a',
}

const DARK: Record<string, string> = {
  self: '#4e8a40',
  mom: '#f3d7c4',
  dad: '#2c5282',
  sister: '#d4920d',
  clerk: '#d4533a',
  jogger: '#2a887c',
}

const ACCENT: Record<string, string> = {
  self: '#63f0dc',
  mom: '#e36b8a',
  dad: '#d7ecff',
  sister: '#ff8fb8',
  clerk: '#f7f1e4',
  jogger: '#f0b429',
}

function ink(id: string, pixel: string): string | null {
  if (pixel === '.') return null
  if (pixel === 'o' || pixel === 'e' || pixel === 'g') return '#2a1c14'
  if (pixel === 's') return '#ffd2b4'
  if (pixel === 'z') return '#f0b090'
  if (pixel === 'm') return '#e07a6a'
  if (pixel === 'w') return '#fffaf2'
  if (pixel === 'b') return '#3a2a24'
  if (pixel === 'h') return HAIR[id] ?? HAIR.self!
  if (pixel === 'c') return CLOTH[id] ?? CLOTH.self!
  if (pixel === 'k') return DARK[id] ?? DARK.self!
  if (pixel === 'y') return id === 'self' ? '#63f0dc' : '#2a1c14'
  if (pixel === 'p') return ACCENT[id] ?? ACCENT.mom!
  return null
}

/**
 * 把人畫在腳的位置。hop 是走路時的上下，單位是螢幕像素。
 * imageSmoothing 要先關掉，放大才會維持方塊。
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  scale: number,
  hop: number,
) {
  const rows = SPRITES[id] ?? SPRITES.self!
  const height = rows.length * scale
  const left = Math.round(x - (SPRITE_W * scale) / 2)
  const top = Math.round(y - height + hop)
  ctx.fillStyle = 'rgba(42,28,20,0.28)'
  ctx.fillRect(Math.round(x - 8), Math.round(y - 3), 16, 4)
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row] ?? ''
    for (let col = 0; col < line.length; col += 1) {
      const color = ink(id, line[col] ?? '.')
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(left + col * scale, top + row * scale, scale, scale)
    }
  }
}
