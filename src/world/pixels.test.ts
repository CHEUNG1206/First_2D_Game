import { describe, expect, it } from 'vitest'
import { CAST, FACINGS, facingFrom, spriteUrl } from './pixels.ts'

describe('tang sprites', () => {
  it('每個人都有八個方向，而且圖檔不共用', () => {
    const seen = new Set<string>()
    for (const id of CAST) {
      for (const facing of FACINGS) {
        const url = spriteUrl(id, facing)
        expect(url, `${id}/${facing}`).toMatch(/\.png/)
        seen.add(url)
      }
    }
    expect(seen.size).toBe(CAST.length * FACINGS.length)
  })

  it('速度對上八個方向，站住時方向不變', () => {
    expect(facingFrom(1, 0)).toBe('east')
    expect(facingFrom(1, 1)).toBe('south-east')
    expect(facingFrom(0, 1)).toBe('south')
    expect(facingFrom(-1, 1)).toBe('south-west')
    expect(facingFrom(-1, 0)).toBe('west')
    expect(facingFrom(-1, -1)).toBe('north-west')
    expect(facingFrom(0, -1)).toBe('north')
    expect(facingFrom(1, -1)).toBe('north-east')
    expect(facingFrom(0, 0, 'west')).toBe('west')
  })
})
