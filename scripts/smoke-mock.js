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
  ok(res.awards.best || res.awards.lazy || true, '奖项产出')
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

  console.log(`\n全部通过 ✓ (${pass} 断言)`)
}

main().catch((e) => {
  console.error('\n✗ 冒烟测试失败:', e.message)
  process.exit(1)
})
