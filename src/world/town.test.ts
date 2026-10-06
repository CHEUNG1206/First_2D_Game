import { describe, expect, it } from 'vitest'
import { findPath, isSolid, SPAWN, zoneAt } from './town.ts'

describe('town', () => {
  it('家、店、公司、學校是不同的區域', () => {
    expect(zoneAt(10, 7)).toBe('home')
    expect(zoneAt(24, 8)).toBe('store')
    expect(zoneAt(40, 7)).toBe('office')
    expect(zoneAt(40, 25)).toBe('school')
    expect(zoneAt(10, 24)).toBe('park')
    expect(zoneAt(10, 15)).toBe('street')
  })

  it('從家裡的床邊走得到便利商店櫃檯前', () => {
    const path = findPath(SPAWN, { x: 24, y: 8 })
    expect(path.length).toBeGreaterThan(5)
    expect(path.every((step) => !isSolid(step.x, step.y))).toBe(true)
  })

  it('也走得到學校門口', () => {
    const path = findPath(SPAWN, { x: 39, y: 21 })
    expect(path.length).toBeGreaterThan(5)
  })
})