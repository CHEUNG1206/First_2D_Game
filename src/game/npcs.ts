import type { ScriptedNpc } from './types.ts'

/**
 * 路人名冊。台詞會循環，播完一輪就把 glitching 打開。
 * 這裡沒有懷疑、沒有筆記、沒有權重。
 */
export function createNpcs(): ScriptedNpc[] {
  return [
    {
      id: 'clerk',
      name: '小吳',
      role: '便利商店店員',
      location: 'store',
      lines: ['歡迎光臨。', '歡迎光臨。', '塑膠袋需要嗎？'],
      lineIndex: 0,
      glitching: false,
    },
    {
      id: 'jogger',
      name: '慢跑的人',
      role: '路人',
      location: 'park',
      lines: ['今天天氣不錯。', '今天天氣不錯。', '今天天氣不錯喔。'],
      lineIndex: 0,
      glitching: false,
    },
  ]
}

/** 播放頭前進。回到第一句時標記循環，方便畫面故障，不寫入任何記憶。 */
export function cycleNpc(npc: ScriptedNpc): ScriptedNpc {
  const lineIndex = (npc.lineIndex + 1) % npc.lines.length
  return {
    ...npc,
    lineIndex,
    glitching: lineIndex === 0,
  }
}
