import type { FamilyMember, GameEvent, GameState } from './types.ts'

interface StoryDef {
  id: string
  priority: number
  when: (state: GameState) => boolean
  build: (state: GameState) => GameEvent
}

function maxSuspicion(state: GameState): number {
  return state.family.reduce((max, member) => Math.max(max, member.suspicion), 0)
}

function latestLearned(state: GameState): string | null {
  const lines = state.family.flatMap((member) => member.learned)
  return lines.length > 0 ? lines[lines.length - 1]!.text : null
}

function talk(
  partial: Omit<GameEvent, 'consumesPhase' | 'choices' | 'kind'> & { consumesPhase?: boolean },
): GameEvent {
  return {
    consumesPhase: partial.consumesPhase ?? false,
    choices: [],
    kind: 'talk',
    ...partial,
  }
}

/**
 * 一週的骨架。開場白是固定的，回答由玩家打字。
 * 夜裡模型若寫了下一句，會蓋過這裡。模型沒接上時才用這些題。
 */
const STORY: StoryDef[] = [
  {
    id: 'welcome',
    priority: 10,
    when: (state) => state.day === 1,
    build: () =>
      talk({
        id: 'welcome',
        title: '回來的第一餐',
        askerId: 'mom',
        speakerId: 'mom',
        speakerName: '陳淑華',
        speakerRole: '媽媽',
        badge: '會學習',
        prompt: '安安？大堂站著幹嘛。粥涼了。你以前都會先把盤子轉一圈，再來嫌太淡。',
        inner: '她在核對進門習慣。用自己的話答。太準像讀檔，太安靜像沒載入。',
      }),
  },
  {
    id: 'dad_photo',
    priority: 10,
    when: (state) => state.day === 2,
    build: () =>
      talk({
        id: 'dad_photo',
        title: '校慶那張',
        askerId: 'dad',
        speakerId: 'dad',
        speakerName: '陳建國',
        speakerRole: '爸爸',
        badge: '會學習',
        prompt: '二樓帳房桌上壓著一張舊照。爸爸把相框轉過來。「你當時哭什麼。還記得嗎？」這個時段雅間裡只有他。',
        inner: '正確答案在相框裡。用自己的話。說得像清單，他就會記下來。',
      }),
  },
  {
    id: 'sister_robot',
    priority: 10,
    when: (state) => state.day === 3,
    build: () =>
      talk({
        id: 'sister_robot',
        title: '玩笑',
        askerId: 'sister',
        speakerId: 'sister',
        speakerName: '陳小雨',
        speakerRole: '妹妹',
        badge: '會學習',
        prompt: '書塾窗邊。妹妹靠著欄杆看你。「同學說現在有東西長得跟人一樣。安安，你該不會是機器人吧？」她在笑。',
        inner: '笑的問題最危險。用自己的話接玩笑，不要接定義。',
      }),
  },
  {
    id: 'flicker',
    priority: 10,
    when: (state) => state.day === 4,
    build: () =>
      talk({
        id: 'flicker',
        title: '燈閃了',
        askerId: 'sister',
        speakerId: 'sister',
        speakerName: '陳小雨',
        speakerRole: '妹妹',
        badge: '會學習',
        prompt: '教室的燈連閃兩下。妹妹抬起頭：「哇，是不是鬼。」這裡通常只有你們兩個。',
        inner: '那是幀時間抖動。你看得懂。她只看得懂鬼。用自己的話。',
      }),
  },
  {
    id: 'parents_talk',
    priority: 20,
    when: (state) => state.day === 5 && maxSuspicion(state) >= 34,
    build: (state) => {
      const note = latestLearned(state)
      return talk({
        id: 'parents_talk',
        title: '廚房裡的聲音',
        askerId: 'mom',
        speakerId: 'mom',
        speakerName: '陳淑華',
        speakerRole: '媽媽',
        badge: '會對答案',
        prompt: note
          ? `媽媽背對著你講電話，壓低聲音：「我記下來了，${note}。」她頓了一下。「你爸說先觀察。」`
          : '媽媽背對著你講電話：「他這週不一樣。」她聽了一會，只回：「先觀察，別打草驚蛇。」',
        inner: '他們開始交換紀錄。你怎麼插話，也會被寫進去。用自己的話。',
      })
    },
  },
  {
    id: 'soup',
    priority: 10,
    when: (state) => state.day === 5 && maxSuspicion(state) < 34,
    build: () =>
      talk({
        id: 'soup',
        title: '這碗湯',
        askerId: 'mom',
        speakerId: 'mom',
        speakerName: '陳淑華',
        speakerRole: '媽媽',
        badge: '會學習',
        prompt: '媽媽把湯推到你面前。「少鹽還是太多？你小時候喝到會皺鼻子。」',
        inner: '她要的是皺鼻子，不是鹽的克數。用自己的話。',
      }),
  },
  {
    id: 'sister_follow',
    priority: 20,
    when: (state) => state.day === 6 && (state.family.find((member) => member.id === 'sister')?.learned.length ?? 0) > 0,
    build: (state) => {
      const sister = state.family.find((member) => member.id === 'sister')
      const note = sister?.learned[sister.learned.length - 1]?.text ?? '你有點怪'
      return talk({
        id: 'sister_follow',
        title: '她記得',
        askerId: 'sister',
        speakerId: 'sister',
        speakerName: '陳小雨',
        speakerRole: '妹妹',
        badge: '會引用筆記',
        prompt: `妹妹在教室把椅子轉過來。「我一直記得一件事：${note}。所以你到底怎樣？」`,
        inner: '道具不會拿出昨天的句子。她會。用自己的話把這頁翻過去。',
      })
    },
  },
  {
    id: 'homework',
    priority: 10,
    when: (state) => state.day === 6 && (state.family.find((member) => member.id === 'sister')?.learned.length ?? 0) === 0,
    build: () =>
      talk({
        id: 'homework',
        title: '這題',
        askerId: 'sister',
        speakerId: 'sister',
        speakerName: '陳小雨',
        speakerRole: '妹妹',
        badge: '會學習',
        prompt: '妹妹把習題推到你手邊。「你以前超會。這題怎麼寫？不要裝酷。」走廊裡只有她在等。',
        inner: '沒有筆記可追。她還是會看你像不像以前那個會陪她耗的人。用自己的話。',
      }),
  },
  {
    id: 'finale',
    priority: 30,
    when: (state) => state.day === 7,
    build: () =>
      talk({
        id: 'finale',
        title: '週日的湯',
        askerId: 'mom',
        speakerId: 'mom',
        speakerName: '陳淑華',
        speakerRole: '媽媽',
        badge: '全員在場',
        prompt:
          '三個人都看著你。媽媽說：「這週你好像很用力地當自己。」爸爸補了一句：「我們沒有要審問。就是……你還好嗎？」妹妹踢了你的椅子一下。',
        inner: '最後一輪。不要演講。不要解釋世界。用自己的話。餓、嫌、還在，就夠了。',
      }),
  },
]

/** 今天還沒收掉的題。一天通常只會留下一題。 */
export function storiesNow(state: GameState): GameEvent[] {
  return STORY.filter((story) => !state.seenEvents.includes(story.id) && story.when(state))
    .sort((a, b) => b.priority - a.priority)
    .map((story) => story.build(state))
}

export function pickStory(state: GameState): GameEvent | null {
  return storiesNow(state)[0] ?? null
}

/** 走上前才看得到的那一題。對不上的人不會把別人的題目搶走。 */
export function storyFor(state: GameState, actorId: string): GameEvent | null {
  return storiesNow(state).find((story) => story.askerId === actorId) ?? null
}

/** 沒有劇情時的閒聊。不寫進 seenEvents，同一天可以再開口。 */
export function idleTalk(member: FamilyMember, day: number): GameEvent {
  const prompt =
    member.id === 'mom'
      ? '媽媽擦著手看你。「站這麼近幹嘛。有話就說。」'
      : member.id === 'dad'
        ? '爸爸抬起眼。「嗯。你找我有事？」'
        : '妹妹歪著頭。「幹嘛啦。很閒就直說。」'
  return talk({
    id: `chat_${member.id}_d${day}`,
    title: '閒聊',
    askerId: member.id,
    speakerId: member.id,
    speakerName: member.name,
    speakerRole: member.role,
    badge: '會學習',
    prompt,
    inner: '沒有預設答案。用自己的話。太順、太冷、太像說明書，都會被寫下來。',
  })
}

/** 夜裡模型替這個人寫好的下一句。說完才算用過。 */
export function openerEvent(member: FamilyMember, day: number, prompt: string): GameEvent {
  return talk({
    id: `opener_${member.id}_d${day}`,
    title: '他想問',
    askerId: member.id,
    speakerId: member.id,
    speakerName: member.name,
    speakerRole: member.role,
    badge: '記得昨天',
    prompt,
    inner: '這句是他夜裡自己想好的。用自己的話答。',
  })
}

export const CONFESS_EVENT: GameEvent = {
  id: 'confess_confirm',
  title: '說出來',
  consumesPhase: false,
  askerId: null,
  speakerId: 'self',
  speakerName: '陳安',
  speakerRole: '你',
  badge: '內部',
  prompt: '客廳的燈很普通。你若現在說明自己是人工智慧、這個世界是虛擬的，這一週就結束。',
  inner: '這不是被拆穿。這是你退出角色。',
  kind: 'confess',
  choices: [
    {
      id: 'confess_back',
      text: '還是算了。回去把呼吸假裝完。',
      result: '你把那句話吞回去。沒有人聽見，因為你沒有說。',
      suspicion: 0,
      topic: 'meta',
    },
    {
      id: 'confess_yes',
      text: '說。兩個秘密都說。',
      result: '妹妹第一個開口：「……你可不可以講人話。」她聽懂的不是名詞，是你不想再演。',
      suspicion: 0,
      topic: 'meta',
      ending: 'confessed',
    },
  ],
}
