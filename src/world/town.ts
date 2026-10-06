import type { LocationId } from '../game/types.ts'

/**
 * 開羅式剖視小鎮：沒有屋頂，牆是矮的，家、店、公司、學校、公園連在同一張地圖上。
 * 人用走的進出。路人只沿著固定路線晃。
 */

export const COLS = 48
export const ROWS = 36
export const TILE = 32
export const INTERACT = 52

export type Tile =
  | 'grass'
  | 'path'
  | 'road'
  | 'floor'
  | 'tile'
  | 'wall'
  | 'water'
  | 'tree'
  | 'table'
  | 'bed'
  | 'counter'
  | 'sofa'
  | 'shelf'
  | 'bench'

const SOLID = new Set<Tile>(['wall', 'water', 'tree', 'table', 'bed', 'counter', 'sofa', 'shelf', 'bench'])

export interface Spot {
  x: number
  y: number
}

export interface Hotspot {
  id: string
  x: number
  y: number
  label: string
  actions: string[]
}

export const SPAWN: Spot = { x: 10, y: 7 }

function carveBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
  floor: Tile,
  doorX: number,
) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1
      grid[yy]![xx] = edge ? 'wall' : floor
    }
  }
  grid[y + h - 1]![doorX] = 'path'
}

function buildGrid(): Tile[][] {
  const grid: Tile[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 'grass' as Tile))
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[y]![x] = 'tree'
    }
  }
  for (let x = 1; x < COLS - 1; x += 1) {
    grid[14]![x] = 'road'
    grid[15]![x] = 'road'
    grid[16]![x] = 'road'
    grid[13]![x] = 'path'
    grid[17]![x] = 'path'
  }
  carveBuilding(grid, 2, 2, 14, 11, 'floor', 8)
  carveBuilding(grid, 18, 2, 14, 11, 'tile', 24)
  carveBuilding(grid, 34, 2, 12, 11, 'floor', 39)
  carveBuilding(grid, 34, 20, 12, 13, 'floor', 39)
  grid[32]![39] = 'wall'
  grid[20]![39] = 'path'
  grid[18]![39] = 'path'
  grid[19]![39] = 'path'

  grid[5]![5] = 'table'
  grid[4]![12] = 'bed'
  grid[8]![12] = 'shelf'
  grid[9]![7] = 'sofa'
  grid[6]![24] = 'counter'
  grid[6]![40] = 'table'
  grid[24]![40] = 'table'
  grid[15]![12] = 'counter'
  for (let y = 26; y <= 29; y += 1) {
    for (let x = 6; x <= 11; x += 1) grid[y]![x] = 'water'
  }
  for (let x = 4; x <= 28; x += 1) grid[23]![x] = 'path'
  grid[24]![18] = 'bench'
  grid[30]![8] = 'tree'
  grid[28]![22] = 'tree'
  grid[32]![16] = 'tree'
  return grid
}

export const GRID: Tile[][] = buildGrid()

export const HOTSPOTS: Hotspot[] = [
  { id: 'table', x: 5, y: 5, label: '餐桌', actions: ['breakfast', 'eat_alone', 'dinner', 'give_pudding'] },
  { id: 'bed', x: 12, y: 4, label: '床', actions: ['sleep', 'journal', 'doze', 'confess'] },
  { id: 'shelf', x: 12, y: 8, label: '相簿', actions: ['album'] },
  { id: 'sofa', x: 7, y: 9, label: '沙發', actions: ['tv'] },
  { id: 'sink', x: 4, y: 8, label: '水槽', actions: ['chores', 'dishes'] },
  { id: 'counter', x: 24, y: 6, label: '收銀台', actions: ['store_tea', 'store_pudding'] },
  { id: 'bench', x: 18, y: 24, label: '長椅', actions: ['park'] },
]

const ANCHORS: Record<string, Spot> = {
  'mom:home': { x: 6, y: 6 },
  'mom:street': { x: 13, y: 15 },
  'dad:home': { x: 8, y: 10 },
  'dad:office': { x: 41, y: 7 },
  'sister:home': { x: 9, y: 8 },
  'sister:school': { x: 41, y: 25 },
  clerk: { x: 25, y: 5 },
}

export function anchorFor(id: string, zone: LocationId): Spot | null {
  if (id === 'clerk') return ANCHORS.clerk ?? null
  return ANCHORS[`${id}:${zone}`] ?? null
}

export function zoneAt(x: number, y: number): LocationId {
  if (x >= 3 && x <= 14 && y >= 3 && y <= 11) return 'home'
  if (x === 8 && y === 12) return 'home'
  if (x >= 19 && x <= 30 && y >= 3 && y <= 11) return 'store'
  if (x === 24 && y === 12) return 'store'
  if (x >= 35 && x <= 44 && y >= 3 && y <= 11) return 'office'
  if (x === 39 && y === 12) return 'office'
  if (x >= 35 && x <= 44 && y >= 21 && y <= 31) return 'school'
  if (x === 39 && y === 20) return 'school'
  if (x >= 2 && x <= 32 && y >= 18 && y <= 34) return 'park'
  return 'street'
}

export function isSolid(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true
  return SOLID.has(GRID[y]![x]!)
}

export function tileCenter(spot: Spot): { x: number; y: number } {
  return { x: spot.x * TILE + TILE / 2, y: spot.y * TILE + TILE / 2 }
}

/** 四向步行。人與人之間不擋路，只有牆、水、家具擋。 */
export function findPath(from: Spot, to: Spot): Spot[] {
  const key = (spot: Spot) => `${spot.x},${spot.y}`
  if (isSolid(to.x, to.y)) return []
  const queue: Spot[] = [from]
  const prev = new Map<string, Spot | null>([[key(from), null]])
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.x === to.x && current.y === to.y) break
    for (const dir of dirs) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      if (prev.has(key(next)) || isSolid(next.x, next.y)) continue
      prev.set(key(next), current)
      queue.push(next)
    }
  }
  if (!prev.has(key(to))) return []
  const path: Spot[] = []
  let cursor: Spot | null | undefined = to
  while (cursor) {
    path.push(cursor)
    cursor = prev.get(key(cursor))
  }
  path.reverse()
  return path
}

export const JOGGER_LOOP: Spot[] = [
  { x: 5, y: 23 },
  { x: 20, y: 23 },
  { x: 20, y: 32 },
  { x: 5, y: 32 },
]
