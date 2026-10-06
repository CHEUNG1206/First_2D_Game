import { useEffect, useRef } from 'react'
import { drawSprite, SPRITES, SPRITE_W } from '../world/pixels.ts'

/** 對話與標題用的放大頭像。關掉平滑，點陣才不會被塗糊。 */
export function PixelFace({ id, scale = 4 }: { id: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rows = SPRITES[id] ?? SPRITES.self!
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSprite(ctx, id, (SPRITE_W * scale) / 2, rows.length * scale, scale, 0)
  }, [id, scale, rows.length])
  return (
    <canvas
      ref={ref}
      className="pixel-face"
      width={SPRITE_W * scale}
      height={rows.length * scale}
      aria-hidden="true"
    />
  )
}
