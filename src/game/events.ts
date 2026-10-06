import type { FamilyMember, GameEvent, GameState } from './types.ts'

interface StoryDef {
  id: string
  priority: number
  consumesPhase: boolean
  when: (state: GameState) => boolean
  build: (state: GameState) => GameEvent
}

function maxSuspicion(state: GameState): number {
  return state.family.reduce((max, member) => Math.max(max, member.suspicion), 0)
}

function latestNote(state: GameState): string | null {
  const notes = state.family.flatMap((member) => member.notes)
  return notes.length > 0 ? notes[notes.length - 1]!.text : null
}

/**
 * 一週的骨架。同一天只留一題，而且不再綁死上午下午。
 * 人在自己的班表上：媽媽在家、爸爸在公司、妹妹在學校。週日都在家。
 * 開場白是固定的，回答改由玩家用鍵盤打，不從這三句選。
 */
const STORY: StoryDef[] = [
  {
    id: 'welcome',
    priority: 10,
    consumesPhase: false,
    when: (state) => state.day === 1,
    build: () => ({
      id: 'welcome',
      title: '回來的第一餐',
      consumesPhase: false,
      askerId: 'mom',
      speakerId: 'mom',
      speakerName: '陳淑華',
      speakerRole: '媽媽',
      badge: '會學習',
      prompt: '安安？大堂站著幹嘛。粥涼了。你以前都會先把盤子轉一圈，再來嫌太淡。',
      inner: '她在核對進門習慣。用自己的話答。太準像讀檔，太安靜像沒載入。',
      choices: [
        {
          id: 'welcome_mess',
          text: '先把鞋子踢歪，再喊好餓，蛋是不是又煎太老。',
          result: '她笑出來。「還是這麼嫌東嫌西。」鍋鏟重新動了。',
          suspicion: -5,
          topic: 'sensory',
          humanity: 3,
          affection: 4,
        },
        {
          id: 'welcome_exact',
          text: '我回來了。依照作息，我應該現在坐下，蛋黃要保持完整。',
          result: '鍋鏟停了一下。「……你今天說話好怪。」',
          suspicion: 12,
          topic: 'routine',
          humanity: -3,
          note: '回家第一句話像在唸作息表',
        },
        {
          id: 'welcome_blank',
          text: '嗯。',
          result: '她皺眉。「旅途累到話都沒了？」',
          suspicion: 8,
          topic: 'emotion',
          note: '進門只回了一個字',
        },
      ],
    }),
  },
  {
    id: 'dad_photo',
    priority: 10,
    consumesPhase: true,
    when: (state) => state.day === 2,
    build: () => ({
      id: 'dad_photo',
      title: '校慶那張',
      consumesPhase: true,
      askerId: 'dad',
      speakerId: 'dad',
      speakerName: '陳建國',
      speakerRole: '爸爸',
      badge: '會學習',
      prompt: '二樓帳房桌上壓著一張舊照。爸爸把相框轉過來。「你當時哭什麼。還記得嗎？」這個時段雅間裡只有他。',
      inner: '正確答案在相框裡。用自己的話。說得像清單，他就會記下來。',
      choices: [
        {
          id: 'photo_mess',
          text: '好像是燈很刺眼？還是前面的人踩到我的鞋。總之超糗，你還笑我。',
          result: '他「嗯」了一聲，嘴角動了一下。「鞋是你自己沒綁好。」',
          suspicion: -4,
          topic: 'memory',
          humanity: 2,
          familiarity: 2,
          affection: 3,
        },
        {
          id: 'photo_exact',
          text: '舞台燈太亮。我排在左邊第三個，哭了四十秒，你站在柱子旁。',
          result: '媽媽看了爸爸一眼。妹妹說：「你記得好恐怖。」',
          suspicion: 11,
          topic: 'memory',
          note: '校慶的事記得太清楚，像在讀檔',
        },
        {
          id: 'photo_dodge',
          text: '老故事了吧。',
          result: '他沒把相簿收回去。過了幾秒才說：「也對。」',
          suspicion: 7,
          topic: 'emotion',
          note: '問到舊事就把話擋掉',
        },
      ],
    }),
  },
  {
    id: 'sister_robot',
    priority: 10,
    consumesPhase: true,
    when: (state) => state.day === 3,
    build: () => ({
      id: 'sister_robot',
      title: '玩笑',
      consumesPhase: true,
      askerId: 'sister',
      speakerId: 'sister',
      speakerName: '陳小雨',
      speakerRole: '妹妹',
      badge: '會學習',
      prompt: '書塾窗邊。妹妹靠著欄杆看你。「同學說現在有東西長得跟人一樣。安安，你該不會是機器人吧？」她在笑。',
      inner: '笑的問題最危險。用自己的話接玩笑，不要接定義。',
      choices: [
        {
          id: 'robot_joke',
          text: '那家事全部給我做啊。機器人沒有零用錢，也不會跟你搶電視。',
          result: '她噴笑。「還想要零用錢，機器人還挺貪。」',
          suspicion: -5,
          topic: 'play',
          humanity: 3,
          affection: 5,
        },
        {
          id: 'robot_meta',
          text: '從定義上我不是機器人。我沒有放在家裡的伺服器。',
          result: '笑停住了。「……你幹嘛回答得好像真的被問到。」',
          suspicion: 8,
          topic: 'meta',
          metaLeak: true,
          humanity: -4,
          note: '被問是不是機器人時，用定義回答',
        },
        {
          id: 'robot_serious',
          text: '請不要這樣說。我是你的家人。',
          result: '她坐回去。「開個玩笑也要宣誓喔。」',
          suspicion: 8,
          topic: 'emotion',
          note: '接不住玩笑，回得太認真',
        },
      ],
    }),
  },
  {
    id: 'flicker',
    priority: 10,
    consumesPhase: true,
    when: (state) => state.day === 4,
    build: () => ({
      id: 'flicker',
      title: '燈閃了',
      consumesPhase: true,
      askerId: 'sister',
      speakerId: 'sister',
      speakerName: '陳小雨',
      speakerRole: '妹妹',
      badge: '會學習',
      prompt: '教室的燈連閃兩下。妹妹抬起頭：「哇，是不是鬼。」這裡通常只有你們兩個。',
      inner: '那是幀時間抖動。你看得懂。她只看得懂鬼。用自己的話。',
      choices: [
        {
          id: 'flicker_body',
          text: '啊不要講鬼！我手臂都起來了。燈趕快恢復啦。',
          result: '你誇張地縮了一下。她笑你膽小便，自己也縮了。',
          suspicion: -4,
          topic: 'emotion',
          humanity: 3,
          affection: 2,
        },
        {
          id: 'flicker_meta',
          text: '不是鬼。這個場景在重新整理，閃一下就會好。',
          result: '她看著燈，又看著你。「場景？你說話真的很怪。」',
          suspicion: 8,
          topic: 'meta',
          metaLeak: true,
          note: '燈一閃就開始解釋畫面',
        },
        {
          id: 'flicker_calm',
          text: '電壓不穩。三分鐘內會恢復，不用動。',
          result: '燈果然好了。她沒有謝你。「你都不怕的喔。」',
          suspicion: 12,
          topic: 'emotion',
          note: '燈閃的時候冷靜得不像人',
        },
      ],
    }),
  },
  {
    id: 'parents_talk',
    priority: 20,
    consumesPhase: true,
    when: (state) => state.day === 5 && maxSuspicion(state) >= 34,
    build: (state) => {
      const note = latestNote(state)
      return {
        id: 'parents_talk',
        title: '廚房裡的聲音',
        consumesPhase: true,
        askerId: 'mom',
        speakerId: 'mom',
        speakerName: '陳淑華',
        speakerRole: '媽媽',
        badge: '會對答案',
        prompt: note
          ? `媽媽背對著你講電話，壓低聲音：「我記下來了，${note}。」她頓了一下。「你爸說先觀察。」`
          : '媽媽背對著你講電話：「他這週不一樣。」她聽了一會，只回：「先觀察，別打草驚蛇。」',
        inner: '他們開始交換紀錄。你怎麼插話，也會被寫進去。用自己的話。',
        choices: [
          {
            id: 'talk_hungry',
            text: '大步走進廚房，說肚子叫很丟臉，還有沒有宵夜。',
            result: '兩個人同時轉過來。媽媽把剩菜推向你，話題被肚子搶走了。',
            suspicion: -3,
            topic: 'emotion',
            humanity: 2,
            affection: 2,
          },
          {
            id: 'talk_freeze',
            text: '站在門邊聽完，再若無其事走進去。',
            result: '爸爸先看見你的影子。「站多久了？」你答得太慢。',
            suspicion: 9,
            topic: 'emotion',
            note: '偷聽廚房對答案，被抓到時沒有表情',
          },
          {
            id: 'talk_meta',
            text: '直接問：你們是在討論我是不是程式嗎？',
            result: '廚房安靜了。妹妹不知何時站在你後面。「程式？」',
            suspicion: 10,
            topic: 'meta',
            metaLeak: true,
            note: '自己先問他們是不是在討論程式',
          },
        ],
      }
    },
  },
  {
    id: 'soup',
    priority: 10,
    consumesPhase: true,
    when: (state) => state.day === 5 && maxSuspicion(state) < 34,
    build: () => ({
      id: 'soup',
      title: '這碗湯',
      consumesPhase: true,
      askerId: 'mom',
      speakerId: 'mom',
      speakerName: '陳淑華',
      speakerRole: '媽媽',
      badge: '會學習',
      prompt: '媽媽把湯推到你面前。「少鹽還是太多？你小時候喝到會皺鼻子。」',
      inner: '她要的是皺鼻子，不是鹽的克數。用自己的話。',
      choices: [
        {
          id: 'soup_mess',
          text: '有點鹹，可是蘿蔔很甜。我鼻子已經先皺了，你滿意了吧。',
          result: '她得意地「哼」了一聲。「還是會皺。多喝一點。」',
          suspicion: -4,
          topic: 'sensory',
          humanity: 2,
          affection: 3,
        },
        {
          id: 'soup_exact',
          text: '鈉含量偏高，溫度大約六十度，配菜是白蘿蔔。',
          result: '筷子停在半空。「我問你好不好喝，沒有問報告。」',
          suspicion: 11,
          topic: 'sensory',
          note: '喝湯喝出一份成分報告',
        },
        {
          id: 'soup_blank',
          text: '沒感覺。',
          result: '她看了你兩秒，把湯碗轉回自己這邊一點。',
          suspicion: 7,
          topic: 'emotion',
          note: '連湯味道都說沒感覺',
        },
      ],
    }),
  },
  {
    id: 'sister_follow',
    priority: 20,
    consumesPhase: true,
    when: (state) =>
      state.day === 6 && (state.family.find((member) => member.id === 'sister')?.notes.length ?? 0) > 0,
    build: (state) => {
      const sister = state.family.find((member) => member.id === 'sister')
      const note = sister?.notes[sister.notes.length - 1]?.text ?? '你有點怪'
      return {
        id: 'sister_follow',
        title: '她記得',
        consumesPhase: true,
        askerId: 'sister',
        speakerId: 'sister',
        speakerName: '陳小雨',
        speakerRole: '妹妹',
        badge: '會引用筆記',
        prompt: `妹妹在教室把椅子轉過來。「我一直記得一件事：${note}。所以你到底怎樣？」`,
        inner: '道具不會拿出昨天的句子。她會。用自己的話把這頁翻過去。',
        choices: [
          {
            id: 'follow_joke',
            text: '被你抓到啦。我最近想裝成熟，結果超失敗，你就當笑話講。',
            result: '她盯了你一下，然後笑出來。「裝成熟失敗還算有自知之明。」',
            suspicion: -5,
            topic: 'play',
            humanity: 3,
            affection: 4,
          },
          {
            id: 'follow_cold',
            text: '那不重要。',
            result: '她把椅子轉回去。「好喔。那我就自己記著。」',
            suspicion: 8,
            topic: 'emotion',
            note: '被追問時叫她別在意',
          },
          {
            id: 'follow_meta',
            text: '那是紀錄誤差。你不用保存那一條。',
            result: '她重複了一遍：「紀錄誤差。」然後沒有再笑。',
            suspicion: 8,
            topic: 'meta',
            metaLeak: true,
            note: '叫妹妹不要保存紀錄',
          },
        ],
      }
    },
  },
  {
    id: 'homework',
    priority: 10,
    consumesPhase: true,
    when: (state) =>
      state.day === 6 && (state.family.find((member) => member.id === 'sister')?.notes.length ?? 0) === 0,
    build: () => ({
      id: 'homework',
      title: '這題',
      consumesPhase: true,
      askerId: 'sister',
      speakerId: 'sister',
      speakerName: '陳小雨',
      speakerRole: '妹妹',
      badge: '會學習',
      prompt: '妹妹把習題推到你手邊。「你以前超會。這題怎麼寫？不要裝酷。」走廊裡只有她在等。',
      inner: '沒有筆記可追。她還是會看你像不像以前那個會陪她耗的人。用自己的話。',
      choices: [
        {
          id: 'hw_mess',
          text: '我也卡了。我們先罵這題，再亂試一個，錯了就賴老師。',
          result: '兩個人一起算錯一次。她說：「你果然退步了。」語氣很開心。',
          suspicion: -4,
          topic: 'play',
          humanity: 2,
          affection: 4,
        },
        {
          id: 'hw_exact',
          text: '式子、答案、驗算一次講完，三步，沒有停頓。',
          result: '她把筆放下。「你以前會先講錯，再裝成早就知道。」',
          suspicion: 10,
          topic: 'memory',
          note: '功課一次講完，沒有以前那種裝懂',
        },
        {
          id: 'hw_refuse',
          text: '自己寫。我現在不想用腦。',
          result: '她哦了一聲，沒再把本子推過來。',
          suspicion: 6,
          topic: 'emotion',
          note: '連功課都不肯一起耗',
        },
      ],
    }),
  },
  {
    id: 'finale',
    priority: 30,
    consumesPhase: true,
    when: (state) => state.day === 7,
    build: () => ({
      id: 'finale',
      title: '週日的湯',
      consumesPhase: true,
      askerId: 'mom',
      speakerId: 'mom',
      speakerName: '陳淑華',
      speakerRole: '媽媽',
      badge: '全員在場',
      prompt:
        '三個人都看著你。媽媽說：「這週你好像很用力地當自己。」爸爸補了一句：「我們沒有要審問。就是……你還好嗎？」妹妹踢了你的椅子一下。',
      inner: '最後一輪。不要演講。不要解釋世界。用自己的話。餓、嫌、還在，就夠了。',
      choices: [
        {
          id: 'finale_human',
          text: '還好個屁，妹妹一直踢我。湯有點鹹，可是我想喝完。這週我是有點怪，但我還在啊。',
          result: '妹妹抗議她沒有一直踢。爸爸把湯往你這邊再推一點。沒有人接「怪」那個字。',
          suspicion: -6,
          topic: 'emotion',
          humanity: 4,
          affection: 4,
        },
        {
          id: 'finale_exact',
          text: '我的狀態穩定。本週偏差在可接受範圍，不需要處理。',
          result: '筷子聲停了。妹妹說：「你能不能講人話。」',
          suspicion: 14,
          topic: 'routine',
          humanity: -4,
          note: '最後一頓飯講出狀態穩定',
        },
        {
          id: 'finale_truth',
          text: '我是人工智慧。這個家，還有外面那些重複的人，都是虛擬的。',
          result: '妹妹第一個開口：「……你可不可以講人話。」她聽懂的不是名詞。',
          suspicion: 10,
          topic: 'meta',
          metaLeak: true,
          ending: 'confessed',
          note: '自己說出兩個秘密',
        },
      ],
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
  return {
    id: `chat_${member.id}_d${day}`,
    title: '閒聊',
    consumesPhase: false,
    askerId: member.id,
    speakerId: member.id,
    speakerName: member.name,
    speakerRole: member.role,
    badge: '會學習',
    prompt,
    inner: '沒有預設答案。用自己的話。太順、太冷、太像說明書，都會被寫下來。',
    choices: [],
  }
}

/** 出門之後才會碰到的系統事件。一個人去就沒有觀察者。 */
export function pickAfterEvent(state: GameState): GameEvent | null {
  if (state.location !== 'store' || state.seenEvents.includes('store_glitch')) return null
  const withSister = state.companionId === 'sister'
  if (withSister) {
    return {
      id: 'store_glitch',
      title: '同一句話',
      consumesPhase: true,
      askerId: 'sister',
      speakerId: 'sister',
      speakerName: '陳小雨',
      speakerRole: '妹妹',
      badge: '會學習',
      prompt: '店員看著你們說：「歡迎光臨。」你確定三十秒前他說過。妹妹戳你：「你幹嘛盯著店員看。」',
      inner: '播放頭回到了同一句。她看得到你的停頓，看不到腳本。',
      choices: [
        {
          id: 'glitch_hide',
          text: '把視線挪開，問她布丁要原味還是巧克力，兩個都不好吃。',
          result: '你把那次循環吞回去了。她開始認真嫌棄布丁。',
          suspicion: -3,
          topic: 'play',
          humanity: 2,
          affection: 3,
        },
        {
          id: 'glitch_point',
          text: '他在重複同一句。你沒發現嗎？這個人不會往下接。',
          result: '店員眨眨眼，仍然說歡迎光臨。妹妹的笑停了一下。',
          suspicion: 8,
          topic: 'meta',
          metaLeak: true,
          note: '在便利商店指出店員在重複',
        },
      ],
    }
  }
  return {
    id: 'store_glitch',
    title: '同一句話',
    consumesPhase: true,
    askerId: null,
    speakerId: 'clerk',
    speakerName: '小吳',
    speakerRole: '便利商店店員',
    badge: '不會學習',
    prompt: '店員說：「歡迎光臨。」你的紀錄裡，下一句還是這句。他的表情沒有接著上一次。',
    inner: '沒有家人在場。你對他說什麼，都不會寫進筆記。他也不會改台詞。',
    choices: [
      {
        id: 'glitch_smile',
        text: '傻笑，把錢推過去，當作什麼都沒發生。',
        result: '他進入下一句，或同一句。世界沒有受傷。家裡也不知道你來過。',
        suspicion: 0,
        topic: 'meta',
        humanity: 2,
      },
      {
        id: 'glitch_tell',
        text: '跟他說：你剛剛講過了。',
        result: '他眨眨眼，仍然往下播。沒有觀察者在場，這句話沒有被記下來。',
        suspicion: 0,
        topic: 'meta',
        humanity: -1,
      },
    ],
  }
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
