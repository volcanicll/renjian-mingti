/**
 * 演示模式数据池 —— 无云环境时的完整玩法数据
 * 内容移植自 design-demo/人间命题-交互demo.html 并扩充
 */

/** NPC 玩家（演示局里的同学） */
export const NPC_PLAYERS = [
  { openid: 'npc-ahuang',  nickname: '阿黄', avatar: '🐔' },
  { openid: 'npc-paopao',  nickname: '泡泡', avatar: '🐱' },
  { openid: 'npc-laozhou', nickname: '老周', avatar: '🦊' },
  { openid: 'npc-ruanruan',nickname: '软软', avatar: '🐰' },
  { openid: 'npc-daxiong', nickname: '大熊', avatar: '🐻' }
]

export const ME = { openid: 'mock-me', nickname: '我', avatar: '😎' }

/** 官方题库（三类风格），正式环境由云函数 prompts 集合提供 */
export const PROMPT_POOL = [
  // 具体物件型
  { text: '拍下你家最有资历的物品。', style: 'object' },
  { text: '拍一个正在努力工作的圆形物体。', style: 'object' },
  { text: '拍下你身边最没用的东西。', style: 'object' },
  { text: '拍下一样红色的、正在休息的东西。', style: 'object' },
  { text: '拍下你今天碰过的第一扇门。', style: 'object' },
  { text: '拍下一样只剩一只的东西（袜子/耳机/筷子都行）。', style: 'object' },
  { text: '拍下你手机之外最懂你的电子设备。', style: 'object' },
  { text: '拍下一样你舍不得扔但说不清为什么的东西。', style: 'object' },
  { text: '拍下此刻离你最近的充电线。', style: 'object' },
  { text: '拍下一样看起来值一个亿的东西。', style: 'absurd' },
  // 抽象概念型
  { text: '拍下今天的风。', style: 'abstract' },
  { text: "拍下'等一下'。", style: 'abstract' },
  { text: '拍下你身边的红色。', style: 'abstract' },
  { text: '拍下今天的声音。', style: 'abstract' },
  { text: '拍下"差一点"。', style: 'abstract' },
  { text: '拍下此刻的安静。', style: 'abstract' },
  { text: '拍下一样正在告别的东西。', style: 'abstract' },
  { text: '拍下你的星期一。', style: 'abstract' },
  { text: '拍下一样比你还早起床的东西。', style: 'abstract' },
  { text: '拍下"努力"。', style: 'abstract' },
  // 荒诞限定型
  { text: '拍下最没用的超能力现场。', style: 'absurd' },
  { text: '拍下一样东西，让它看起来值一个亿。', style: 'absurd' },
  { text: '拍下一个正在开会的场景（人类不算）。', style: 'absurd' },
  { text: '拍下一样东西的遗照（它还活着）。', style: 'absurd' },
  { text: '拍下你工位/书桌上的"文物出土现场"。', style: 'absurd' },
  { text: '拍下一样东西在偷懒。', style: 'absurd' },
  { text: '拍下今天天气的表情包。', style: 'absurd' },
  { text: '拍下一样"看起来很好吃但绝对不能吃"的东西。', style: 'absurd' },
  { text: '拍下人类痕迹最重的一平方米自然。', style: 'absurd' },
  { text: '拍下一样东西的正面照证件照。', style: 'absurd' }
]

/** 演示局：NPC 的答卷内容池（按命题随机取用） */
export const NPC_ENTRY_POOL = [
  { emoji: '👕', cap: '它们在跳很慢的舞。', note: '晾衣绳上的校服在无风自动，物理老师看了想辞职。' },
  { emoji: '🌳', cap: '歪脖子树', note: '摄影师坚称风来了。作为证据，他提供了一棵树和一段模糊的信仰。' },
  { emoji: '🛍️', cap: '它自由了', note: '一只塑料袋的离家出走。你只能拍下它离开的背影，留不住的。' },
  { emoji: '💇', cap: '风没来，发型先投降了', note: '这不是发型，这是风的等高线图，建议投稿气象局。' },
  { emoji: '😑', cap: '他说他在感受风', note: '工位上午睡被抓的第 108 种辩解。态度端正，证据无效。' },
  { emoji: '🚩', cap: '旗子很敬业', note: '全程旗子一个人在表演，人类只负责按快门，分工明确。' },
  { emoji: '🌂', cap: '一把开错方向的伞', note: '这把伞对风的见解与气象学完全相反，但很有主见。' },
  { emoji: '🧦', cap: '单只袜子的葬礼', note: '另一只在洗衣机深处。本局最佳悬疑片，结局永远缺席。' },
  { emoji: '🍜', cap: '泡面冒的不是热气是志气', note: '凌晨十二点四十分，人类文明的灯塔在宿舍桌上亮着。' },
  { emoji: '🪑', cap: '这把椅子坐了八年', note: '它见证了你从 120 斤到现在的全过程，守口如瓶。' },
  { emoji: '📱', cap: '99% 电量的焦虑', note: '永远差的那 1%，是当代人安全感的精确计量单位。' },
  { emoji: '🚪', cap: '永远差一格关上的门', note: '它就这样开着。三年了。没人知道为什么，也没人敢关。' },
  { emoji: '☕', cap: '第三杯了', note: '咖啡因在血液里列队，效率在原地踏步，仪式感满分。' },
  { emoji: '🐈', cap: '它说这里归它管', note: '猫没有同意过任何命题，但它配合了。这就是格局。' }
]

/** 演示模式的 AI 点评池（兜底用；正式环境由大模型生成） */
export const AI_COMMENT_POOL = [
  '构图大胆地放弃了构图，这是一种境界。',
  '摄影师与被摄物之间，隔着一整个敷衍的宇宙。',
  '这张照片的价值在于：它证明了你确实带了手机。',
  '命题在你这里获得了极大的创作自由，自由到几乎跑题。',
  '看得出来，你拍得很急，但世界配合得很慢。',
  '这不是照片，这是证据。证明什么不重要。',
  '物体本身没有问题，问题是你觉得它符合命题。',
  '有一种粗糙的真诚，像食堂的免费汤。',
  '你成功让一道荒诞命题显得合理，这很了不起。',
  '画面很安静，安静得像没拍。',
  '建议冲洗出来裱起来，提醒自己今天也认真活过。',
  'AI 裁判看了很久，决定把这理解为一种风格。'
]

/**
 * 年鉴种子数据。
 * 键名必须与 AlbumItem 契约一致（image/caption/date/promptText/ownerName）——
 * 之前用的是 cap/prompt，导致演示模式 6 张种子卡片全部无配文、无命题。
 * 种子是占位作品，没有真实图片，靠 emoji 撑卡片。
 */
export const ALBUM_SEED = [
  { emoji: '🌂', caption: '一把开错方向的伞', date: '08.20', promptText: '「最没用的东西」', ownerName: '阿黄' },
  { emoji: '🧦', caption: '单只袜子的葬礼', date: '08.19', promptText: '「告别」', ownerName: '泡泡' },
  { emoji: '🍜', caption: '泡面冒的不是热气是志气', date: '08.18', promptText: '「努力」', ownerName: '老周' },
  { emoji: '🪑', caption: '这把椅子坐了八年', date: '08.17', promptText: '「资历」', ownerName: '软软' },
  { emoji: '📱', caption: '99% 电量的焦虑', date: '08.16', promptText: '「焦虑」', ownerName: '大熊' },
  { emoji: '🚪', caption: '永远差一格关上的门', date: '08.15', promptText: '「差一点」', ownerName: '阿黄' }
]

/** 演示模式：首页昨日战报 */
export const YESTERDAY_REPORT = {
  promptText: '拍下最没用的东西',
  best: { ownerName: '泡泡', caption: '防狼喷雾（她没开过盖）' },
  lazy: { ownerName: '大熊', caption: '一张黑屏（手机没解锁）' }
}

/** 卧底作品池：参与人数不足时混入的「往届作品」，供大家抓卧底 */
export const UNDERCOVER_POOL = [
  { emoji: '🌂', cap: '一把开错方向的伞', from: '「最没用的东西」' },
  { emoji: '🧦', cap: '单只袜子的葬礼', from: '「告别」' },
  { emoji: '🍜', cap: '泡面冒的不是热气是志气', from: '「努力」' },
  { emoji: '🪑', cap: '这把椅子坐了八年', from: '「资历」' },
  { emoji: '📱', cap: '99% 电量的焦虑', from: '「焦虑」' },
  { emoji: '🚪', cap: '永远差一格关上的门', from: '「差一点」' },
  { emoji: '🐈', cap: '它说这里归它管', from: '「正在偷懒的东西」' },
  { emoji: '☕', cap: '第三杯了', from: '「今天的风」' }
]

/** 白卷：限时内没拍出来时的交卷文案 */
export const BLANK_CAPTIONS = [
  '（白卷 —— 本人放弃作答，放弃本身即是作品）',
  '（本题空白，附赠一个真诚的耸肩）',
  '（交了白卷，并把希望寄托在下一题）'
]

/** 白卷专属 AI 点评 */
export const BLANK_NOTES = [
  '白卷。阅卷老师认为这是一种态度，也是一种放弃。',
  '本答卷以留白取胜，像极了我对未来的规划。',
  '零分，但交了。在人间命题，交卷本身就是一种勇气。',
  '空白也是一种构图。你成功让阅卷 AI 无话可说，它只好随便说一句。'
]

/** 明日预告：把命题打码成悬念（保留头尾与标点，其余化○） */
export function maskPrompt(text) {
  const s = String(text || '')
  if (s.length <= 2) return s
  const keep = (ch) => /[。，、？！「」“”'’]/.test(ch)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (i === 0 || i === s.length - 1 || keep(ch)) out += ch
    else out += '○'
  }
  // 至少露一个字：把倒数第二个○还原，避免全是○没法猜
  if (!/[^\s。，、？！「」“”'’○]/.test(out.slice(1, -1))) {
    out = s[0] + s[1] + out.slice(2)
  }
  return out
}
