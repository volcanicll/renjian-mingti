/**
 * 演示模式全流程冒烟测试（node 运行，经 esbuild 打包以解析 @ 别名）
 * 构建：npx esbuild scripts/smoke-mock.js --bundle --alias:@=./src --platform=neutral --outfile=/tmp/rmti-smoke.js
 * 执行：node /tmp/rmti-smoke.js
 */
const storage = {}
global.uni = {
  getStorageSync: (k) => storage[k] === undefined ? '' : storage[k],
  setStorageSync: (k, v) => { storage[k] = v },
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {}
}

const assert = require('assert')
const api = require('@/api/mock.js').default

async function main() {
  let pass = 0
  const ok = (cond, msg) => { assert(cond, msg); pass += 1; console.log('  ✓', msg) }

  // 1. bootstrap
  const boot = await api.getBootstrap()
  ok(boot.today.text.length > 3, 'bootstrap 返回今日命题: ' + boot.today.text)
  // 每日题编号必须按东八区日期推导（曾经用 UTC 天数，会早上 8 点换题）
  const expectNo = 1000 + (Math.floor((Date.now() + 8 * 3600 * 1000) / 86400000) % 500)
  ok(boot.today.no === expectNo, `每日题编号按东八区日期推导（${boot.today.no}）`)
  ok('quote' in boot.profile.stats, 'profile.stats 含契约字段 quote')
  ok(Array.isArray(boot.myRounds) && boot.myRounds.length === 0, '初始无进行中的局')
  ok(boot.profile.examNo === '1024', '准考证号')
  ok(boot.yesterdayReport && boot.yesterdayReport.best.ownerName, '昨日战报')

  // 2. 建局（官方题）
  const round = await api.createRound({ source: 'official' })
  ok(round.roundId && round.promptText && round.no > 1024, `建局成功 第${round.no}题「${round.promptText}」`)
  ok(round.players.length === 6, '6 名玩家入场')

  // 3. NPC 陆续交卷（前 3 位即时交，我还没交）
  const submittedNow = round.players.filter((p) => p.submitted).length
  ok(submittedNow === 3, `开局即有 3 位 NPC 交卷（当前已交 ${submittedNow}）`)

  // 4. 未交卷时不能进墙
  let earlyErr = ''
  try { await api.getWall(round.roundId) } catch (e) { earlyErr = e.message }
  ok(/揭晓/.test(earlyErr), '未开卷进墙被拦: ' + earlyErr)

  // 5. 我交卷
  await api.submitEntry(round.roundId, '/tmp/fake-photo.jpg', '我的答案是一台风扇')
  let dupErr = ''
  try { await api.submitEntry(round.roundId, '/tmp/x.jpg') } catch (e) { dupErr = e.message }
  ok(/交过卷/.test(dupErr), '重复交卷被拦')

  // 6. 快进揭晓
  await api.revealNow(round.roundId)
  const wall = await api.getWall(round.roundId)
  // 快进揭晓时后两位 NPC（50s/100s）尚未交卷，应为 3 NPC + 我 = 4 份
  ok(wall.total === 4, `揭晓墙共 ${wall.total} 份答卷`)
  ok(wall.entries.every((e) => !('ownerOpenid' in e)), '答卷匿名化：无作者字段')
  ok(wall.players.length === 6, '猜人候选 6 人')

  // 7. 猜人：先故意猜错再猜对（找一张非我的答卷，二分试出正确者）
  const target = wall.entries.find((e) => !e.isMine)
  let correctHit = null
  for (const p of wall.players) {
    if (p.openid === 'mock-me') continue
    const r = await api.guess(round.roundId, target.entryId, p.openid)
    if (r.correct) { correctHit = r.actualName; break }
  }
  ok(correctHit, `猜人命中: ${correctHit}`)

  // 8. 投票：给两张各投一票
  const [e1, e2] = wall.entries.filter((e) => !e.isMine)
  await api.vote(round.roundId, e1.entryId, 'best')
  await api.vote(round.roundId, e2.entryId, 'lazy')
  const wall2 = await api.getWall(round.roundId)
  ok(wall2.reviewed === 2, '已审计数 2')
  ok(wall2.entries.find((e) => e.entryId === e1.entryId).myVote === 'best', '批注状态回显')

  // 9. 结算
  const res = await api.settle(round.roundId)
  ok(res.round.promptText === round.promptText, '结算返回命题')
  // 之前这里是 `awards.best || awards.lazy || true` —— 恒真，等于没断言
  ok(!!(res.awards.best && res.awards.best.ownerName && res.awards.best.entryId),
    `最绝奖产出完整: ${res.awards.best && res.awards.best.ownerName}`)
  ok(!!res.awards.lazy, '最敷衍奖产出')
  ok(res.comments.length === 4 && res.comments.every((c) => c.text && c.ownerName), '4 条 AI 点评齐全')
  ok(res.guessScore.correct === 1 && res.guessScore.total === 1, `猜人成绩 ${res.guessScore.correct}/${res.guessScore.total}`)
  console.log('  · 最绝奖:', res.awards.best && res.awards.best.ownerName, '-', res.awards.best && res.awards.best.caption)
  console.log('  · 最敷衍奖:', res.awards.lazy && res.awards.lazy.ownerName)

  // 幂等：重复结算结果一致且不重复加分
  const res2 = await api.settle(round.roundId)
  ok(JSON.stringify(res2.awards) === JSON.stringify(res.awards), '结算幂等')

  // 10. 年鉴
  const album = await api.getAlbum()
  ok(album.length >= 1, `年鉴入册 ${album.length} 条`)

  // 11. AI 代出
  const aiP = await api.generateAiPrompt()
  ok(aiP.text.length > 5, 'AI 代出命题: ' + aiP.text)

  // 12. 自定义出题
  const custom = await api.createRound({ source: 'custom', text: "拍下'摸鱼'" })
  ok(custom.promptText === "拍下'摸鱼'", '自定义命题建局')

  // 13. 局模式：闪电局 2h / 长夜局 24h
  const fl = await api.createRound({ source: 'custom', text: '拍下此刻的光', mode: 'flash' })
  ok(Math.abs(fl.deadlineTs - Date.now() - 2 * 3600 * 1000) < 5000, '闪电局时限 2 小时')
  const on = await api.createRound({ source: 'custom', text: '拍下此刻的暗', mode: 'overnight' })
  ok(Math.abs(on.deadlineTs - Date.now() - 24 * 3600 * 1000) < 5000, '长夜局时限 24 小时')

  // 14. 卧底：只有 3 份 NPC 答卷就开卷 → 自动混入 1 张往届作品
  const uc = await api.createRound({ source: 'custom', text: '拍下卧底', mode: 'flash' })
  await api.revealNow(uc.roundId)
  const w3 = await api.getWall(uc.roundId)
  ok(w3.hasUndercover === true, '人数不足时自动混入卧底作品')
  ok(w3.total === 4, `卧底局共 ${w3.total} 份（3 人 + 1 卧底）`)
  ok(w3.players.some((p) => p.openid === '__undercover__'), '猜人候选里出现 🕵️ 卧底')
  ok(w3.entries.every((e) => !('undercover' in e)), '卧底标记不下发：答卷仍是匿名的')
  let ucHit = null
  for (const e of w3.entries) {
    for (const p of w3.players) {
      const r = await api.guess(uc.roundId, e.entryId, p.openid)
      if (r.correct && p.openid === '__undercover__') { ucHit = e.entryId; break }
    }
    if (ucHit) break
  }
  ok(ucHit, '卧底可以被抓出来')

  const resUc = await api.settle(uc.roundId)
  ok(resUc.undercover && resUc.undercover.entryId === ucHit, '结算揭晓卧底真身')
  ok(resUc.guessScore.undercoverHit === true, '抓卧底计入猜人战绩')

  // 15. 白卷 + 连击
  const b = await api.createRound({ source: 'custom', text: '拍下看不见的东西', mode: 'flash' })
  await api.submitEntry(b.roundId, '', '', { blank: true })
  const b2 = await api.getRound(b.roundId)
  ok(b2.myEntry.isBlank === true, '拍不出来可以交白卷')
  ok(/白卷|空白|留白|放弃/.test(b2.myEntry.caption), '白卷文案: ' + b2.myEntry.caption)
  const boot2 = await api.getBootstrap()
  ok((boot2.profile.stats.combo || 0) >= 2, `连续作答 ${boot2.profile.stats.combo} 天`)

  // 16. 金句奖 + 结算返回玩家名单（供赠权）
  const q = await api.createRound({ source: 'custom', text: '拍下一句话', mode: 'flash' })
  await api.revealNow(q.roundId)
  const wq = await api.getWall(q.roundId)
  await api.vote(q.roundId, wq.entries[0].entryId, 'quote')
  const resQ = await api.settle(q.roundId)
  ok('quote' in resQ.awards, '结算产出金句奖字段')
  ok(Array.isArray(resQ.players) && resQ.players.length >= 2, '结算返回本局玩家名单')
  ok(resQ.nextTeaser && resQ.nextTeaser.ownerName && resQ.nextTeaser.hint,
    `明日预告：${resQ.nextTeaser.ownerName} · ${resQ.nextTeaser.hint}`)

  // 17. 出题权赠予（赢家可送人；非赢家被拦）
  if (resQ.iWonPower) {
    const target = resQ.players.find((p) => p.openid !== 'mock-me')
    const g = await api.giftPower(q.roundId, target.openid)
    ok(g.ok === true, `出题权赠予成功 → ${g.toName}`)
    let againErr = ''
    try { await api.giftPower(q.roundId, target.openid) } catch (e) { againErr = e.message }
    ok(/送出/.test(againErr), '出题权不能重复赠送: ' + againErr)
  } else {
    let giftErr = ''
    try { await api.giftPower(q.roundId, 'npc-ahuang') } catch (e) { giftErr = e.message }
    ok(/出题权/.test(giftErr), '没有出题权时赠予被拦: ' + giftErr)
  }

  // 18. 生产模式契约补齐后的新增断言
  // 18.1 入局：幂等，且返回 isPlayer（云模式靠它判断受邀者是否要先入局）
  const j1 = await api.joinRound(q.roundId)
  ok(j1.isPlayer === true, 'joinRound 返回 isPlayer=true')
  const j2 = await api.joinRound(q.roundId)
  ok(j2.players.length === j1.players.length, 'joinRound 幂等：重复入局不增员')

  // 18.2 海报小程序码：两端统一返回 { url }
  const qr = await api.getPosterQr(q.roundId)
  ok(qr && typeof qr === 'object' && 'url' in qr, 'getPosterQr 统一返回 { url }')

  // 18.3 口袋：存入去重、移除生效、空题被拦
  const saved1 = await api.savePrompt({ promptId: 'p-1', no: 1001, text: '拍下此刻的风' })
  ok(saved1.length === 1 && saved1[0].text === '拍下此刻的风', '口袋存入成功')
  const saved2 = await api.savePrompt({ promptId: 'p-1', no: 1001, text: '拍下此刻的风' })
  ok(saved2.length === 1, '同一道题只进一次口袋')
  const saved3 = await api.savePrompt({ promptId: 'p-2', no: 1002, text: '拍下此刻的雨' })
  ok(saved3.length === 2 && saved3[0].promptId === 'p-2', '新题排在最前')
  let pocketErr = ''
  try { await api.savePrompt({ promptId: 'p-3', text: '' }) } catch (e) { pocketErr = e.message }
  ok(/空卷/.test(pocketErr), '空题不能进袋: ' + pocketErr)
  const saved4 = await api.unsavePrompt('p-1')
  ok(saved4.length === 1 && saved4[0].promptId === 'p-2', '从口袋移除生效')
  const boot3 = await api.getBootstrap()
  ok(Array.isArray(boot3.savedPrompts) && boot3.savedPrompts.length === 1, 'bootstrap 下发 savedPrompts')

  // 18.4 举报：理由校验 + 真的落库（不是只弹个框）
  let repErr = ''
  try { await api.reportEntry({ reason: 'x' }) } catch (e) { repErr = e.message }
  ok(/说明/.test(repErr), '举报理由太短被拦: ' + repErr)
  const rep = await api.reportEntry({ roundId: round.roundId, reason: '这张图和命题完全无关' })
  ok(rep.ok === true, '举报提交成功')

  // 18.5 同一局的揭晓墙顺序稳定（云模式按 roundId 作种子）
  const wa = await api.getWall(round.roundId)
  const wb = await api.getWall(round.roundId)
  ok(wa.entries.map((e) => e.entryId).join() === wb.entries.map((e) => e.entryId).join(),
    '同局揭晓墙顺序稳定')

  // 18.6 展示字段符合契约（两端同源，页面直接消费）
  ok(wa.entries.every((e) => e.emoji && 'c1' in e && 'c2' in e), '揭晓墙答卷带 emoji/c1/c2')
  ok(wa.canSettle === true, 'getWall 下发 canSettle（页面据此决定给不给「看结果」按钮）')
  ok(typeof wa.settleAtTs === 'number' && wa.settleAtTs > 0, 'getWall 下发结算窗口结束时间')
  ok(wa.maxAnnotations === 12, 'getWall 下发批注上限')
  const mine = (await api.getRound(b.roundId)).myEntry
  ok(mine && mine.emoji === '🕳️' && mine.isBlank === true, '白卷 myEntry 带 emoji 与 isBlank')
  ok('c1' in mine && 'c2' in mine, 'myEntry 带配色字段')

  // 18.7 年鉴字段符合 AlbumItem 契约（种子与真实入册条目一致）
  const alb = await api.getAlbum()
  ok(alb.length > 0, `年鉴非空（${alb.length} 条）`)
  ok(alb.every((a) => a.caption !== undefined && a.promptText !== undefined),
    `年鉴条目符合契约字段（${alb.length} 条）`)

  console.log(`\n全部通过 ✓ (${pass} 断言)`)
}

main().catch((e) => {
  console.error('\n✗ 冒烟测试失败:', e.message)
  process.exit(1)
})
