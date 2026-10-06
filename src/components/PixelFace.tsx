import { useEffect, useRef } from 'react'
import { SPRITE_SIZE, spriteUrl } from '../world/pixels.ts'

/** 對話與標題用的南向全身。關掉平滑，點陣才不會被塗糊。 */
export function PixelFace({ id, scale = 2 }: { id: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = SPRITE_SIZE * scale
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = new Image()
    image.src = spriteUrl(id, 'south')
    const paint = () => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(image, 0, 0, size, size)
    }
    if (image.complete && image.naturalWidth > 0) paint()
    else image.addEventListener('load', paint)
    return () => image.removeEventListener('load', paint)
  }, [id, scale, size])
  return (
    <canvas
      ref={ref}
      className="pixel-face"
      width={size}
      height={size}
      aria-hidden="true"
    />
  )
}
