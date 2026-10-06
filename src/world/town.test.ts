import { describe, expect, it } from 'vitest'
import { findPath, floorOf, isSolid, SPAWN, zoneAt } from './town.ts'

describe('town', () => {
  it('酒家三層和街對面的屋子是不同的區域', () => {
    expect(zoneAt(26, 8, 2)).toBe('home')
    expect(zoneAt(24, 11, 1)).toBe('office')
    expect(zoneAt(22, 9, 0)).toBe('store')
    expect(zoneAt(23, 29, 0)).toBe('school')
    expect(zoneAt(6, 30, 0)).toBe('park')
    expect(zoneAt(24, 22, 0)).toBe('street')
    expect(floorOf('home')).toBe(2)
    expect(floorOf('office')).toBe(1)
    expect(floorOf('store')).toBe(0)
  })

  it('三樓床邊走得到下樓的樓梯', () => {
    const path = findPath(SPAWN, { x: 16, y: 8 }, 2)
    expect(path.length).toBeGreaterThan(3)
    expect(path.every((step) => !isSolid(step.x, step.y, 2))).toBe(true)
  })

  it('一樓門口走得到書塾和茶寮', () => {
    const school = findPath({ x: 24, y: 20 }, { x: 23, y: 27 }, 0)
    const tea = findPath({ x: 24, y: 20 }, { x: 7, y: 27 }, 0)
    expect(school.length).toBeGreaterThan(5)
    expect(tea.length).toBeGreaterThan(5)
  })

  it('二樓兩道樓梯互相走得到', () => {
    const path = findPath({ x: 16, y: 8 }, { x: 31, y: 14 }, 1)
    expect(path.length).toBeGreaterThan(5)
  })
})
