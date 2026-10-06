import { useEffect, useRef, useState } from 'react'
import { availableActions, objectiveText, waitingAskers } from '../game/engine.ts'
import { memberZone } from '../game/family.ts'
import type { GameState, LocationId } from '../game/types.ts'
import {
  COLS,
  CROWD,
  FLOOR_NAME,
  GRIDS,
  HOTSPOTS,
  INTERACT,
  ROWS,
  SIGNS,
  SPAWN,
  TILE,
  anchorFor,
  findPath,
  floorOf,
  isSolid,
  tileCenter,
  zoneAt,
  type Spot,
} from './town.ts'
import { drawSprite, facingFrom, type Facing } from './pixels.ts'

interface Actor {
  id: string
  name: string
  color: string
  x: number
  y: number
  tx: number
  ty: number
  path: Spot[]
  bob: number
  scripted: boolean
  loop: number
  facing: Facing
  sprite: string
  route: Spot[] | null
}

interface Floater {
  x: number
  y: number
  text: string
  life: number
  bad: boolean
}

interface Near {
  personId: string | null
  personName: string | null
  hotspotId: string | null
}

const BARKS: Record<string, string> = {
  mom: '媽媽看了你一眼，還沒開口問大事。',
  dad: '爸爸嗯了一聲，繼續看他的東西。',
  sister: '妹妹說：幹嘛，很閒喔。',
  clerk: '常客說：老闆，老樣子。表情沒有接上一次。',
  porter: '挑夫又喊了一次：讓一讓。',
  crier: '說書的又從同一句開頭。',
  jogger: '農人又說了一次：今天天氣不錯。',
}

/**
 * 俯視小鎮。玩家用方向鍵或點地走路，靠近人和家具才互動。
 * 家人會自己走到班表上的位置；路人只繞圈。
 */
export function World({
  state,
  locked,
  onAction,
  onTalk,
  onVisit,
  onOpenFamily,
}: {
  state: GameState
  locked: boolean
  onAction: (id: string) => void
  onTalk: (id: string) => void
  onVisit: (location: LocationId) => void
  onOpenFamily: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: tileCenter(SPAWN).x, y: tileCenter(SPAWN).y })
  const face = useRef<Facing>('south')
  const floorRef = useRef(2)
  const [floor, setFloor] = useState(2)
  const keys = useRef(new Set<string>())
  const target = useRef<Spot | null>(null)
  const path = useRef<Spot[]>([])
  const actors = useRef<Actor[]>([])
  const floaters = useRef<Floater[]>([])
  const bark = useRef<{ text: string; life: number } | null>(null)
  const zone = useRef<LocationId>('home')
  const lockedRef = useRef(locked)
  const stateRef = useRef(state)
  const [near, setNear] = useState<Near>({ personId: null, personName: null, hotspotId: null })
  const nearKey = useRef('')
  const [localBark, setLocalBark] = useState<string | null>(null)

  lockedRef.current = locked
  stateRef.current = state

  useEffect(() => {
    if (!state.banner) return
    for (const delta of state.banner.deltas) {
      floaters.current.push({
        x: pos.current.x,
        y: pos.current.y - 28,
        text: `${delta.label} ${delta.value > 0 ? '+' : ''}${delta.value}`,
        life: 1,
        bad: delta.value > 0 && (delta.label.includes('懷疑') || delta.label.includes('旁聽')),
      })
    }
  }, [state.banner])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const key = event.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
        event.preventDefault()
      }
      if (key === ' ' || key === 'enter') {
        pressInteract()
        return
      }
      keys.current.add(key)
      target.current = null
      path.current = []
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function pressInteract() {
    if (lockedRef.current) return
    const current = nearKey.current
    const [personId, hotspotId] = current.split('|')
    if (personId === 'mom' || personId === 'dad' || personId === 'sister') {
      onTalk(personId)
      return
    }
    if (hotspotId) {
      const spot = HOTSPOTS.find((item) => item.id === hotspotId)
      const offer = availableActions(stateRef.current).find(
        (action) => action.enabled && spot?.actions.includes(action.id),
      )
      if (offer) {
        onAction(offer.id)
        return
      }
    }
    if (personId && BARKS[personId]) {
      bark.current = { text: BARKS[personId]!, life: 1 }
      setLocalBark(BARKS[personId]!)
    }
  }

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      step(dt)
      draw()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  function step(dt: number) {
    if (!lockedRef.current) movePlayer(dt)
    moveActors(dt)
    const tileX = Math.floor(pos.current.x / TILE)
    const tileY = Math.floor(pos.current.y / TILE)
    const nextZone = zoneAt(tileX, tileY, floorRef.current)
    if (nextZone !== zone.current) {
      zone.current = nextZone
      onVisit(nextZone)
    }
    rememberNearby()
    for (const floater of floaters.current) {
      floater.y -= 18 * dt
      floater.life -= dt * 0.45
    }
    floaters.current = floaters.current.filter((floater) => floater.life > 0)
    if (bark.current) {
      bark.current.life -= dt * 0.35
      if (bark.current.life <= 0) {
        bark.current = null
        setLocalBark(null)
      }
    }
  }

  function movePlayer(dt: number) {
    let dx = 0
    let dy = 0
    if (keys.current.has('arrowleft') || keys.current.has('a')) dx -= 1
    if (keys.current.has('arrowright') || keys.current.has('d')) dx += 1
    if (keys.current.has('arrowup') || keys.current.has('w')) dy -= 1
    if (keys.current.has('arrowdown') || keys.current.has('s')) dy += 1
    const speed = 148
    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy) || 1
      tryMove((dx / length) * speed * dt, (dy / length) * speed * dt)
      return
    }
    const next = path.current[0]
    if (!next) return
    const goal = tileCenter(next)
    const vx = goal.x - pos.current.x
    const vy = goal.y - pos.current.y
    const dist = Math.hypot(vx, vy)
    if (dist < 4) {
      path.current.shift()
      return
    }
    tryMove((vx / dist) * speed * dt, (vy / dist) * speed * dt)
  }

  function tryMove(dx: number, dy: number) {
    face.current = facingFrom(dx, dy, face.current)
    const radius = 10
    if (!blocked(pos.current.x + dx, pos.current.y, radius)) pos.current.x += dx
    if (!blocked(pos.current.x, pos.current.y + dy, radius)) pos.current.y += dy
  }

  function blocked(x: number, y: number, radius: number): boolean {
    const points = [
      [x - radius, y - radius],
      [x + radius, y - radius],
      [x - radius, y + radius],
      [x + radius, y + radius],
    ]
    return points.some(([px, py]) => isSolid(Math.floor(px! / TILE), Math.floor(py! / TILE), floorRef.current))
  }

  function moveActors(dt: number) {
    const game = stateRef.current
    const here = floorRef.current
    const wanted = new Map<string, { name: string; color: string; spot: Spot; scripted: boolean; sprite: string; route: Spot[] | null }>()
    for (const member of game.family) {
      const zone = memberZone(member, game)
      if (floorOf(zone) !== here) continue
      const spot = anchorFor(member.id, zone)
      if (!spot) continue
      wanted.set(member.id, { name: member.role, color: member.color, spot, scripted: false, sprite: member.id, route: null })
    }
    if (here === 0) {
      const clerk = game.npcs.find((npc) => npc.id === 'clerk')
      if (clerk) {
        wanted.set('clerk', {
          name: clerk.glitching ? '常客_03' : clerk.name,
          color: '#ef6f4e',
          spot: anchorFor('clerk', 'store')!,
          scripted: true,
          sprite: 'clerk',
          route: null,
        })
      }
      for (const walker of CROWD) {
        wanted.set(walker.id, {
          name: walker.name,
          color: '#5eb0a0',
          spot: walker.loop[0]!,
          scripted: true,
          sprite: walker.sprite,
          route: walker.loop,
        })
      }
    }

    for (const actor of actors.current) {
      const goal = wanted.get(actor.id)
      if (!goal) continue
      actor.name = goal.name
      actor.sprite = goal.sprite
      actor.route = goal.route
      if (goal.route) {
        const loopSpot = goal.route[actor.loop % goal.route.length]!
        const center = tileCenter(loopSpot)
        const dist = Math.hypot(center.x - actor.x, center.y - actor.y)
        if (dist < 6) actor.loop += 1
        else stepToward(actor, center, 62 * dt)
      } else if (actor.tx !== goal.spot.x || actor.ty !== goal.spot.y) {
        actor.tx = goal.spot.x
        actor.ty = goal.spot.y
        const from = { x: Math.floor(actor.x / TILE), y: Math.floor(actor.y / TILE) }
        actor.path = findPath(from, goal.spot, here)
      }
      const stepSpot = actor.path[0]
      if (stepSpot && !goal.route) {
        const center = tileCenter(stepSpot)
        const dist = Math.hypot(center.x - actor.x, center.y - actor.y)
        if (dist < 4) actor.path.shift()
        else stepToward(actor, center, 78 * dt)
      }
      actor.bob += dt * 6
      wanted.delete(actor.id)
    }
    for (const [id, goal] of wanted) {
      const center = tileCenter(goal.spot)
      actors.current.push({
        id,
        name: goal.name,
        color: goal.color,
        x: center.x,
        y: center.y,
        tx: goal.spot.x,
        ty: goal.spot.y,
        path: [],
        bob: 0,
        scripted: goal.scripted,
        loop: 0,
        facing: 'south',
        sprite: goal.sprite,
        route: goal.route,
      })
    }
    actors.current = actors.current.filter((actor) => {
      if (actor.id === 'clerk' || CROWD.some((walker) => walker.id === actor.id)) return here === 0
      const member = game.family.find((item) => item.id === actor.id)
      return !!member && floorOf(memberZone(member, game)) === here
    })
  }

  function stepToward(actor: Actor, center: { x: number; y: number }, amount: number) {
    const vx = center.x - actor.x
    const vy = center.y - actor.y
    const dist = Math.hypot(vx, vy) || 1
    const stepAmount = Math.min(amount, dist)
    actor.facing = facingFrom(vx, vy, actor.facing)
    actor.x += (vx / dist) * stepAmount
    actor.y += (vy / dist) * stepAmount
  }

  function rememberNearby() {
    let personId: string | null = null
    let personName: string | null = null
    let best = INTERACT
    for (const actor of actors.current) {
      const dist = Math.hypot(actor.x - pos.current.x, actor.y - pos.current.y)
      if (dist < best) {
        best = dist
        personId = actor.id
        personName = actor.name
      }
    }
    let hotspotId: string | null = null
    let spotBest = INTERACT
    for (const spot of HOTSPOTS) {
      if (spot.floor !== floorRef.current) continue
      const center = tileCenter(spot)
      const dist = Math.hypot(center.x - pos.current.x, center.y - pos.current.y)
      if (dist < spotBest) {
        spotBest = dist
        hotspotId = spot.id
      }
    }
    const key = `${personId ?? ''}|${hotspotId ?? ''}`
    if (key !== nearKey.current) {
      nearKey.current = key
      setNear({ personId, personName, hotspotId })
    }
  }

  function draw() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const width = wrap.clientWidth
    const height = wrap.clientHeight
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.imageSmoothingEnabled = false
    const camX = clampCam(pos.current.x - width / 2, COLS * TILE - width)
    const camY = clampCam(pos.current.y - height / 2, ROWS * TILE - height)
    ctx.clearRect(0, 0, width, height)
    const x0 = Math.max(0, Math.floor(camX / TILE))
    const y0 = Math.max(0, Math.floor(camY / TILE))
    const x1 = Math.min(COLS - 1, Math.floor((camX + width) / TILE) + 1)
    const y1 = Math.min(ROWS - 1, Math.floor((camY + height) / TILE) + 1)
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        drawTile(ctx, x, y, x * TILE - camX, y * TILE - camY, floorRef.current)
      }
    }
    const askers = new Set(waitingAskers(stateRef.current))
    for (const sign of SIGNS) {
      if (sign.floor !== floorRef.current) continue
      drawName(ctx, sign.text, sign.x * TILE + TILE / 2 - camX, sign.y * TILE - camY)
    }
    const people = [
      ...actors.current.map((actor) => ({
        id: actor.sprite,
        name: actor.name,
        x: actor.x,
        y: actor.y,
        bob: actor.bob,
        facing: actor.facing,
      })),
      { id: 'self', name: '你', x: pos.current.x, y: pos.current.y, bob: performance.now() / 180, facing: face.current },
    ].sort((a, b) => a.y - b.y)
    for (const person of people) {
      const hop = Math.round(Math.sin(person.bob) * 2)
      drawSprite(ctx, person.id, person.x - camX, person.y - camY, person.facing, hop)
      drawName(ctx, person.name, person.x - camX, person.y - camY - 52)
      if (askers.has(person.id)) drawBang(ctx, person.x - camX, person.y - camY - 68)
    }
    for (const floater of floaters.current) {
      ctx.globalAlpha = Math.max(0, floater.life)
      ctx.fillStyle = floater.bad ? '#c4452d' : '#2f8d45'
      ctx.font = '700 14px "Noto Sans TC", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(floater.text, floater.x - camX, floater.y - camY)
      ctx.globalAlpha = 1
    }
    if (bark.current) {
      drawBubble(ctx, bark.current.text, pos.current.x - camX, pos.current.y - camY - 62)
    }
  }

  function clickMap(event: React.MouseEvent<HTMLCanvasElement>) {
    if (lockedRef.current) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = canvas.getBoundingClientRect()
    const width = wrap.clientWidth
    const height = wrap.clientHeight
    const camX = clampCam(pos.current.x - width / 2, COLS * TILE - width)
    const camY = clampCam(pos.current.y - height / 2, ROWS * TILE - height)
    const worldX = event.clientX - rect.left + camX
    const worldY = event.clientY - rect.top + camY
    const spot = { x: Math.floor(worldX / TILE), y: Math.floor(worldY / TILE) }
    if (isSolid(spot.x, spot.y, floorRef.current)) return
    const from = { x: Math.floor(pos.current.x / TILE), y: Math.floor(pos.current.y / TILE) }
    path.current = findPath(from, spot, floorRef.current)
    target.current = spot
  }

  function goFloor(next: number, x: number, y: number) {
    floorRef.current = next
    setFloor(next)
    pos.current = tileCenter({ x, y })
    path.current = []
    const nextZone = zoneAt(x, y, next)
    zone.current = nextZone
    onVisit(nextZone)
  }

  const hotspot = HOTSPOTS.find((item) => item.id === near.hotspotId && item.floor === floor)
  const offers = availableActions(state).filter(
    (action) => action.enabled && !action.hidden && hotspot?.actions.includes(action.id),
  )
  const familyNear = near.personId === 'mom' || near.personId === 'dad' || near.personId === 'sister'
  const canHang = near.personId === 'sister' && availableActions(state).some((action) => action.id === 'with_sister' && action.enabled)

  return (
    <div className="world-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="world" onClick={clickMap} aria-label="俯視小鎮，方向鍵移動，空白鍵互動" />
      <div className="map-hud">
        <p>
          {FLOOR_NAME[floor]} · {objectiveText(state)}
        </p>
        <button type="button" className="text-btn" onClick={onOpenFamily}>
          家人筆記
        </button>
      </div>
      <div className="suspect-row">
        {state.family.map((member) => (
          <span key={member.id} className={member.suspicion >= 50 ? 'hot' : ''}>
            {member.role} {member.suspicion}
          </span>
        ))}
      </div>
      <div className="dpad" aria-hidden="true">
        <button type="button" onPointerDown={() => keys.current.add('arrowup')} onPointerUp={() => keys.current.delete('arrowup')} onPointerLeave={() => keys.current.delete('arrowup')}>上</button>
        <button type="button" onPointerDown={() => keys.current.add('arrowleft')} onPointerUp={() => keys.current.delete('arrowleft')} onPointerLeave={() => keys.current.delete('arrowleft')}>左</button>
        <button type="button" onPointerDown={() => keys.current.add('arrowdown')} onPointerUp={() => keys.current.delete('arrowdown')} onPointerLeave={() => keys.current.delete('arrowdown')}>下</button>
        <button type="button" onPointerDown={() => keys.current.add('arrowright')} onPointerUp={() => keys.current.delete('arrowright')} onPointerLeave={() => keys.current.delete('arrowright')}>右</button>
      </div>
      <div className="interact-bar">
        {familyNear && (
          <button type="button" className="action" onClick={() => onTalk(near.personId!)}>
            跟{near.personName}說話
          </button>
        )}
        {canHang && (
          <button type="button" className="action" onClick={() => onAction('with_sister')}>
            跟妹妹鬧一下
          </button>
        )}
        {!familyNear && near.personId && (
          <button type="button" className="action" onClick={pressInteract}>
            跟{near.personName}搭話
          </button>
        )}
        {hotspot?.stair != null && (
          <button type="button" className="action" onClick={() => goFloor(hotspot.stair!, hotspot.x, hotspot.y)}>
            {hotspot.label}
          </button>
        )}
        {offers.map((action) => (
          <button key={action.id} type="button" className={action.id === 'confess' ? 'action danger' : 'action'} onClick={() => onAction(action.id)}>
            {action.label}
          </button>
        ))}
        {!familyNear && !canHang && !near.personId && offers.length === 0 && (
          <span className="hint">方向鍵或點地走路。靠近人和家具會出現互動。</span>
        )}
        {localBark && <span className="hint">{localBark}</span>}
      </div>
    </div>
  )
}

function clampCam(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, floor: number) {
  const tile = GRIDS[floor]![y]![x]!
  const alt = (x + y) % 2 === 0
  const paint = (color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(px, py, TILE, TILE)
  }
  if (tile === 'grass') {
    paint(alt ? '#7dce57' : '#6fbe4c')
    ctx.fillStyle = alt ? '#8ed86a' : '#63b344'
    ctx.fillRect(px + 4, py + 8, 4, 4)
    ctx.fillRect(px + 22, py + 20, 4, 4)
  }
  else if (tile === 'path') paint(alt ? '#e7d3a4' : '#dcc392')
  else if (tile === 'road') paint(alt ? '#d8c39a' : '#cdb488')
  else if (tile === 'floor') paint(alt ? '#e8bc74' : '#deaf68')
  else if (tile === 'tile') paint(alt ? '#f4efe4' : '#e7e0d2')
  else if (tile === 'void') paint('#1c140f')
  else if (tile === 'wall') {
    const inn = x >= 14 && x <= 35 && y >= 4 && y <= 19
    const red = floor === 0 && inn
    const indigo = floor === 1
    paint(red ? '#7a2e2a' : indigo ? '#3d4f74' : '#8a5234')
    ctx.fillStyle = red ? '#f0d2a4' : indigo ? '#d5deee' : '#f0d2a4'
    ctx.fillRect(px, py + 6, TILE, TILE - 8)
    ctx.fillStyle = red ? '#f0b429' : indigo ? '#243656' : '#6b3e24'
    ctx.fillRect(px, py, TILE, 8)
  }
  else if (tile === 'stair') {
    paint(floor === 1 ? '#d5deee' : '#e8bc74')
    ctx.fillStyle = '#4a2c1a'
    for (let step = 0; step < 4; step += 1) ctx.fillRect(px + 4, py + 6 + step * 6, 24, 3)
  }
  else if (tile === 'pillar') {
    paint(floor === 0 ? '#e8bc74' : '#d5deee')
    ctx.fillStyle = floor === 0 ? '#7a2e2a' : '#3d4f74'
    ctx.fillRect(px + 10, py + 4, 12, 24)
    ctx.fillStyle = '#f0b429'
    ctx.fillRect(px + 8, py + 2, 16, 4)
  }
  else if (tile === 'lantern') {
    paint(alt ? '#e7d3a4' : '#dcc392')
    ctx.fillStyle = '#4a2c1a'
    ctx.fillRect(px + 14, py + 10, 4, 16)
    ctx.fillStyle = '#e23b2f'
    ctx.fillRect(px + 8, py + 4, 16, 10)
  }
  else if (tile === 'water') paint(alt ? '#67c4e0' : '#54b4d4')
  else if (tile === 'tree') {
    paint(alt ? '#7dce57' : '#6fbe4c')
    ctx.fillStyle = '#6d4a2c'
    ctx.fillRect(px + 13, py + 16, 6, 12)
    ctx.fillStyle = '#2f8a3a'
    ctx.beginPath()
    ctx.arc(px + 16, py + 14, 12, 0, Math.PI * 2)
    ctx.fill()
  }
  else if (tile === 'table') {
    paint(alt ? '#e8bc74' : '#deaf68')
    ctx.fillStyle = '#c9844a'
    ctx.fillRect(px + 4, py + 8, 24, 16)
    ctx.strokeStyle = '#4a2c1a'
    ctx.strokeRect(px + 4.5, py + 8.5, 23, 15)
  }
  else if (tile === 'bed') {
    paint(alt ? '#e8bc74' : '#deaf68')
    ctx.fillStyle = '#f4f7fb'
    ctx.fillRect(px + 6, py + 4, 20, 10)
    ctx.fillStyle = '#e36b8a'
    ctx.fillRect(px + 6, py + 14, 20, 14)
  }
  else if (tile === 'counter') {
    paint('#d8c39a')
    ctx.fillStyle = '#efe6d6'
    ctx.fillRect(px + 2, py + 6, 28, 18)
    ctx.fillStyle = '#4a2c1a'
    ctx.fillRect(px + 2, py + 6, 28, 4)
  }
  else if (tile === 'sofa') {
    paint(alt ? '#e8bc74' : '#deaf68')
    ctx.fillStyle = '#e07a8a'
    ctx.fillRect(px + 4, py + 8, 24, 16)
    ctx.fillStyle = '#c45b70'
    ctx.fillRect(px + 4, py + 8, 24, 5)
  }
  else if (tile === 'shelf') {
    paint(alt ? '#e8bc74' : '#deaf68')
    ctx.fillStyle = '#8a5a32'
    ctx.fillRect(px + 6, py + 6, 20, 20)
    ctx.fillStyle = '#f0d8a0'
    ctx.fillRect(px + 9, py + 9, 14, 4)
    ctx.fillRect(px + 9, py + 16, 14, 4)
  }
  else if (tile === 'bench') {
    paint(alt ? '#7dce57' : '#6fbe4c')
    ctx.fillStyle = '#c9844a'
    ctx.fillRect(px + 4, py + 12, 24, 8)
    ctx.fillStyle = '#4a2c1a'
    ctx.fillRect(px + 6, py + 20, 4, 6)
    ctx.fillRect(px + 22, py + 20, 4, 6)
  }
  if (tile === 'road' && y === 22) {
    ctx.fillStyle = '#f4efe4'
    ctx.fillRect(px + 6, py + 14, 10, 4)
  }
}

function drawName(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.font = '700 12px "Noto Sans TC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  const width = ctx.measureText(name).width + 8
  ctx.fillStyle = 'rgba(255,246,228,0.92)'
  ctx.fillRect(x - width / 2, y - 14, width, 16)
  ctx.fillStyle = '#3b2415'
  ctx.fillText(name, x, y)
}

function drawBang(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#f0b429'
  ctx.beginPath()
  ctx.arc(x, y, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#4a2c1a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#3b2415'
  ctx.font = '700 14px "Noto Sans TC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', x, y + 1)
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '700 13px "Noto Sans TC", sans-serif'
  const width = Math.min(280, ctx.measureText(text).width + 16)
  ctx.fillStyle = '#fffaf0'
  ctx.strokeStyle = '#4a2c1a'
  ctx.lineWidth = 3
  ctx.fillRect(x - width / 2, y - 18, width, 28)
  ctx.strokeRect(x - width / 2, y - 18, width, 28)
  ctx.fillStyle = '#3b2415'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y - 4)
}
