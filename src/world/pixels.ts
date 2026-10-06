/**
 * 地圖上的人用 PixelLab 匯出的 48×48 八方向圖。
 * 圖檔來自使用者的角色庫，腳底幾乎貼著畫布下緣，所以把圖的底邊對準站立點。
 * 方向名跟匯出檔一致：south 朝畫面下方。
 */

export const SPRITE_SIZE = 48

export const FACINGS = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const

export type Facing = (typeof FACINGS)[number]

/** 遊戲裡的人對上哪一組圖。店員用綢緞婦人，繞圈的路人用扛鋤頭的農人。 */
export const CAST = ['self', 'mom', 'dad', 'sister', 'clerk', 'jogger'] as const

const files = import.meta.glob('./sprites/*/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const URLS: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) {
  const match = path.match(/\.\/sprites\/([^/]+)\/([^/]+)\.png$/)
  if (!match) continue
  URLS[`${match[1]}/${match[2]}`] = url
}

const cache = new Map<string, HTMLImageElement>()

export function spriteUrl(id: string, facing: Facing): string {
  return URLS[`${id}/${facing}`] ?? URLS['self/south'] ?? ''
}

/**
 * 速度向量換成八方向。畫面 y 向下，所以南方是正 dy。
 * 沒有在動就留著上一個方向，避免停下來被甩回正面。
 */
export function facingFrom(dx: number, dy: number, previous: Facing = 'south'): Facing {
  if (dx === 0 && dy === 0) return previous
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  return FACINGS[(octant + 8) % 8] ?? previous
}

function frame(id: string, facing: Facing): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  const key = `${id}/${facing}`
  let image = cache.get(key)
  if (!image) {
    image = new Image()
    image.src = spriteUrl(id, facing)
    cache.set(key, image)
  }
  return image
}

/**
 * 把人畫在腳的位置。hop 是走路時的上下，單位是螢幕像素。
 * scale 用整數，點陣才不會在半格上糊掉。
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  facing: Facing,
  hop: number,
  scale = 1,
) {
  const image = frame(id, facing)
  if (!image || !image.complete || image.naturalWidth === 0) return
  const size = SPRITE_SIZE * scale
  const left = Math.round(x - size / 2)
  const top = Math.round(y - size + hop)
  ctx.fillStyle = 'rgba(42,28,20,0.28)'
  ctx.fillRect(Math.round(x - 10), Math.round(y - 3), 20, 4)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, left, top, size, size)
}
