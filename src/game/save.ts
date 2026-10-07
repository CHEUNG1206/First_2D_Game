import type { GameState } from './types.ts'

/** 存檔版本。舊的記憶形狀讀不回來就當成沒有存檔。 */
const KEY = 'ordinary-day:v2'

function storage(): Storage | null {
  const box = (globalThis as { localStorage?: Storage }).localStorage
  return box ?? null
}

function isSave(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<GameState>
  if (!Array.isArray(row.family) || row.family.length === 0) return false
  const member = row.family[0] as { core?: unknown; learned?: unknown; today?: unknown }
  return Array.isArray(member.core) && Array.isArray(member.learned) && Array.isArray(member.today)
}

export function saveGame(state: GameState): void {
  const box = storage()
  if (!box) return
  box.setItem(KEY, JSON.stringify(state))
}

export function loadGame(): GameState | null {
  const box = storage()
  if (!box) return null
  const raw = box.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isSave(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearSave(): void {
  storage()?.removeItem(KEY)
}
