/**
 * 結局門檻。
 * 這不是算分公式。懷疑值由模型決定，這裡只判斷這一週怎麼結束。
 */

export const EXPOSED_AT = 100
export const MEETING_AT = 68
export const MEETING_COUNT = 2
export const UNEASY_AT = 46

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
