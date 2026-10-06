import type { FamilyMember, Topic } from './types.ts'

/**
 * 懷疑公式。
 * 普通破綻先乘權重，再扣人味、熟悉、親近，但至少留一點痕跡。
 * 說破世界的加成分數不吃緩衝：被愛不能買通這一句。
 * 旁聽約六成，再依聽者有多在意這件事縮放。
 * 夜裡只在家人之間漂移與傳筆記。
 */

export const META_LEAK_BONUS = 24
export const OVERHEAR_RATIO = 0.6
export const DRIFT = 3
export const DRIFT_MIN_SUSPICION = 24
export const SHARE_GAIN_MIN = 4
export const SHARE_RATIO = 0.5
export const EXPOSED_AT = 100
export const MEETING_AT = 68
export const MEETING_COUNT = 2
export const UNEASY_AT = 46

const CUSHION_HUMANITY = 0.03
const CUSHION_FAMILIARITY = 0.02
const CUSHION_AFFECTION = 0.03

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** 四捨五入且 .5 遠離零，避免負向安撫被吃掉。 */
export function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n))
}

export function scoreSuspicion(input: {
  amount: number
  topic: Topic
  weights: Record<Topic, number>
  humanity: number
  familiarity: number
  affection: number
  metaLeak?: boolean
}): number {
  const weight = input.weights[input.topic]
  let weighted = input.amount * weight
  if (input.amount > 0) {
    const cushion =
      input.humanity * CUSHION_HUMANITY +
      input.familiarity * CUSHION_FAMILIARITY +
      input.affection * CUSHION_AFFECTION
    weighted = Math.max(1, weighted - cushion)
  }
  if (input.metaLeak) {
    weighted += META_LEAK_BONUS * input.weights.meta
  }
  return roundHalfAway(weighted)
}

export function overhearAmount(
  askerApplied: number,
  askerWeight: number,
  listenerWeight: number,
): number {
  if (askerWeight <= 0 || askerApplied === 0) return 0
  return roundHalfAway(askerApplied * OVERHEAR_RATIO * (listenerWeight / askerWeight))
}

/** 只有已經在意、而且今天沒被安撫的人，才會把空白當成證據。 */
export function pickDriftTarget(
  members: Pick<FamilyMember, 'id' | 'suspicion' | 'reassuredToday'>[],
): string | null {
  const pool = members.filter(
    (member) => !member.reassuredToday && member.suspicion >= DRIFT_MIN_SUSPICION,
  )
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => b.suspicion - a.suspicion)[0]!.id
}
