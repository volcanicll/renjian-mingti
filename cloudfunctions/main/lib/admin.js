/**
 * lib/admin.js —— 官方题库种子（幂等）
 * 通过 action 'admin.seedPrompts' 调用：控制台（无 OPENID）或 ADMIN_OPENIDS 管理员
 */

const PROMPT_SEEDS = [
  // ---- 具体物件型 object ----
  { text: '拍下你家最有资历的物品。', style: 'object' },
  { text: '拍一个正在努力工作的圆形物体。', style: 'object' },
  { text: '拍下你身边最没用的东西。', style: 'object' },
  { text: '拍下一样红色的、正在休息的东西。', style: 'object' },
  { text: '拍下你今天碰过的第一扇门。', style: 'object' },
  { text: '拍下一样只剩一只的东西。', style: 'object' },
  { text: '拍下你手机之外最懂你的电子设备。', style: 'object' },
  { text: '拍下一样你舍不得扔但说不清为什么的东西。', style: 'object' },
  { text: '拍下此刻离你最近的充电线。', style: 'object' },
  { text: '拍下一样已经退役但没被扔掉的物品。', style: 'object' },
  { text: '拍下你家最会藏东西的角落。', style: 'object' },
  { text: '拍下一样买来很贵现在很闲的东西。', style: 'object' },

  // ---- 抽象概念型 abstract ----
  { text: '拍下今天的风。', style: 'abstract' },
  { text: "拍下'等一下'。", style: 'abstract' },
  { text: '拍下你身边的红色。', style: 'abstract' },
  { text: '拍下今天的声音。', style: 'abstract' },
  { text: "拍下'差一点'。", style: 'abstract' },
  { text: '拍下此刻的安静。', style: 'abstract' },
  { text: '拍下一样正在告别的东西。', style: 'abstract' },
  { text: '拍下你的星期一。', style: 'abstract' },
  { text: '拍下一样比你还早起床的东西。', style: 'abstract' },
  { text: "拍下'努力'。", style: 'abstract' },
  { text: '拍下今天路过的一段影子。', style: 'abstract' },
  { text: "拍下'顺便'。", style: 'abstract' },

  // ---- 荒诞限定型 absurd ----
  { text: '拍下最没用的超能力现场。', style: 'absurd' },
  { text: '拍下一样东西，让它看起来值一个亿。', style: 'absurd' },
  { text: '拍下一个正在开会的场景，人类不算。', style: 'absurd' },
  { text: '拍下一样东西的遗照，它还活着。', style: 'absurd' },
  { text: "拍下你桌面上的'文物出土现场'。", style: 'absurd' },
  { text: '拍下一样东西在偷懒。', style: 'absurd' },
  { text: '拍下今天天气的表情包。', style: 'absurd' },
  { text: "拍下'看起来很好吃但绝对不能吃'的东西。", style: 'absurd' },
  { text: '拍下人类痕迹最重的一平方米自然。', style: 'absurd' },
  { text: '拍下一样东西的证件照。', style: 'absurd' },
  { text: "拍下'它以为没人看见'的瞬间。", style: 'absurd' },
  { text: '拍下一个反方向的排队。', style: 'absurd' },
  { text: "拍下'本该在这里但不在'的东西。", style: 'absurd' }
]

/** 幂等入库：已有 ≥30 条 active 题目则跳过；返回本次入库条数 */
async function seedPrompts(db) {
  const col = db.collection('prompts')
  const existing = await col.where({ active: true }).count()
  if (existing.total >= 30) return 0

  let inserted = 0
  for (const p of PROMPT_SEEDS) {
    try {
      await col.add({
        data: { ...p, useDate: null, active: true, createdAt: Date.now() }
      })
      inserted += 1
    } catch (e) {
      console.warn('[seedPrompts] 插入失败:', p.text, e.message)
    }
  }
  return inserted
}

module.exports = { seedPrompts }
