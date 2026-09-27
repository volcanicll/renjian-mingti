/**
 * lib/game.js —— 「人间命题」游戏核心逻辑
 *
 * 状态机：shooting（交卷中）→ revealing（揭晓/阅卷）→ closed（已结算）
 * 匿名原则：wall.get 下发的答卷绝不携带作者字段，settle 时才回填。
 */
const ai = require('./ai')

const HOUR = 3600 * 1000
/** 局模式：flash 闪电局 2 小时 / overnight 长夜局 24 小时 */
const MODE_HOURS = { flash: 2, overnight: 24 }
/** 有效答卷少于此数时混入一张往届作品当卧底 */
const UNDERCOVER_MIN = 4
/** 连击窗口：48 小时内再次作答即续上 */
const COMBO_WINDOW = 48 * HOUR
/** 快门限时（秒） */
const SHOOT_LIMIT_SEC = 60

/* ================= 用户 ================= */

async function getOrCreateUser(db, openid) {
  const col = db.collection('users')
  const res = await col.where({ _openid: openid }).limit(1).get()
  if (res.data.length) return res.data[0]
  const user = {
    _openid: openid,
    nickname: '同学',
    avatar: '😎',
    examNo: examNoOf(openid),
    stats: { best: 0, lazy: 0, power: 0, combo: 0 },
    lastSubmitTs: 0,
    createdAt: Date.now()
  }
  try {
    await col.add({ data: user })
  } catch (e) {
    // 并发创建竞态：再查一次
    const again = await col.where({ _openid: openid }).limit(1).get()
    if (again.data.length) return again.data[0]
    throw e
  }
  return user
}

function examNoOf(openid) {
  let h = 0
  for (let i = 0; i < openid.length; i++) h = ((h << 5) + h + openid.charCodeAt(i)) >>> 0
  return String(1000 + (h % 9000))
}

async function profileUpdate(cloud, db, openid, patch) {
  const user = await getOrCreateUser(db, openid)
  const upd = {}
  if (typeof patch.nickname === 'string' && patch.nickname.trim()) {
    const name = patch.nickname.trim().slice(0, 12)
    await secCheck(cloud, name, '昵称')
    upd.nickname = name
  }
  if (typeof patch.avatar === 'string' && patch.avatar) upd.avatar = patch.avatar.slice(0, 512)
  if (Object.keys(upd).length) {
    await db.collection('users').doc(user._id).update({ data: upd })
  }
  return { ...user, ...upd, stats: user.stats }
}

/** 内容安全检查（文本）：失败仅记日志不阻断（个人版 msgSecCheck 有配额限制） */
async function secCheck(cloud, text, what) {
  try {
    // eslint-disable-next-line no-unused-vars
    const r = await cloud.openapi.security.msgSecCheck({ content: text })
  } catch (e) {
    console.warn(`[secCheck] ${what} 检查未通过或不可用:`, e.errCode || e.message)
  }
}

/* ================= 工具 ================= */

async function nextRoundNo(db) {
  const counters = db.collection('counters')
  const incRes = await counters.where({ _id: 'roundSeq' }).update({ data: { seq: db.command.inc(1) } })
  if (incRes.stats.updated === 0) {
    try {
      await counters.add({ data: { _id: 'roundSeq', seq: 1025 } })
      return 1024
    } catch (e) {
      const again = await counters.doc('roundSeq').get()
      return again.data.seq - 1
    }
  }
  const doc = await counters.doc('roundSeq').get()
  return doc.data.seq - 1
}

/** 批量把 fileID 转临时 https 链接（失败回退原值） */
async function withUrls(cloud, items, field = 'image') {
  const ids = [...new Set(items.map((it) => it[field]).filter((v) => v && v.startsWith('cloud://')))]
  if (!ids.length) return items
  try {
    const res = await cloud.getTempFileURL({ fileList: ids })
    const map = {}
    res.fileList.forEach((f) => { if (f.tempFileURL) map[f.fileID] = f.tempFileURL })
    return items.map((it) => ({ ...it, [field]: map[it[field]] || it[field] }))
  } catch (e) {
    console.warn('[withUrls] 临时链接换取失败:', e.message)
    return items
  }
}

function todayStr() {
  const d = new Date(Date.now() + 8 * HOUR) // 东八区
  return d.toISOString().slice(0, 10)
}

/* ================= 今日命题 / bootstrap ================= */

async function pickTodayPrompt(db) {
  const prompts = db.collection('prompts')
  const today = todayStr()
  const mine = await prompts.where({ useDate: today, active: true }).limit(1).get()
  if (mine.data.length) return mine.data[0]
  // 今天还没定题：随机取一条空闲的并占用
  const idle = await prompts.where({ useDate: null, active: true }).limit(50).get()
  const pool = idle.data.filter((p) => p.text)
  if (!pool.length) return null
  const picked = pool[Math.floor(Math.random() * pool.length)]
  try {
    await prompts.doc(picked._id).update({ data: { useDate: today } })
  } catch (e) { /* 并发占用竞态可容忍 */ }
  return picked
}

async function bootstrap(cloud, db, openid) {
  const user = await getOrCreateUser(db, openid)

  const promptDoc = await pickTodayPrompt(db)
  const no = await nextRoundNo(db)
  const today = promptDoc
    ? { promptId: promptDoc._id, no, text: promptDoc.text }
    : { promptId: '', no, text: '拍下你此刻最想分享的一秒。' }

  // 我参与的局（未结束的在前）
  const roundsRes = await db.collection('rounds')
    .where({ 'players.openid': openid })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get()

  const openRounds = roundsRes.data.filter((r) => r.status !== 'closed')
  const cards = []
  for (const r of openRounds) {
    const cnt = await countEntries(db, r._id)
    cards.push(await roundCard(cloud, db, r, cnt, openid))
  }

  // 昨日战报：最近一局含我且已结算的
  let yesterdayReport = null
  const closed = roundsRes.data.find((r) => r.status === 'closed' && r.result && r.result.awards)
  if (closed) {
    const a = closed.result.awards
    yesterdayReport = {
      roundId: closed._id,
      promptText: closed.promptText,
      best: a.best ? { ownerName: a.best.ownerName, caption: a.best.caption } : null,
      lazy: a.lazy ? { ownerName: a.lazy.ownerName, caption: a.lazy.caption } : null
    }
    if (!yesterdayReport.best) yesterdayReport = null
  }

  return {
    today,
    myRounds: cards,
    yesterdayReport,
    nextTeaser: (closed && closed.result && closed.result.nextTeaser) || null,
    profile: {
      openid,
      nickname: user.nickname,
      avatar: user.avatar,
      examNo: user.examNo,
      stats: user.stats
    }
  }
}

async function countEntries(db, roundId) {
  const c = await db.collection('entries').where({ roundId }).count()
  return c.total
}

async function roundCard(cloud, db, r, submittedCount, forOpenid) {
  const owner = await getUserBrief(db, r.ownerOpenid)
  return {
    roundId: r._id,
    promptText: r.promptText,
    emoji: r.emoji || '📷',
    mode: r.mode || 'flash',
    hasUndercover: !!r.undercover,
    role: r.ownerOpenid === forOpenid ? 'owner' : 'player',
    ownerName: (owner && owner.nickname) || '同学',
    status: r.status,
    submittedCount,
    playerCount: r.players.length,
    deadlineTs: r.deadlineTs,
    iSubmitted: !!r.players.find((p) => p.openid === forOpenid && p.submitted)
  }
}

async function getUserBrief(db, openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  return res.data[0] || null
}

/* ================= 创建 / 详情 / 开卷 ================= */

async function createRound(cloud, db, openid, payload) {
  const source = ['official', 'ai', 'custom'].includes(payload.source) ? payload.source : 'official'
  let promptText = ''

  if (source === 'custom') {
    promptText = String(payload.text || '').trim().slice(0, 40)
    if (!promptText) throw new Error('命题不能为空')
    await secCheck(cloud, promptText, '自定义命题')
  } else if (source === 'ai') {
    const exclude = await recentPrompts(db, openid)
    const gen = await ai.genPrompt({ hint: payload.hint || '', exclude })
    if (gen) promptText = gen.text
    else {
      const fallback = await pickTodayPrompt(db)
      promptText = (fallback && fallback.text) || '拍下你此刻最想分享的一秒。'
    }
  } else {
    const p = await pickTodayPrompt(db)
    promptText = (p && p.text) || '拍下你此刻最想分享的一秒。'
  }

  const user = await getOrCreateUser(db, openid)
  const now = Date.now()
  const no = await nextRoundNo(db)
  const mode = payload.mode === 'overnight' ? 'overnight' : 'flash'
  const emojis = ['🌬️', '🍩', '🪑', '🌈', '☕', '🐈', '🌙', '🎈']
  const addRes = await db.collection('rounds').add({
    data: {
      no,
      promptText,
      promptSource: source,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      mode,
      shootLimitSec: SHOOT_LIMIT_SEC,
      status: 'shooting',
      ownerOpenid: openid,
      players: [{ openid, nickname: user.nickname, avatar: user.avatar, submitted: false }],
      deadlineTs: now + MODE_HOURS[mode] * HOUR,
      createdAt: now,
      undercover: null,
      gift: null,
      result: null
    }
  })
  return getRound(cloud, db, openid, { roundId: addRes._id })
}

async function recentPrompts(db, openid) {
  const res = await db.collection('rounds')
    .where({ ownerOpenid: openid })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .field({ promptText: true })
    .get()
  return res.data.map((r) => r.promptText)
}

async function requireRound(db, roundId) {
  const res = await db.collection('rounds').doc(roundId).get().catch(() => null)
  if (!res || !res.data) throw new Error('局不存在或已过期')
  return res.data
}

async function getRound(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  const entries = await db.collection('entries').where({ roundId: r._id }).get()
  const mine = entries.data.find((e) => e.openid === openid)
  const myEntryList = mine ? await withUrls(cloud, [mine]) : []

  return {
    roundId: r._id,
    no: r.no,
    promptText: r.promptText,
    promptSource: r.promptSource,
    emoji: r.emoji,
    mode: r.mode || 'flash',
    shootLimitSec: r.shootLimitSec || SHOOT_LIMIT_SEC,
    status: r.status,
    createdAt: r.createdAt,
    deadlineTs: r.deadlineTs,
    submittedCount: entries.data.filter((e) => !e.undercover).length,
    hasUndercover: !!r.undercover,
    ownerOpenid: r.ownerOpenid,
    ownerName: ((await getUserBrief(db, r.ownerOpenid)) || {}).nickname || '同学',
    isMine: r.ownerOpenid === openid,
    players: r.players.map((p) => ({ openid: p.openid, nickname: p.nickname, avatar: p.avatar, submitted: p.submitted })),
    myEntry: myEntryList.length
      ? {
          entryId: myEntryList[0]._id,
          image: myEntryList[0].image,
          caption: myEntryList[0].caption,
          award: myEntryList[0].award || null
        }
      : null
  }
}

async function revealRound(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (r.ownerOpenid !== openid) throw new Error('只有出题人能提前开卷')
  if (r.status !== 'shooting') return { ok: true }
  const allIn = r.players.every((p) => p.submitted)
  const expired = Date.now() > r.deadlineTs
  if (!allIn && !expired) throw new Error('还有人没交卷，再等等')
  await db.collection('rounds').doc(r._id).update({ data: { status: 'revealing' } })
  await ensureUndercover(cloud, db, r)
  return { ok: true }
}

/* ================= 交卷 ================= */

async function submitEntry(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (r.status !== 'shooting') throw new Error('这局已经交卷截止了')
  if (Date.now() > r.deadlineTs) throw new Error('已过截止时间，等出题人开卷吧')
  const meInRound = r.players.find((p) => p.openid === openid)
  if (!meInRound) throw new Error('你不在这局里，让出题人把卡片发给你')
  if (meInRound.submitted) throw new Error('你已经交过卷了')

  const blank = !!payload.blank || !payload.fileID
  const fileID = String(payload.fileID || '')
  if (!blank && !fileID.startsWith('cloud://')) throw new Error('图片上传失败了，重试一次')

  const caption = String(payload.caption || '').trim().slice(0, 30)
  if (caption) await secCheck(cloud, caption, '配文')

  // AI 判定：20s 内出结果，否则按"存疑放行"处理（白卷直接放行）
  let verdict = { verdict: 'suspect', confidence: 0, reason: 'AI 裁判缺席，放行，交给玩家裁决。' }
  if (!blank) {
    try {
      const base64 = await downloadAsBase64(cloud, fileID, 3 * 1024 * 1024)
      if (base64) {
        const j = await Promise.race([
          ai.judge({ imageBase64: base64, promptText: r.promptText }),
          new Promise((resolve) => setTimeout(() => resolve(null), 20000))
        ])
        if (j && j.verdict) verdict = j
      }
    } catch (e) {
      console.warn('[submitEntry] AI 判定失败:', e.message)
    }
  }

  const now = Date.now()
  await db.collection('entries').add({
    data: {
      roundId: r._id,
      openid,
      fileID,
      isBlank: blank,
      caption: blank
        ? '（白卷 —— 本人放弃作答，放弃本身即是作品）'
        : (caption || '（本人拒绝配文，行为本身即是作品）'),
      aiVerdict: verdict.verdict,
      aiReason: verdict.reason || '',
      aiConfidence: Number(verdict.confidence) || 0,
      award: null,
      createdAt: now
    }
  })

  // 标记已交卷（players 数组内嵌更新）
  const _ = db.command
  const players = r.players.map((p) =>
    p.openid === openid ? { ...p, submitted: true } : p)
  await db.collection('rounds').doc(r._id).update({ data: { players } })

  // 连续作答（48 小时内续上）
  await bumpCombo(db, openid)

  // 人齐自动开卷（开卷时再决定是否混卧底）
  if (players.every((p) => p.submitted)) {
    await db.collection('rounds').doc(r._id).update({ data: { status: 'revealing' } })
    await ensureUndercover(cloud, db, { ...r, players })
  }
  return { ok: true }
}

/** 连续作答：48 小时内再交卷即 combo+1，否则从 1 重新数 */
async function bumpCombo(db, openid) {
  try {
    const u = await getOrCreateUser(db, openid)
    const last = u.lastSubmitTs || 0
    const combo = last && Date.now() - last <= COMBO_WINDOW ? (u.stats && u.stats.combo || 0) + 1 : 1
    const _ = db.command
    await db.collection('users').doc(u._id).update({
      data: { lastSubmitTs: Date.now(), 'stats.combo': combo }
    })
  } catch (e) {
    console.warn('[bumpCombo]', e.message)
  }
}

/**
 * 人数不足时混入一张往届作品当「卧底」，让大家抓
 * 卧底不参与评奖，但会出现在 AI 点评里
 */
async function ensureUndercover(cloud, db, r) {
  try {
    if (r.undercover) return
    const own = await db.collection('entries').where({ roundId: r._id }).get()
    const valid = own.data.filter((e) => e.aiVerdict !== 'off')
    if (valid.length >= UNDERCOVER_MIN) return

    const hist = await db.collection('entries')
      .where({ openid: db.command.neq('__undercover__') })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    const pool = hist.data.filter((e) => e.roundId !== r._id && !e.undercover && e.fileID)
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    const srcRound = await db.collection('rounds').doc(pick.roundId).get().catch(() => null)
    const add = await db.collection('entries').add({
      data: {
        roundId: r._id,
        openid: '__undercover__',
        fileID: pick.fileID,
        caption: pick.caption || '（往届作品）',
        isBlank: false,
        undercover: true,
        from: (srcRound && srcRound.data && srcRound.data.promptText) || '往届',
        aiVerdict: 'pass',
        aiReason: '这张不是本届作品——它是从往届年鉴里混进来的卧底。',
        aiConfidence: 1,
        award: null,
        createdAt: (r.createdAt || Date.now()) - 1000
      }
    })
    await db.collection('rounds').doc(r._id).update({
      data: { undercover: { entryId: add._id, caption: pick.caption || '（往届作品）', from: '往届' } }
    })
  } catch (e) {
    console.warn('[ensureUndercover]', e.message)
  }
}

async function downloadAsBase64(cloud, fileID, maxBytes) {
  try {
    const res = await cloud.downloadFile({ fileID })
    const buf = res.fileContent
    if (!buf || buf.length > maxBytes) return ''
    return buf.toString('base64')
  } catch (e) {
    console.warn('[downloadAsBase64]', e.message)
    return ''
  }
}

/* ================= 揭晓墙 ================= */

async function getWall(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (r.status === 'shooting') throw new Error('还没到揭晓时间')

  const entriesRes = await db.collection('entries')
    .where({ roundId: r._id, aiVerdict: db.command.neq('off') })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get()

  // 我的猜测与批注
  const guesses = await db.collection('guesses').where({ roundId: r._id, voterOpenid: openid }).get()
  const votes = await db.collection('votes').where({ roundId: r._id, voterOpenid: openid }).get()
  const guessMap = {}
  guesses.data.forEach((g) => { guessMap[g.entryId] = g.guessedOpenid })
  const voteMap = {}
  votes.data.forEach((v) => { voteMap[v.entryId] = v.tag })

  const entryById = {}
  entriesRes.data.forEach((e) => { entryById[e._id] = e })

  let items = shuffle(entriesRes.data.map((e) => ({
    entryId: e._id,
    image: e.fileID,
    caption: e.caption,
    isMine: e.openid === openid,
    aiVerdict: e.aiVerdict,
    aiReason: e.aiReason,
    myGuess: guessMap[e._id]
      ? { openid: guessMap[e._id], correct: entryById[e._id].openid === guessMap[e._id] }
      : null,
    myVote: voteMap[e._id] || null
  })))
  items = await withUrls(cloud, items)

  const hasUndercover = !!r.undercover
  const players = r.players.map((p) => ({ openid: p.openid, nickname: p.nickname, avatar: p.avatar }))
  if (hasUndercover) {
    players.push({ openid: '__undercover__', nickname: '卧底', avatar: '🕵️', undercover: true })
  }

  return {
    total: items.length,
    reviewed: Object.keys(voteMap).length,
    hasUndercover,
    players,
    entries: items
  }
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function castGuess(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (r.status === 'shooting') throw new Error('还没到揭晓时间')
  const entry = await db.collection('entries').doc(payload.entryId).get().catch(() => null)
  if (!entry || !entry.data || entry.data.roundId !== r._id) throw new Error('答卷不存在')

  const key = { roundId: r._id, voterOpenid: openid, entryId: payload.entryId }
  const exist = await db.collection('guesses').where(key).limit(1).get()
  if (exist.data.length) {
    await db.collection('guesses').doc(exist.data[0]._id).update({
      data: { guessedOpenid: payload.guessedOpenid }
    })
  } else {
    await db.collection('guesses').add({ data: { ...key, guessedOpenid: payload.guessedOpenid } })
  }
  const correct = entry.data.openid === payload.guessedOpenid
  if (entry.data.undercover) {
    return { correct, actualName: correct ? '卧底 · 往届作品' : '神秘同学' }
  }
  const actualUser = await getUserBrief(db, entry.data.openid)
  return { correct, actualName: (actualUser && actualUser.nickname) || '神秘同学' }
}

async function castVote(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (r.status === 'shooting') throw new Error('还没开卷，先等等')
  if (r.status !== 'revealing') throw new Error('这局已经结算了')
  if (!['best', 'lazy', 'quote'].includes(payload.tag)) throw new Error('批注标签不合法')
  if (Date.now() > r.deadlineTs + 24 * HOUR) throw new Error('阅卷通道已关闭')

  const entry = await db.collection('entries').doc(payload.entryId).get().catch(() => null)
  if (!entry || !entry.data || entry.data.roundId !== r._id) throw new Error('答卷不存在')

  const key = { roundId: r._id, voterOpenid: openid, entryId: payload.entryId }
  const exist = await db.collection('votes').where(key).limit(1).get()
  if (exist.data.length) {
    await db.collection('votes').doc(exist.data[0]._id).update({ data: { tag: payload.tag } })
  } else {
    await db.collection('votes').add({ data: { ...key, tag: payload.tag, createdAt: Date.now() } })
  }
  return { ok: true }
}

/* ================= 结算 ================= */

/** 兜底点评池（AI 不可用时），文案与前端演示池一致 */
const FALLBACK_COMMENTS = [
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

function hashStr(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/**
 * 结算核心（幂等）。internal=true 表示定时触发调用（无调用者视角字段需求）
 */
async function settleCore(cloud, db, r) {
  if (r.result && r.result.settledAt) return r.result

  // 兜底：定时清扫直接结算时也要先决定是否混卧底
  await ensureUndercover(cloud, db, r)
  const freshR = await db.collection('rounds').doc(r._id).get().catch(() => null)
  if (freshR && freshR.data) r = freshR.data

  const entriesRes = await db.collection('entries')
    .where({ roundId: r._id, aiVerdict: db.command.neq('off') })
    .orderBy('createdAt', 'asc')
    .limit(100)
  const entries = entriesRes.data
  const byId = {}
  entries.forEach((e) => { byId[e._id] = e })

  // 聚合票数
  const votesRes = await db.collection('votes').where({ roundId: r._id }).limit(1000).get()
  const tally = { best: {}, lazy: {}, quote: {} }
  votesRes.data.forEach((v) => {
    if (!byId[v.entryId] || !tally[v.tag]) return
    tally[v.tag][v.entryId] = (tally[v.tag][v.entryId] || 0) + 1
  })

  const topOf = (map) => {
    let bestId = null
    let bestN = 0
    for (const [id, n] of Object.entries(map)) {
      // 卧底作品不参与评奖
      if (byId[id] && byId[id].undercover) continue
      // 并列时取交卷更早者
      if (n > bestN || (n === bestN && bestId && byId[id].createdAt < byId[bestId].createdAt)) {
        bestN = n
        bestId = id
      }
    }
    if (!bestId) return null
    const e = byId[bestId]
    return { entryId: e._id, fileID: e.fileID, caption: e.caption, openid: e.openid, votes: bestN }
  }

  const rawAwards = { best: topOf(tally.best), lazy: topOf(tally.lazy), quote: topOf(tally.quote) }

  // 回填作者姓名，并映射为前端契约字段（fileID→image，openid→ownerOpenid）
  const awards = {}
  for (const tag of ['best', 'lazy', 'quote']) {
    const a = rawAwards[tag]
    if (!a) { awards[tag] = null; continue }
    const u = await getUserBrief(db, a.openid)
    awards[tag] = {
      entryId: a.entryId,
      image: a.fileID,
      caption: a.caption,
      votes: a.votes,
      ownerOpenid: a.openid,
      ownerName: (u && u.nickname) || '神秘同学'
    }
  }

  // AI 红笔点评（批量一次调用；失败走兜底池）
  let texts = null
  if (entries.length) {
    texts = await ai.comments({
      promptText: r.promptText,
      items: entries.map((e) => e.caption)
    })
  }
  const comments = entries.map((e, i) => {
    let text = texts && texts[i]
    if (!text || typeof text !== 'string') {
      text = FALLBACK_COMMENTS[hashStr(e._id) % FALLBACK_COMMENTS.length]
    }
    return { entryId: e._id, text, _owner: e.openid }
  })
  // 补充 ownerName/caption 后去掉内部字段
  const finalComments = []
  for (const c of comments) {
    const e = byId[c.entryId] || {}
    const u = e.undercover ? null : await getUserBrief(db, c._owner)
    finalComments.push({
      entryId: c.entryId,
      ownerName: e.undercover ? '卧底 · 往届' : ((u && u.nickname) || '神秘同学'),
      caption: e.caption || '',
      text: c.text
    })
  }

  // 发奖：更新用户战绩
  if (awards.best) await bumpStats(db, awards.best.ownerOpenid, 'best', 'power')
  if (awards.lazy) await bumpStats(db, awards.lazy.ownerOpenid, 'lazy')
  if (awards.quote) await bumpStats(db, awards.quote.ownerOpenid, 'quote')

  // 明日预告：下局出题人 + 打码后的悬念
  const nextTeaser = await makeTeaser(db, r, awards)

  const result = {
    awards,
    comments: finalComments,
    winnerOpenid: awards.best ? awards.best.ownerOpenid : null,
    undercover: r.undercover || null,
    nextTeaser,
    gift: r.gift || null,
    settledAt: Date.now()
  }

  // 订阅消息：通知最绝得主（内部自带 try/catch，失败不影响结算）
  await notifyWinner(cloud, result, r)

  await db.collection('rounds').doc(r._id).update({
    data: { status: 'closed', result }
  })
  return result
}

async function bumpStats(db, openid, ...keys) {
  const _ = db.command
  const upd = {}
  keys.forEach((k) => { upd[`stats.${k}`] = _.inc(1) })
  await db.collection('users').where({ _openid: openid }).update({ data: upd })
}

async function notifyWinner(cloud, result, round) {
  try {
    const tmplId = process.env.TMPL_GOT_VOTED
    if (!tmplId || !result.winnerOpenid || !result.awards.best) return
    await cloud.openapi.subscribeMessage.send({
      touser: result.winnerOpenid,
      templateId: tmplId,
      page: `pages/result/index?roundId=${round._id}`,
      data: {
        thing1: { value: round.promptText.slice(0, 20) },
        thing2: { value: `你的作品被投了最绝奖`.slice(0, 20) }
      }
    })
  } catch (e) {
    console.warn('[notifyWinner] 订阅消息发送失败（忽略）:', e.errCode || e.message)
  }
}

/** settle action：结算 + 组装调用者视角结果 */
async function settleAction(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  const expired = Date.now() > r.deadlineTs
  const allIn = r.players.every((p) => p.submitted)
  if (!expired && !(r.ownerOpenid === openid && allIn) && r.status !== 'closed') {
    throw new Error('还没到揭晓时间')
  }

  const result = await settleCore(cloud, db, r)
  const me = await getOrCreateUser(db, openid)

  // 奖项图片换临时链接
  const awards = { best: result.awards.best, lazy: result.awards.lazy, quote: result.awards.quote }
  for (const tag of ['best', 'lazy', 'quote']) {
    if (awards[tag]) {
      const [withUrl] = await withUrls(cloud, [awards[tag]])
      awards[tag] = withUrl
    }
  }

  // 我的猜人成绩（含抓卧底）
  const guesses = await db.collection('guesses').where({ roundId: r._id, voterOpenid: openid }).get()
  const entriesRes = await db.collection('entries').where({ roundId: r._id }).field({ openid: true, undercover: true }).get()
  const entryOwnerMap = {}
  entriesRes.data.forEach((e) => { entryOwnerMap[e._id] = e.openid })
  let correct = 0
  guesses.data.forEach((g) => { if (entryOwnerMap[g.entryId] === g.guessedOpenid) correct += 1 })
  const ucId = result.undercover && result.undercover.entryId
  const undercoverHit = !!(ucId && guesses.data.find((g) => g.entryId === ucId && g.guessedOpenid === '__undercover__'))

  return {
    round: { roundId: r._id, no: r.no, promptText: r.promptText, mode: r.mode || 'flash' },
    awards,
    comments: result.comments,
    iWonPower: !!(result.winnerOpenid === openid && !result.gift),
    myStats: me.stats,
    guessScore: {
      correct,
      total: guesses.data.length,
      undercoverHit,
      hasUndercover: !!result.undercover
    },
    undercover: result.undercover || null,
    nextTeaser: result.nextTeaser || null,
    gift: result.gift || null,
    players: (r.players || []).map((p) => ({ openid: p.openid, nickname: p.nickname, avatar: p.avatar }))
  }
}

/** 定时清扫：过期局自动结算 */
async function sweepExpired(cloud, db) {
  const res = await db.collection('rounds')
    .where({ status: db.command.in(['shooting', 'revealing']), deadlineTs: db.command.lt(Date.now()) })
    .limit(10)
    .get()
  let swept = 0
  for (const r of res.data) {
    try {
      await settleCore(cloud, db, r)
      swept += 1
    } catch (e) {
      console.error(`[sweepExpired] round=${r._id}`, e)
    }
  }
  return swept
}

/* ================= 年鉴 / 二维码 / AI 出题 ================= */

async function getAlbum(cloud, db) {
  const res = await db.collection('rounds')
    .where({ status: 'closed' })
    .orderBy('result.settledAt', 'desc')
    .limit(50)
    .get()
  const items = []
  res.data.forEach((r) => {
    const b = r.result && r.result.awards && r.result.awards.best
    if (!b) return
    const d = new Date(r.result.settledAt || r.createdAt)
    items.push({
      entryId: b.entryId,
      image: b.fileID,
      caption: b.caption,
      date: `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`,
      promptText: `「${r.promptText}」`,
      ownerName: b.ownerName
    })
  })
  return withUrls(cloud, items)
}

async function getQrCode(cloud, db, openid, payload) {
  try {
    const scene = String(payload.roundId || '').slice(-8) || 'home'
    const qr = await cloud.openapi.wxacode.getUnlimited({
      scene: 'r=' + scene,
      page: 'pages/home/index',
      checkPath: false,
      envVersion: 'release'
    })
    if (!qr || !qr.buffer) return { url: null }
    const up = await cloud.uploadFile({
      cloudPath: `qr/${scene}-${Date.now()}.png`,
      fileContent: qr.buffer
    })
    const urls = await cloud.getTempFileURL({ fileList: [up.fileID] })
    return { url: (urls.fileList[0] && urls.fileList[0].tempFileURL) || null }
  } catch (e) {
    // 未发布/体验版环境可能受限，海报降级用假码
    console.warn('[getQrCode]', e.errCode || e.message)
    return { url: null }
  }
}

/** 明日预告：把命题打成悬念（保留头尾与标点，其余化○） */
function maskPrompt(text) {
  const s = String(text || '')
  if (s.length <= 2) return s
  const keep = (ch) => /[。，、？！「」“”'’]/.test(ch)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (i === 0 || i === s.length - 1 || keep(ch)) out += ch
    else out += '○'
  }
  if (!/[^\s。，、？！「」“”'’○]/.test(out.slice(1, -1))) out = s[0] + s[1] + out.slice(2)
  return out
}

/** 明日预告：下局出题人（出题权持有者）+ 打码后的下一题悬念 */
async function makeTeaser(db, r, awards) {
  const ownerOpenid = (r.gift && r.gift.to) ||
    (awards && awards.best && awards.best.ownerOpenid) ||
    r.ownerOpenid
  let text = ''
  try {
    const p = await db.collection('prompts').limit(50).get()
    const pool = (p.data || []).filter((x) => x.text)
    if (pool.length) text = pool[Math.floor(Math.random() * pool.length)].text
  } catch (e) { /* 题库不可用时用兜底文案 */ }
  if (!text) text = '拍下你此刻最想分享的一秒。'
  const u = await getUserBrief(db, ownerOpenid)
  return {
    ownerOpenid,
    ownerName: (u && u.nickname) || '神秘同学',
    hint: maskPrompt(text)
  }
}

/** 把本局赢得的出题权赠给同局某位玩家——出题权社交货币化 */
async function giftPower(cloud, db, openid, payload) {
  const r = await requireRound(db, payload.roundId)
  if (!r.result || r.result.winnerOpenid !== openid) throw new Error('本局的出题权不在你手上')
  if (r.gift) throw new Error('出题权已经送出去了')
  if (!r.players.find((p) => p.openid === payload.toOpenid)) throw new Error('这位同学不在本局')
  const me = await getOrCreateUser(db, openid)
  if (((me.stats && me.stats.power) || 0) <= 0) throw new Error('手里没有出题权')

  const _ = db.command
  await db.collection('users').doc(me._id).update({ data: { 'stats.power': _.inc(-1) } })
  await db.collection('users').where({ _openid: payload.toOpenid }).update({ data: { 'stats.power': _.inc(1) } })

  const to = await getUserBrief(db, payload.toOpenid)
  const gift = { to: payload.toOpenid, at: Date.now() }
  const teaser = await makeTeaser(db, { ...r, gift }, r.result.awards)
  await db.collection('rounds').doc(r._id).update({
    data: { gift, 'result.gift': gift, 'result.nextTeaser': teaser }
  })

  try {
    const tmplId = process.env.TMPL_YOUR_TURN
    if (tmplId) {
      await cloud.openapi.subscribeMessage.send({
        touser: payload.toOpenid,
        templateId: tmplId,
        page: `pages/home/index`,
        data: {
          thing1: { value: '出题权' },
          thing2: { value: `${me.nickname || '同学'}把出题权送给了你`.slice(0, 20) }
        }
      })
    }
  } catch (e) {
    console.warn('[giftPower] 订阅消息发送失败（忽略）:', e.errCode || e.message)
  }

  return {
    ok: true,
    toName: (to && to.nickname) || '这位同学',
    power: Math.max(0, ((me.stats && me.stats.power) || 0) - 1)
  }
}

async function aiPromptAction(cloud, db, openid, payload) {
  const exclude = await recentPrompts(db, openid)
  const gen = await ai.genPrompt({ hint: String(payload.hint || ''), exclude })
  if (gen) return gen
  const p = await pickTodayPrompt(db)
  return { text: (p && p.text) || '拍下你此刻说不出口的那句话。' }
}

module.exports = {
  bootstrap,
  profileUpdate,
  createRound,
  getRound,
  revealRound,
  submitEntry,
  getWall,
  castGuess,
  castVote,
  settleAction,
  giftPower,
  sweepExpired,
  getAlbum,
  getQrCode,
  aiPromptAction
}
