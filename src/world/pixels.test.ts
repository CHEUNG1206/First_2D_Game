import { describe, expect, it } from 'vitest'
import { SPRITES, SPRITE_W } from './pixels.ts'

describe('pixel sprites', () => {
  it('每個人都是一樣寬的點陣，而且長得不一樣', () => {
    const ids = ['self', 'mom', 'dad', 'sister', 'clerk', 'jogger']
    const seen = new Set<string>()
    for (const id of ids) {
      const rows = SPRITES[id]
      expect(rows, id).toBeTruthy()
      expect(rows!.length).toBeGreaterThan(12)
      for (const row of rows!) expect(row, `${id}:${row}`).toHaveLength(SPRITE_W)
      seen.add(rows!.join(''))
    }
    expect(seen.size).toBe(ids.length)
  })
})
