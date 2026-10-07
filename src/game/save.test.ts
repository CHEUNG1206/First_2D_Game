import { describe, expect, it } from 'vitest'
import { beginWeek, createInitialState } from './engine.ts'
import { clearSave, loadGame, saveGame } from './save.ts'

function installStorage() {
  const box = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => box.get(key) ?? null,
    setItem: (key: string, value: string) => {
      box.set(key, value)
    },
    removeItem: (key: string) => {
      box.delete(key)
    },
    clear: () => box.clear(),
    key: (index: number) => [...box.keys()][index] ?? null,
    get length() {
      return box.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })
}

describe('save', () => {
  it('存檔讀回內容相同，舊形狀會被忽略', () => {
    installStorage()
    const state = beginWeek(createInitialState())
    saveGame(state)
    expect(loadGame()?.day).toBe(1)
    expect(loadGame()?.family[0]?.core.length).toBeGreaterThan(0)
    localStorage.setItem('ordinary-day:v2', JSON.stringify({ family: [{ name: '舊' }] }))
    expect(loadGame()).toBeNull()
    clearSave()
    expect(loadGame()).toBeNull()
  })
})
