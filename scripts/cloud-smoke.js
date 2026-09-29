/**
 * 云模式（生产模式）冒烟测试。
 *
 * 通过 scripts/fake-wx-sdk.js 内存替身跑通 cloudfunctions/main 的真实业务逻辑：
 * 入局链路、局内成员鉴权、匿名性、结算、清扫两阶段、订阅消息、内容检查、口袋与举报。
 *
 * 构建与运行见 package.json 的 `smoke:cloud`：
 *   esbuild scripts/cloud-smoke.js --bundle --platform=node \
 *     --alias:wx-server-sdk=./scripts/fake-wx-sdk.js --outfile=/tmp/rmti-cloud.js
 */
const assert = require('assert')
const sdk = require('wx-server-sdk')
const { main } = require('../cloudfunctions/main/index.js')

const A = 'openid-A' // 局主
const B = 'openid-B' // 受邀者
const C = 'openid-C' // 无关用户

let pass = 0
const ok = (cond, msg) => { assert(cond, msg); pass += 1; console.log('  ✓', msg) }

async function call(openid, action, payload) {
  sdk.__setOpenid(openid)
  return main({ action, payload })
}

async function main_() {
  sdk.__reset()

  // 昵称用于验证「猜对回填的是不是正确那个人」
  await call(A, 'profile.update', { nickname: '阿甲' })
  await call(B, 'profile.update', { nickname: '阿乙' })

  // ---------- 1. bootstrap：读接口不得消耗局号计数器 ----------
  const b1 = await call(A, 'bootstrap')
  const b2 = await call(A, 'bootstrap')
  ok(b1.ok && b1.data.today.text, 'bootstrap 返回今日命题: ' + b1.data.today.text)
  ok(b1.data.today.no === b2.data.today.no, '每日题编号稳定（读完不变号）')
  ok(sdk.__all('counters').length === 0, 'bootstrap 不创建/不消耗 counters（不烧号）')
  ok(Array.isArray(b1.data.savedPrompts) && b1.data.savedPrompts.length === 0, 'bootstrap 下发空口袋')

  // ---------- 2. 建局：players 只有局主 ----------
  const created = await call(A, 'round.create', { source: 'custom', text: '拍下此刻的表情' })
  ok(created.ok, '创建局成功')
  const roundId = created.data.roundId
  ok(created.data.players.length === 1, '建局后 players 只有局主一人（join 的必要性）')
  ok(created.data.isPlayer === true && created.data.isMine === true, '局主 isPlayer/isMine 为真')
  ok(sdk.__all('counters')[0].seq === 1025, 'createRound 才递增局号计数器')

  // ---------- 3. 受邀者：能预览，但所有局内动作被拦 ----------
  const seenByB = await call(B, 'round.get', { roundId })
  ok(seenByB.ok && seenByB.data.isPlayer === false, '受邀者能预览局，isPlayer=false')
  for (const [action, payload] of [
    ['wall.get', { roundId }],
    ['vote.cast', { roundId, entryId: 'x', tag: 'best' }],
    ['guess.cast', { roundId, entryId: 'x', guessedOpenid: A }],
    ['round.settle', { roundId }]
  ]) {
    const r = await call(B, action, payload)
    ok(r.ok === false && /不在这局/.test(r.error), `未入局用户被 ${action} 拦下`)
  }
  const subByB = await call(B, 'entry.submit', { roundId, fileID: 'cloud://t/b.jpg' })
  ok(subByB.ok === false && /不在这局/.test(subByB.error), '未入局用户不能交卷')

  // ---------- 4. 入局 ----------
  const joined = await call(B, 'round.join', { roundId })
  ok(joined.ok && joined.data.isPlayer === true, 'round.join 后 isPlayer=true')
  ok(joined.data.players.length === 2, `入局后 players 共 ${joined.data.players.length} 人`)
  const joinedAgain = await call(B, 'round.join', { roundId })
  ok(joinedAgain.data.players.length === 2, 'round.join 幂等：重复入局不增员')

  // ---------- 5. 双人交卷 → 自动开卷 ----------
  const subA = await call(A, 'entry.submit', { roundId, fileID: 'cloud://t/a.jpg', caption: '第一张' })
  ok(subA.ok, '局主交卷成功')
  const subB2 = await call(B, 'entry.submit', { roundId, fileID: 'cloud://t/b.jpg', caption: '第二张' })
  ok(subB2.ok, '受邀者入局后交卷成功（生产模式核心链路）')
  const after = await call(A, 'round.get', { roundId })
  ok(after.data.status === 'revealing', '人齐后自动开卷')
  ok(after.data.submittedCount === 2, 'submittedCount 只算真实玩家')

  // ---------- 6. myEntry 展示字段（之前云模式全缺） ----------
  const m = after.data.myEntry
  ok(m && /^https:\/\/cdn\.test\//.test(m.image), 'myEntry.image 已由 fileID 换成临时链接')
  ok(m.isBlank === false && m.emoji === '📷', 'myEntry 带 isBlank 与 emoji')
  ok(!!m.c1 && !!m.c2, 'myEntry 带配色字段')

  // ---------- 7. 揭晓墙：匿名 + 展示字段 + 顺序稳定 ----------
  const wallA = await call(A, 'wall.get', { roundId })
  ok(wallA.ok && wallA.data.total === 2, `揭晓墙共 ${wallA.data.total} 份答卷`)
  ok(wallA.data.entries.every((e) => !('openid' in e) && !('ownerOpenid' in e) && !('undercover' in e)),
    '揭晓墙答卷不含作者与卧底字段')
  ok(wallA.data.entries.every((e) => e.emoji && e.c1 && e.c2), '揭晓墙答卷带 emoji/c1/c2')
  const order1 = wallA.data.entries.map((e) => e.entryId).join()
  const order2 = (await call(A, 'wall.get', { roundId })).data.entries.map((e) => e.entryId).join()
  ok(order1 === order2, '同一局揭晓墙顺序稳定（roundId 作种子）')

  // ---------- 8. 猜人：只有猜对才回填真名 ----------
  const target = wallA.data.entries.find((e) => !e.isMine)
  const wrong = await call(A, 'guess.cast', { roundId, entryId: target.entryId, guessedOpenid: A })
  ok(wrong.ok && wrong.data.correct === false && wrong.data.actualName === '神秘同学',
    '猜错不回填真名（匿名墙不可被逐张试出）')
  const right = await call(A, 'guess.cast', { roundId, entryId: target.entryId, guessedOpenid: B })
  ok(right.data.correct === true && right.data.actualName === '阿乙',
    `猜对回填的是正确那位: ${right.data.actualName}`)

  // ---------- 9. 投票守卫 ----------
  const voteTarget = wallA.data.entries[0].entryId
  ok((await call(A, 'vote.cast', { roundId, entryId: voteTarget, tag: 'best' })).ok, '批注成功')
  const badTag = await call(A, 'vote.cast', { roundId, entryId: voteTarget, tag: 'nope' })
  ok(badTag.ok === false && /标签/.test(badTag.error), '非法批注标签被拦')
  ok((await call(A, 'vote.cast', { roundId, entryId: voteTarget, tag: 'lazy' })).ok, '改票成功')
  ok(sdk.__all('votes').length === 1, '改票是更新而不是新增')
  ok((await call(A, 'vote.cast', { roundId, entryId: voteTarget, tag: 'best' })).ok, '改回最绝票')

  // 防刷上限：补到 12 条后第 13 张被拒
  const mineVotes = sdk.__all('votes').filter((v) => v.voterOpenid === A)
  for (let i = mineVotes.length; i < 12; i++) {
    sdk.__insert('votes', { roundId, voterOpenid: A, entryId: 'bulk' + i, tag: 'best', createdAt: Date.now() })
  }
  const capped = await call(A, 'vote.cast', { roundId, entryId: wallA.data.entries[1].entryId, tag: 'best' })
  ok(capped.ok === false && /最多批注/.test(capped.error), '超过每人批注上限被拦')

  // ---------- 10. 结算 ----------
  const settled = await call(A, 'round.settle', { roundId })
  ok(settled.ok && settled.data.round.roundId === roundId, '结算成功并返回本局')
  const best = settled.data.awards.best
  ok(best && best.ownerOpenid === A && /^https:\/\/cdn\.test\//.test(best.image),
    `最绝奖回填作者与临时图片: ${best && best.ownerName}`)
  ok(settled.data.comments.length === 2 && settled.data.comments.every((c) => c.text && c.ownerName),
    '每人一条 AI 兜底点评')
  ok(typeof settled.data.nextTeaser.mine === 'boolean', 'nextTeaser 带调用者视角 mine')
  ok(settled.data.nextTeaser.mine === (settled.data.nextTeaser.ownerOpenid === A),
    'mine 与调用者身份一致')
  const settledB = await call(B, 'round.settle', { roundId })
  ok(settledB.data.nextTeaser.mine === (settledB.data.nextTeaser.ownerOpenid === B),
    '换一个调用者，mine 重新按身份计算')
  const settled2 = await call(A, 'round.settle', { roundId })
  ok(JSON.stringify(settled2.data.awards) === JSON.stringify(settled.data.awards), '结算幂等（奖项一致）')
  // 只比奖项是不够的：奖项是重算出来的，数据没变就会得到同样的结果。
  // settledAt 屏障真正要防的是「二次加分 / 二次发通知」，所以这里比战绩。
  ok(settled2.data.myStats.best === settled.data.myStats.best,
    `重复结算不会二次加分（最绝 ${settled.data.myStats.best} → ${settled2.data.myStats.best}）`)
  ok(settled2.data.myStats.power === settled.data.myStats.power, '重复结算不会二次发出题权')

  // ---------- 11. 清扫两阶段：先开卷，阅卷窗口过后才结算 ----------
  const r2 = await call(A, 'round.create', { source: 'custom', text: '拍下过期的局' })
  const r2id = r2.data.roundId
  sdk.__patch('rounds', r2id, { deadlineTs: Date.now() - 1000 })
  const swept1 = await call('', 'timer.sweep', {})
  ok(swept1.ok && swept1.data.opened === 1 && swept1.data.settled === 0,
    '过期 shooting 局先开卷，不直接结算')
  ok((await call(A, 'round.get', { roundId: r2id })).data.status === 'revealing',
    '过期局进入 revealing，保留阅卷期')
  sdk.__patch('rounds', r2id, { deadlineTs: Date.now() - 25 * 3600 * 1000 })
  const swept2 = await call('', 'timer.sweep', {})
  ok(swept2.ok && swept2.data.settled === 1, '阅卷窗口过后才结算')
  ok((await call(A, 'round.get', { roundId: r2id })).data.status === 'closed', '过期局最终 closed')

  // ---------- 12. 伪造定时事件不再免鉴权 ----------
  sdk.__setOpenid(C)
  const forged = await main({ Type: 'Timer' })
  ok(forged.ok === false && /未知操作/.test(forged.error), '带身份的伪造 Timer 事件不走清扫分支')

  // ---------- 13. 管理 action 鉴权 ----------
  delete process.env.ADMIN_OPENIDS
  const adminAsUser = await call(C, 'admin.seedPrompts', {})
  ok(adminAsUser.ok === false && /权限/.test(adminAsUser.error),
    'ADMIN_OPENIDS 未配置时登录用户不能初始化题库')
  const adminAsConsole = await call('', 'admin.seedPrompts', {})
  ok(adminAsConsole.ok && adminAsConsole.data.seeded > 0, '控制台（无身份）可以初始化题库')
  process.env.ADMIN_OPENIDS = C
  ok((await call(C, 'admin.seedPrompts', {})).ok, 'ADMIN_OPENIDS 中的用户可以初始化题库')
  delete process.env.ADMIN_OPENIDS

  // ---------- 14. 口袋 ----------
  const sp1 = await call(A, 'save.prompt', { promptId: 'p1', no: 1, text: '拍下此刻的风' })
  ok(sp1.ok && sp1.data.length === 1, '口袋存入成功')
  const sp2 = await call(A, 'save.prompt', { promptId: 'p1', no: 1, text: '拍下此刻的风' })
  ok(sp2.data.length === 1, '同一道题只进一次口袋')
  ok((await call(A, 'bootstrap')).data.savedPrompts.length === 1, 'bootstrap 下发 savedPrompts')
  const sp3 = await call(A, 'save.prompt', { promptId: 'p2', text: '' })
  ok(sp3.ok === false && /空卷/.test(sp3.error), '空题不能进袋')
  const rm = await call(A, 'save.remove', { promptId: 'p1' })
  ok(rm.ok && rm.data.length === 0, '从口袋移除生效')

  // ---------- 15. 举报落库 ----------
  const rep1 = await call(A, 'report.create', { reason: 'x' })
  ok(rep1.ok === false, '举报理由太短被拦')
  const rep2 = await call(A, 'report.create', { roundId, reason: '这张图和命题完全无关' })
  ok(rep2.ok && sdk.__all('reports').length === 1, '举报真的落库（不是只弹个框）')
  const rep3 = await call(A, 'report.create', { roundId, entryId: 'no-such-entry', reason: '有问题' })
  ok(rep3.ok === false, '无效答卷引用被拦')

  // ---------- 16. 内容检查：判定违规即拒绝 ----------
  sdk.__ctx.msgSecSuggestion = 'risky'
  const risky = await call(A, 'round.create', { source: 'custom', text: '违规命题' })
  ok(risky.ok === false && /内容检查/.test(risky.error), 'msgSecCheck 判定违规时拒绝提交')
  sdk.__ctx.msgSecSuggestion = 'pass'
  const safe = await call(A, 'round.create', { source: 'custom', text: '正常命题' })
  ok(safe.ok, '检查通过时正常建局')

  // ---------- 17. 开卷订阅消息真的会发 ----------
  process.env.TMPL_ROUND_REVEALED = 'tmpl-reveal'
  const before = sdk.__ctx.sentMessages.length
  const r4 = await call(A, 'round.create', { source: 'custom', text: '拍下第四局' })
  const r4id = r4.data.roundId
  await call(B, 'round.join', { roundId: r4id })
  await call(A, 'entry.submit', { roundId: r4id, fileID: 'cloud://t/a4.jpg' })
  await call(B, 'entry.submit', { roundId: r4id, fileID: 'cloud://t/b4.jpg' })
  const sent = sdk.__ctx.sentMessages.slice(before)
  ok(sent.length === 2 && sent.every((s) => s.templateId === 'tmpl-reveal'),
    `开卷后给 ${sent.length} 位玩家发出卷通知`)
  delete process.env.TMPL_ROUND_REVEALED

  // ---------- 18. submittedCount 不把卧底算成人 ----------
  const r4get = await call(A, 'round.get', { roundId: r4id })
  const undercoverRows = sdk.__all('entries').filter((e) => e.roundId === r4id && e.undercover)
  ok(undercoverRows.length >= 1, `本局已混入 ${undercoverRows.length} 张卧底作品`)
  ok(r4get.data.submittedCount === 2, 'submittedCount 不把卧底算进已交人数')
  const bootA = await call(A, 'bootstrap')
  const card = bootA.data.myRounds.find((c) => c.roundId === r4id)
  ok(card && card.submittedCount === 2, '首页局卡片的 submittedCount 同样排除卧底')

  // ---------- 19. qr.get 复用同一张码 ----------
  // 用「平台接口被调用的次数」来断言，而不是比较返回值：
  // 假实现的 fileID 由 cloudPath 推导，返回的 url 天然相同，
  // 只比 url 的话把缓存整段删掉也照样通过（这条断言曾经就是这样失效的）。
  const rq = await call(A, 'round.create', { source: 'custom', text: '拍下二维码' })
  const rqid = rq.data.roundId
  const qrBefore = sdk.__ctx.wxacodeCalls
  const qr1 = await call(A, 'qr.get', { roundId: rqid })
  const qrAfter1 = sdk.__ctx.wxacodeCalls
  const qr2 = await call(A, 'qr.get', { roundId: rqid })
  const qrAfter2 = sdk.__ctx.wxacodeCalls
  ok(qr1.ok && !!qr1.data.url, '小程序码生成成功')
  ok(!!sdk.__raw('rounds', rqid).qrFileID, '小程序码 fileID 已缓存到局文档')
  ok(qrAfter1 === qrBefore + 1, '首次调用打了一次 wxacode 接口')
  ok(qrAfter2 === qrAfter1, '二次调用没有再打接口（真的复用了，不是返回值恰好相同）')
  ok(qr1.data.url === qr2.data.url, '两次返回同一个码')
  const qrOutsider = await call(C, 'qr.get', { roundId: rqid })
  ok(qrOutsider.ok === false && /不在这局/.test(qrOutsider.error),
    '非成员不能借用别人的局生成码（该接口会往局文档写 qrFileID）')

  // ---------- 19b. 入局必须是原子追加 ----------
  // 群里几个人同时点开卡片时，「读整个 players 数组再整体写回」会互相覆盖，
  // 甚至把别人刚写上的 submitted:true 抹掉。断言它走的是 _.push。
  const rj = await call(A, 'round.create', { source: 'custom', text: '拍下入局' })
  const rjid = rj.data.roundId
  const pushBefore = sdk.__ctx.pushes.filter((x) => x === 'players').length
  const joinC = await call(C, 'round.join', { roundId: rjid })
  ok(joinC.ok && joinC.data.isPlayer === true, '第三位玩家入局成功')
  ok(joinC.data.players.length === 2, '入局后成员数是 2（局主 + 新加入者）')
  ok(sdk.__ctx.pushes.filter((x) => x === 'players').length === pushBefore + 1,
    '入局用 _.push 原子追加，而不是读整个数组再整体写回')

  // ---------- 20. 入局守卫：已开卷 / 已截止不能入局 ----------
  const lateJoin = await call(C, 'round.join', { roundId: r4id })
  ok(lateJoin.ok === false && /阅卷/.test(lateJoin.error), '已开卷的局不能再入局')
  const r5 = await call(A, 'round.create', { source: 'custom', text: '拍下过期未开卷' })
  sdk.__patch('rounds', r5.data.roundId, { deadlineTs: Date.now() - 1000 })
  const expiredJoin = await call(C, 'round.join', { roundId: r5.data.roundId })
  ok(expiredJoin.ok === false && /截止/.test(expiredJoin.error), '已过截止时间的局不能再入局')

  // ---------- 21. 带答卷的举报：校验引用一致性 ----------
  const someEntry = sdk.__all('entries').find((e) => e.roundId === roundId && !e.undercover)
  const rep4 = await call(A, 'report.create', {
    roundId, entryId: someEntry._id, reason: '这张和命题无关'
  })
  ok(rep4.ok && sdk.__all('reports').length === 2, '带答卷的举报落库')
  const rep5 = await call(A, 'report.create', {
    roundId: r4id, entryId: someEntry._id, reason: '局和答卷对不上'
  })
  ok(rep5.ok === false && /对不上/.test(rep5.error), '局与答卷不匹配时拒绝')

  // ---------- 22. 举报去重：同一人对同一目标只留一条待处理 ----------
  const rep6 = await call(A, 'report.create', {
    roundId, entryId: someEntry._id, reason: '再举报一次同一张'
  })
  ok(rep6.ok === false && /已经举报过/.test(rep6.error), '重复举报同一答卷被拦（写入口有闸门）')
  ok(sdk.__all('reports').length === 2, '举报记录没有被重复写入')

  // ---------- 23. 手动开卷：局主专属，且要人齐或已截止 ----------
  const r6 = await call(A, 'round.create', { source: 'custom', text: '拍下手动开卷' })
  const r6id = r6.data.roundId
  await call(B, 'round.join', { roundId: r6id })
  const notOwner = await call(B, 'round.reveal', { roundId: r6id })
  ok(notOwner.ok === false && /出题人/.test(notOwner.error), '只有局主能提前开卷')
  const tooEarly = await call(A, 'round.reveal', { roundId: r6id })
  ok(tooEarly.ok === false && /再等等/.test(tooEarly.error), '人未齐且未截止时不能开卷')
  sdk.__patch('rounds', r6id, { deadlineTs: Date.now() - 1000 })
  ok((await call(A, 'round.reveal', { roundId: r6id })).ok, '截止后局主可以开卷')
  ok((await call(A, 'round.get', { roundId: r6id })).data.status === 'revealing', '开卷后状态为 revealing')
  ok((await call(A, 'round.reveal', { roundId: r6id })).ok, '重复开卷幂等')

  // ---------- 24. 年鉴：契约字段 + 临时图片链接 ----------
  const album = await call(A, 'album.get', {})
  ok(album.ok && album.data.length >= 1, `年鉴收录 ${album.ok ? album.data.length : 0} 条`)
  const albItem = album.data[0]
  ok(!!albItem.entryId && albItem.caption !== undefined && albItem.promptText !== undefined && !!albItem.date,
    '年鉴条目符合 AlbumItem 契约字段')
  ok(/^https:\/\/cdn\.test\//.test(albItem.image), '年鉴图片已换成临时链接')

  // ---------- 25. AI 代出：模型不可用时降级到官方题库 ----------
  const aiP = await call(A, 'ai.prompt', { hint: '拍点什么' })
  ok(aiP.ok && typeof aiP.data.text === 'string' && aiP.data.text.length > 3,
    'AI 不可用时降级出题: ' + aiP.data.text)

  // ---------- 26. 出题权赠与：真的转手，且只能送一次 ----------
  const powerBefore = (await call(A, 'bootstrap')).data.profile.stats.power
  ok(powerBefore >= 1, `最绝奖得主手里有 ${powerBefore} 张出题权`)
  const gift = await call(A, 'power.gift', { roundId, toOpenid: B })
  ok(gift.ok, `赠权成功 → ${gift.ok ? gift.data.toName : gift.error}`)
  ok((await call(A, 'bootstrap')).data.profile.stats.power === powerBefore - 1, '赠权方扣掉一张')
  const powerB = sdk.__all('users').find((u) => u._openid === B).stats.power
  ok(powerB >= 1, `受赠方到账一张（当前 ${powerB}）—— 之前只扣不加，权力会凭空消失`)
  const giftAgain = await call(A, 'power.gift', { roundId, toOpenid: B })
  ok(giftAgain.ok === false && /送出/.test(giftAgain.error), '出题权不能重复赠送')
  const giftByOther = await call(C, 'power.gift', { roundId, toOpenid: B })
  ok(giftByOther.ok === false && /出题权不在你手上/.test(giftByOther.error), '非得主不能赠权')
  const giftToOutsider = await call(B, 'power.gift', { roundId, toOpenid: C })
  ok(giftToOutsider.ok === false, '非本局玩家不能作为受赠方')

  // ---------- 27. 结算窗口：非局主不能把阅卷期直接抹掉 ----------
  // 这是最容易被漏掉的一致性问题：清扫端等 VOTE_WINDOW，结算端却可以立刻关局，
  // 结果任何人都能在截止后一秒把局结算成「三个奖项全空缺」。
  const r7 = await call(A, 'round.create', { source: 'custom', text: '拍下阅卷窗口' })
  const r7id = r7.data.roundId
  await call(B, 'round.join', { roundId: r7id })
  await call(A, 'entry.submit', { roundId: r7id, fileID: 'cloud://t/a7.jpg' })
  await call(B, 'entry.submit', { roundId: r7id, fileID: 'cloud://t/b7.jpg' })
  ok((await call(A, 'round.get', { roundId: r7id })).data.status === 'revealing', '第七局人齐已开卷')
  sdk.__patch('rounds', r7id, { deadlineTs: Date.now() - 1000 })

  const wallB7 = await call(B, 'wall.get', { roundId: r7id })
  ok(wallB7.data.canSettle === false, '非局主在阅卷窗口内 canSettle=false')
  ok(wallB7.data.settleAtTs > Date.now(), '下发了结算窗口结束时间（页面据此显示倒计时）')
  ok(wallB7.data.maxAnnotations === 12, '下发了批注上限（页面据此判断审满目标）')

  const earlyB = await call(B, 'round.settle', { roundId: r7id })
  ok(earlyB.ok === false && /阅卷/.test(earlyB.error),
    '非局主不能在截止后立刻结算（否则阅卷期等于不存在）')
  ok((await call(A, 'wall.get', { roundId: r7id })).data.canSettle === true, '局主可以随时收卷')
  ok((await call(A, 'round.settle', { roundId: r7id })).ok, '局主提前收卷成功')

  // 阅卷窗口结束之后，非局主也可以结算
  const r8 = await call(A, 'round.create', { source: 'custom', text: '拍下窗口结束' })
  const r8id = r8.data.roundId
  await call(B, 'round.join', { roundId: r8id })
  await call(A, 'entry.submit', { roundId: r8id, fileID: 'cloud://t/a8.jpg' })
  await call(B, 'entry.submit', { roundId: r8id, fileID: 'cloud://t/b8.jpg' })
  sdk.__patch('rounds', r8id, { deadlineTs: Date.now() - 25 * 3600 * 1000 })
  ok((await call(B, 'round.settle', { roundId: r8id })).ok, '阅卷窗口结束后非局主也能结算')

  // 结算不能跳过 revealing：清扫还没跑到时，settle 要自己补开卷
  const r9 = await call(A, 'round.create', { source: 'custom', text: '拍下未开卷就结算' })
  const r9id = r9.data.roundId
  await call(B, 'round.join', { roundId: r9id })
  await call(A, 'entry.submit', { roundId: r9id, fileID: 'cloud://t/a9.jpg' })
  sdk.__patch('rounds', r9id, { deadlineTs: Date.now() - 1000 })
  ok((await call(A, 'round.get', { roundId: r9id })).data.status === 'shooting', '第九局仍在交卷中')
  process.env.TMPL_ROUND_REVEALED = 'tmpl-reveal'
  const revealMsgsBefore = sdk.__ctx.sentMessages.length
  ok((await call(A, 'round.settle', { roundId: r9id })).ok, '局主在清扫未跑到时也能结算')
  ok(sdk.__ctx.sentMessages.length > revealMsgsBefore,
    '结算前先补发了开卷通知 —— 证明它经过了 revealing 而不是从 shooting 直跳 closed')
  ok(sdk.__raw('rounds', r9id).status === 'closed', '结算后状态为 closed')
  delete process.env.TMPL_ROUND_REVEALED

  // ---------- 28. 清扫两阶段不在同一轮里「开卷即结算」 ----------
  const r10 = await call(A, 'round.create', { source: 'custom', text: '拍下积压的局' })
  const r10id = r10.data.roundId
  await call(B, 'round.join', { roundId: r10id })
  // 过期超过一整个阅卷窗口且仍是 shooting：模拟定时器停了一天以上
  sdk.__patch('rounds', r10id, { deadlineTs: Date.now() - 30 * 3600 * 1000 })
  const sw1 = await call('', 'timer.sweep', {})
  ok(sw1.ok && sw1.data.opened >= 1 && sw1.data.settled === 0,
    `一轮清扫只开卷不结算（opened=${sw1.ok ? sw1.data.opened : '?'}, settled=${sw1.ok ? sw1.data.settled : '?'}）`)
  ok((await call(A, 'round.get', { roundId: r10id })).data.status === 'revealing',
    '积压的局先进入阅卷期，没有被开卷即结算')
  const sw2 = await call('', 'timer.sweep', {})
  ok(sw2.data.settled >= 1, '下一轮清扫才把它结算 —— 阅卷期是真实存在的')

  // ---------- 29. 举报：非本局成员不能举报别人的答卷 ----------
  const repOutsider = await call(C, 'report.create', {
    roundId, entryId: someEntry._id, reason: '我不是这局的人'
  })
  ok(repOutsider.ok === false && /不在这局/.test(repOutsider.error),
    '非成员不能举报别人局里的答卷')

  console.log(`\n全部通过 ✓ (${pass} 断言)`)
}

main_().catch((e) => {
  console.error('\n✗ 云模式冒烟测试失败:', e.message)
  process.exit(1)
})
