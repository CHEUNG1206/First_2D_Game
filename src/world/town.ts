import type { LocationId } from '../game/types.ts'

/**
 * 一條擠滿人的街。陳家酒家佔北邊，三層用樓梯相連。
 * 一樓是大堂，二樓是雅間和帳房，三樓是住家。
 * 街南邊是別人的屋子：茶寮、書塾、布莊。
 */

export const COLS = 48
export const ROWS = 36
export const TILE = 32
export const INTERACT = 76
export const FLOOR_COUNT = 3

export const FLOOR_NAME = ['一樓大堂', '二樓雅間', '三樓住家'] as const

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
  | 'stair'
  | 'pillar'
  | 'lantern'
  | 'void'

const SOLID = new Set<Tile>([
  'wall',
  'water',
  'tree',
  'table',
  'bed',
  'counter',
  'sofa',
  'shelf',
  'bench',
  'pillar',
  'void',
])

export interface Spot {
  x: number
  y: number
}

export interface Hotspot {
  id: string
  x: number
  y: number
  floor: number
  label: string
  actions: string[]
  /** 這格樓梯通往的樓層。 */
  stair?: number
}

export interface Walker {
  id: string
  name: string
  sprite: string
  loop: Spot[]
}

export const SPAWN: Spot = { x: 26, y: 8 }

const INN = { x: 14, y: 4, w: 22, h: 16 }

function blank(fill: Tile): Tile[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => fill))
}

function carve(
  grid: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
  floor: Tile,
  doorX: number | null,
  doorOnNorth: boolean,
) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const edge = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1
      grid[yy]![xx] = edge ? 'wall' : floor
    }
  }
  if (doorX == null) return
  const doorY = doorOnNorth ? y : y + h - 1
  grid[doorY]![doorX] = 'path'
}

function edgeTrees(grid: Tile[][]) {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[y]![x] = 'tree'
    }
  }
}

function layStreet(grid: Tile[][]) {
  for (let x = 1; x < COLS - 1; x += 1) {
    grid[20]![x] = 'path'
    grid[21]![x] = 'road'
    grid[22]![x] = 'road'
    grid[23]![x] = 'road'
    grid[24]![x] = 'path'
    grid[25]![x] = 'path'
  }
  for (const x of [6, 12, 18, 28, 36, 42]) {
    grid[20]![x] = 'lantern'
    grid[25]![x] = 'lantern'
  }
}

function buildStreet(): Tile[][] {
  const grid = blank('grass')
  edgeTrees(grid)
  layStreet(grid)
  carve(grid, INN.x, INN.y, INN.w, INN.h, 'floor', 24, false)
  grid[14]![31] = 'stair'
  for (const spot of [
    [18, 8],
    [30, 8],
    [18, 14],
    [30, 14],
  ] as const) {
    grid[spot[1]]![spot[0]] = 'pillar'
  }
  grid[7]![18] = 'counter'
  grid[10]![22] = 'table'
  grid[10]![28] = 'table'
  grid[14]![24] = 'table'
  carve(grid, 2, 26, 12, 8, 'floor', 7, true)
  grid[30]![6] = 'bench'
  carve(grid, 16, 26, 16, 8, 'tile', 23, true)
  grid[30]![20] = 'table'
  grid[30]![27] = 'shelf'
  carve(grid, 34, 26, 12, 8, 'tile', 39, true)
  grid[30]![38] = 'counter'
  return grid
}

function buildUpper(kind: 'office' | 'home'): Tile[][] {
  const grid = blank('void')
  carve(grid, INN.x, INN.y, INN.w, INN.h, kind === 'home' ? 'floor' : 'tile', null, false)
  if (kind === 'office') {
    grid[14]![31] = 'stair'
    grid[8]![16] = 'stair'
    grid[10]![22] = 'counter'
    grid[12]![28] = 'table'
    grid[6]![20] = 'shelf'
  } else {
    grid[8]![16] = 'stair'
    grid[8]![30] = 'bed'
    grid[12]![22] = 'table'
    grid[14]![26] = 'sofa'
    grid[12]![30] = 'shelf'
    grid[14]![18] = 'counter'
  }
  return grid
}

export const GRIDS: Tile[][][] = [buildStreet(), buildUpper('office'), buildUpper('home')]

export const HOTSPOTS: Hotspot[] = [
  { id: 'counter', x: 18, y: 7, floor: 0, label: '櫃檯', actions: ['serve', 'store_tea', 'store_pudding'] },
  { id: 'hall_table', x: 22, y: 10, floor: 0, label: '大堂餐桌', actions: ['breakfast', 'give_pudding'] },
  { id: 'stair_hall', x: 31, y: 14, floor: 0, label: '上二樓', actions: [], stair: 1 },
  { id: 'desk', x: 22, y: 10, floor: 1, label: '帳桌', actions: [] },
  { id: 'stair_mid_down', x: 31, y: 14, floor: 1, label: '下一樓', actions: [], stair: 0 },
  { id: 'stair_mid_up', x: 16, y: 8, floor: 1, label: '上三樓', actions: [], stair: 2 },
  { id: 'table', x: 22, y: 12, floor: 2, label: '餐桌', actions: ['eat_alone', 'dinner'] },
  { id: 'bed', x: 30, y: 8, floor: 2, label: '床', actions: ['sleep', 'journal', 'doze'] },
  { id: 'shelf', x: 30, y: 12, floor: 2, label: '相簿', actions: ['album'] },
  { id: 'sofa', x: 26, y: 14, floor: 2, label: '矮榻', actions: ['tv'] },
  { id: 'sink', x: 18, y: 14, floor: 2, label: '水槽', actions: ['chores', 'dishes'] },
  { id: 'stair_home', x: 16, y: 8, floor: 2, label: '下二樓', actions: [], stair: 1 },
  { id: 'bench', x: 6, y: 30, floor: 0, label: '茶寮', actions: ['park'] },
]

const ANCHORS: Record<string, Spot> = {
  'mom:home': { x: 24, y: 10 },
  'mom:store': { x: 22, y: 9 },
  'dad:home': { x: 24, y: 12 },
  'dad:office': { x: 24, y: 11 },
  'sister:home': { x: 28, y: 12 },
  'sister:school': { x: 23, y: 29 },
  clerk: { x: 20, y: 12 },
}

export function anchorFor(id: string, zone: LocationId): Spot | null {
  if (id === 'clerk') return ANCHORS.clerk ?? null
  return ANCHORS[`${id}:${zone}`] ?? null
}

export function floorOf(location: LocationId): number {
  if (location === 'home') return 2
  if (location === 'office') return 1
  return 0
}

function inside(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

export function zoneAt(x: number, y: number, floor = 0): LocationId {
  if (floor === 2 && inside(x, y, 15, 5, 34, 18)) return 'home'
  if (floor === 1 && inside(x, y, 15, 5, 34, 18)) return 'office'
  if (floor === 0 && inside(x, y, 15, 5, 34, 18)) return 'store'
  if (floor === 0 && x === 24 && y === 19) return 'store'
  if (floor === 0 && inside(x, y, 3, 27, 12, 32)) return 'park'
  if (floor === 0 && x === 7 && y === 26) return 'park'
  if (floor === 0 && inside(x, y, 17, 27, 30, 32)) return 'school'
  if (floor === 0 && x === 23 && y === 26) return 'school'
  return 'street'
}

export function isSolid(x: number, y: number, floor = 0): boolean {
  if (floor < 0 || floor >= FLOOR_COUNT) return true
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true
  return SOLID.has(GRIDS[floor]![y]![x]!)
}

export function tileCenter(spot: Spot): { x: number; y: number } {
  return { x: spot.x * TILE + TILE / 2, y: spot.y * TILE + TILE / 2 }
}

/** 四向步行。人與人之間不擋路，只有牆、柱、家具擋。樓層各自有牆。 */
export function findPath(from: Spot, to: Spot, floor = 0): Spot[] {
  const key = (spot: Spot) => `${spot.x},${spot.y}`
  if (isSolid(to.x, to.y, floor)) return []
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
      if (prev.has(key(next)) || isSolid(next.x, next.y, floor)) continue
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
  { x: 6, y: 22 },
  { x: 40, y: 22 },
  { x: 40, y: 23 },
  { x: 6, y: 23 },
]

export const CROWD: Walker[] = [
  { id: 'jogger', name: '農人', sprite: 'jogger', loop: JOGGER_LOOP },
  {
    id: 'porter',
    name: '挑夫',
    sprite: 'jogger',
    loop: [
      { x: 8, y: 21 },
      { x: 36, y: 21 },
      { x: 36, y: 24 },
      { x: 8, y: 24 },
    ],
  },
  {
    id: 'crier',
    name: '說書的',
    sprite: 'clerk',
    loop: [
      { x: 14, y: 22 },
      { x: 30, y: 22 },
      { x: 30, y: 25 },
      { x: 14, y: 25 },
    ],
  },
]

export const SIGNS: { text: string; x: number; y: number; floor: number }[] = [
  { text: '陳家酒家', x: 24, y: 5, floor: 0 },
  { text: '茶寮', x: 7, y: 27, floor: 0 },
  { text: '書塾', x: 23, y: 27, floor: 0 },
  { text: '布莊', x: 39, y: 27, floor: 0 },
  { text: '二樓雅間', x: 24, y: 6, floor: 1 },
  { text: '三樓住家', x: 24, y: 6, floor: 2 },
]
