/**
 * 演示模式适配器 —— 无云环境时在本地完整跑通玩法闭环
 * 状态存 storage；照片用 chooseMedia 临时路径（重启后失效，演示可接受）
 *
 * v2 玩法：闪电局/长夜局 · 卧底作品 · 白卷 · 金句奖 · 出题权可赠与 · 连击 · 明日预告
 */
import {
  NPC_PLAYERS, ME, PROMPT_POOL, NPC_ENTRY_POOL, AI_COMMENT_POOL, ALBUM_SEED,
  YESTERDAY_REPORT, UNDERCOVER_POOL, BLANK_CAPTIONS, BLANK_NOTES, maskPrompt
} from '@/mock/data'

const KEY = 'rmti_mock_state_v1'
const HOUR = 3600 * 1000

/** 局模式：闪电局 2 小时（默认）/ 长夜局 24 小时 */
const MODE_HOURS = { flash: 2, overnight: 24 }
/** 有效答卷少于此数时混入一张卧底作品 */
const UNDERCOVER_MIN = 4
/** 连击窗口：48 小时内再次作答即续上 */
const COMBO_WINDOW = 48 * HOUR
/** 快门限时（秒）：超时不强制，但会催 */
const SHOOT_LIMIT_SEC = 60

/* ---------- 工具 ---------- */
const now = () => Date.now()
const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)
const shuffle = (arr, seed = 1) => {
  const a = arr.slice()
  let s = seed * 9301 + 49297
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const hash = (str) => {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}
const fmtDate = (ts) => {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function load() {
  try {
    const raw = uni.getStorageSync(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* 损坏则重建 */ }
  return fresh()
}

function fresh() {
  return {
    profile: { ...ME, examNo: '1024', stats: { best: 7, lazy: 3, power: 1, combo: 0 }, lastSubmitTs: 0 },
    rounds: {},
    album: ALBUM_SEED.slice(),
    usedPrompts: [],
    roundSeq: 1024
  }
}

let cache = null
const save = () => uni.setStorageSync(KEY, JSON.stringify(cache))
const db = () => {
  if (!cache) {
    cache = load()
    // 兼容旧存档：补齐 v2 字段
    if (!cache.profile.stats) cache.profile.stats = { best: 0, lazy: 0, power: 0, combo: 0 }
    if (typeof cache.profile.stats.combo !== 'number') cache.profile.stats.combo = 0
    if (!cache.profile.lastSubmitTs) cache.profile.lastSubmitTs = 0
  }
  return cache
}

/** 今日官方命题：按日期确定性轮换 */
function todayPrompt() {
  const day = Math.floor(now() / (24 * HOUR))
  const p = PROMPT_POOL[day % PROMPT_POOL.length]
  return { promptId: day % PROMPT_POOL.length, no: 1000 + (day % 500), text: p.text }
}

function roundCard(r) {
  const me = r.players.find((p) => p.openid === ME.openid)
  const mine = r.entries.find((e) => e.ownerOpenid === ME.openid)
  return {
    roundId: r.roundId,
    promptText: r.promptText,
    emoji: r.emoji,
    mode: r.mode || 'flash',
    role: r.ownerOpenid === ME.openid ? 'owner' : 'player',
    ownerName: npcName(r.ownerOpenid),
    status: r.status === 'closed' ? 'closed' : r.status,
    submittedCount: r.entries.filter((e) => !e.undercover).length,
    playerCount: r.players.length,
    deadlineTs: r.deadlineTs,
    iSubmitted: !!mine,
    hasUndercover: !!r.undercover
  }
}

/** NPC 随时间推移陆续交卷，制造"进行中"的氛围 */
function tickNpcSubmits(r) {
  const npcs = r.players.filter((p) => p.openid !== ME.openid)
  const pool = shuffle(NPC_ENTRY_POOL, hash(r.roundId))
  npcs.forEach((p, i) => {
    if (p.submitted) return
    // 第 1~3 位开局即交，第 4、5 位分别在 40s / 100s 后交
    const delaySec = i < 3 ? 0 : (i - 2) * 50
    if (now() - r.createdAt >= delaySec * 1000) {
      p.submitted = true
      const tpl = pool[i % pool.length]
      r.entries.push({
        entryId: uid(),
        ownerOpenid: p.openid,
        image: '',
        emoji: tpl.emoji,
        capColor1: ['#CFE0EA', '#D5E4C7', '#CFE3DD', '#EBD9DC', '#E3DEDA', '#D9E1EC'][hash(p.openid) % 6],
        capColor2: ['#EFE3C2', '#EFE8CE', '#F0DFC0', '#E8E2CE', '#D8D4CC', '#EADFC8'][hash(p.openid) % 6],
        caption: tpl.cap,
        note: tpl.note,
        undercover: false,
        isBlank: false,
        aiVerdict: 'pass',
        aiReason: '',
        award: null,
        createdAt: r.createdAt + delaySec * 1000
      })
    }
  })
}

/** 人数不足时混入一张往届「卧底」作品，让大家抓 */
function ensureUndercover(r) {
  if (r.undercover) return
  const valid = r.entries.filter((e) => e.aiVerdict !== 'off')
  if (valid.length >= UNDERCOVER_MIN) return
  const tpl = shuffle(UNDERCOVER_POOL, hash(r.roundId + '-uc'))[0]
  const e = {
    entryId: uid(),
    ownerOpenid: '__undercover__',
    image: '',
    emoji: tpl.emoji,
    capColor1: '#E3DEDA',
    capColor2: '#D8D4CC',
    caption: tpl.cap,
    note: '这不是本届作品——它是从往届年鉴里混进来的卧底。',
    undercover: true,
    from: tpl.from,
    isBlank: false,
    aiVerdict: 'pass',
    aiReason: '',
    award: null,
    createdAt: r.createdAt - 1000
  }
  r.entries.push(e)
  r.undercover = { entryId: e.entryId, caption: e.caption, from: tpl.from }
  save()
}

/** 连续作答：48 小时内再交卷即续上，否则从 1 重新数 */
function bumpCombo(st) {
  const last = st.profile.lastSubmitTs || 0
  st.profile.stats.combo = last && now() - last <= COMBO_WINDOW ? (st.profile.stats.combo || 0) + 1 : 1
  st.profile.lastSubmitTs = now()
}

function npcName(openid) {
  if (openid === ME.openid) return db().profile.nickname || '我'
  if (openid === '__undercover__') return '卧底（往届作品）'
  const p = NPC_PLAYERS.find((x) => x.openid === openid)
  return p ? p.nickname : '神秘同学'
}

/** 明日预告：下局出题人 + 打码后的悬念提示 */
function makeTeaser(r, awards) {
  const ownerOpenid = r.gift ? r.gift.to : (awards.best ? awards.best.ownerOpenid : r.ownerOpenid)
  const p = PROMPT_POOL[Math.abs(hash(r.roundId + '-next')) % PROMPT_POOL.length]
  return {
    ownerOpenid,
    ownerName: npcName(ownerOpenid),
    hint: maskPrompt(p.text),
    mine: ownerOpenid === ME.openid
  }
}

function ensureSettleResult(r) {
  if (r.result) return r.result
  const votes = { best: {}, lazy: {}, quote: {} }
  // 统计真实票
  Object.values(r.votes).forEach((byEntry) => {
    Object.entries(byEntry).forEach(([entryId, tag]) => {
      votes[tag][entryId] = (votes[tag][entryId] || 0) + 1
    })
  })
  // NPC 投票：最绝投给"note 哈希最有趣"的非自己答卷；敷衍投给 caption 最短的；金句投给 caption 最长的
  const voters = r.players.filter((p) => p.openid !== ME.openid)
  const entries = r.entries.filter((e) => e.aiVerdict !== 'off')
  const awardable = entries.filter((e) => !e.undercover)
  if (awardable.length) {
    const ranked = shuffle(awardable, hash(r.roundId + '-vote'))
    const byLen = awardable.slice().sort((a, b) => (b.caption || '').length - (a.caption || '').length)
    voters.forEach((v, vi) => {
      const bestPick = ranked[vi % ranked.length]
      votes.best[bestPick.entryId] = (votes.best[bestPick.entryId] || 0) + 1
      const laziest = awardable.slice().sort((a, b) => (a.caption || '').length - (b.caption || '').length)[vi % Math.max(1, Math.min(3, awardable.length))]
      if (laziest && laziest.entryId !== bestPick.entryId) {
        votes.lazy[laziest.entryId] = (votes.lazy[laziest.entryId] || 0) + 1
      }
      const quoter = byLen[vi % byLen.length]
      if (quoter && quoter.entryId !== bestPick.entryId) {
        votes.quote[quoter.entryId] = (votes.quote[quoter.entryId] || 0) + 1
      }
    })
  }
  const topOf = (m) => {
    let bestId = null, bestN = 0
    Object.entries(m).forEach(([id, n]) => {
      if (!awardable.find((x) => x.entryId === id)) return
      if (n > bestN) { bestN = n; bestId = id }
    })
    if (!bestId) return null
    const e = r.entries.find((x) => x.entryId === bestId)
    return e ? { entryId: e.entryId, image: e.image, emoji: e.emoji, c1: e.capColor1, c2: e.capColor2, caption: e.caption, ownerName: npcName(e.ownerOpenid), ownerOpenid: e.ownerOpenid, votes: bestN } : null
  }
  const awards = { best: topOf(votes.best), lazy: topOf(votes.lazy), quote: topOf(votes.quote) }

  const comments = r.entries.map((e) => ({
    entryId: e.entryId,
    ownerName: e.undercover ? '卧底 · 往届' : npcName(e.ownerOpenid),
    caption: e.caption,
    text: e.isBlank
      ? BLANK_NOTES[hash(e.entryId) % BLANK_NOTES.length]
      : (e.note || AI_COMMENT_POOL[hash(e.entryId) % AI_COMMENT_POOL.length])
  }))

  // 出题权与战绩（卧底作品不参与评奖，也已从 topOf 中排除）
  const st = db()
  let iWonPower = false
  if (awards.best) {
    st.profile.stats.power += awards.best.ownerOpenid === ME.openid ? 1 : 0
    iWonPower = awards.best.ownerOpenid === ME.openid
    if (!st.album.find((a) => a.entryId === awards.best.entryId)) {
      st.album.unshift({
        entryId: awards.best.entryId,
        image: awards.best.image,
        emoji: awards.best.emoji,
        caption: awards.best.caption,
        date: fmtDate(now()),
        promptText: `「${r.promptText}」`,
        ownerName: awards.best.ownerName
      })
    }
    if (awards.best.ownerOpenid === ME.openid) st.profile.stats.best += 1
  }
  if (awards.lazy && awards.lazy.ownerOpenid === ME.openid) st.profile.stats.lazy += 1
  save()

  // 我的猜人成绩（含抓卧底）
  const myGuesses = r.guesses[ME.openid] || {}
  const total = Object.keys(myGuesses).length
  const correct = Object.entries(myGuesses).filter(([eid, g]) => {
    const e = r.entries.find((x) => x.entryId === eid)
    return e && g === e.ownerOpenid
  }).length
  const ucEntry = r.undercover ? r.entries.find((x) => x.entryId === r.undercover.entryId) : null
  const undercoverHit = !!(ucEntry && myGuesses[ucEntry.entryId] === '__undercover__')

  r.status = 'closed'
  r.result = {
    round: { roundId: r.roundId, no: r.no, promptText: r.promptText, mode: r.mode || 'flash' },
    awards,
    comments,
    iWonPower,
    myStats: { ...db().profile.stats },
    guessScore: { correct, total, undercoverHit, hasUndercover: !!r.undercover },
    undercover: r.undercover || null,
    nextTeaser: makeTeaser(r, awards),
    gift: r.gift || null,
    players: r.players.map((p) => ({ openid: p.openid, nickname: npcName(p.openid), avatar: p.avatar }))
  }
  save()
  return r.result
}

/* ---------- API 实现 ---------- */
const mockApi = {
  getBootstrap() {
    const st = db()
    const t = todayPrompt()
    const myRounds = Object.values(st.rounds)
      .filter((r) => r.players.some((p) => p.openid === ME.openid))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => { tickNpcSubmits(r); save(); return roundCard(r) })
      .filter((c) => c.status !== 'closed')
    // 明日预告：取我最近一局结算产出的悬念
    const closed = Object.values(st.rounds)
      .filter((r) => r.status === 'closed' && r.result && r.result.nextTeaser)
      .sort((a, b) => b.createdAt - a.createdAt)
    const nextTeaser = closed.length ? closed[0].result.nextTeaser : null
    return Promise.resolve({
      today: { promptId: t.promptId, no: t.no, text: t.text },
      myRounds,
      yesterdayReport: YESTERDAY_REPORT,
      nextTeaser,
      profile: st.profile
    })
  },

  updateProfile(patch) {
    const st = db()
    Object.assign(st.profile, patch || {})
    save()
    return Promise.resolve(st.profile)
  },

  createRound({ source, text, mode }) {
    const st = db()
    const official = todayPrompt()
    const promptText = source === 'custom' ? (text || '').trim() : source === 'ai' ? mockApi._aiPick() : official.text
    if (!promptText) return Promise.reject(new Error('命题不能为空'))
    const id = 'r' + uid()
    st.roundSeq += 1
    const m = mode === 'overnight' ? 'overnight' : 'flash'
    const r = {
      roundId: id,
      no: st.roundSeq,
      promptText,
      promptSource: source || 'official',
      emoji: ['🌬️', '🍩', '🪑', '🌈', '☕', '🐈', '🌙'][Math.abs(hash(id)) % 7],
      mode: m,
      shootLimitSec: SHOOT_LIMIT_SEC,
      status: 'shooting',
      createdAt: now(),
      deadlineTs: now() + MODE_HOURS[m] * HOUR,
      ownerOpenid: ME.openid,
      players: [
        { openid: ME.openid, nickname: st.profile.nickname, avatar: st.profile.avatar, submitted: false },
        ...NPC_PLAYERS.map((p) => ({ ...p, submitted: false }))
      ],
      entries: [],
      guesses: {},
      votes: {},
      undercover: null,
      gift: null
    }
    st.rounds[id] = r
    if (source !== 'official') st.usedPrompts.push(promptText)
    save()
    return Promise.resolve(mockApi.getRound(id))
  },

  _aiPick() {
    const st = db()
    const unused = PROMPT_POOL.filter((p) => !st.usedPrompts.includes(p.text))
    const pick = (unused.length ? unused : PROMPT_POOL)[Math.floor(Math.random() * (unused.length || PROMPT_POOL.length))]
    return pick.text
  },

  generateAiPrompt() {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ text: mockApi._aiPick() }), 600)
    })
  },

  getRound(roundId) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在或已过期'))
    tickNpcSubmits(r); save()
    const mine = r.entries.find((e) => e.ownerOpenid === ME.openid)
    return Promise.resolve({
      roundId: r.roundId,
      no: r.no,
      promptText: r.promptText,
      promptSource: r.promptSource,
      mode: r.mode || 'flash',
      shootLimitSec: r.shootLimitSec || SHOOT_LIMIT_SEC,
      status: r.status,
      createdAt: r.createdAt,
      deadlineTs: r.deadlineTs,
      ownerOpenid: r.ownerOpenid,
      ownerName: npcName(r.ownerOpenid),
      isMine: r.ownerOpenid === ME.openid,
      submittedCount: r.entries.filter((e) => !e.undercover).length,
      hasUndercover: !!r.undercover,
      players: r.players.map((p) => ({ openid: p.openid, nickname: p.nickname, avatar: p.avatar, submitted: p.submitted })),
      myEntry: mine ? {
        entryId: mine.entryId, image: mine.image, emoji: mine.emoji,
        c1: mine.capColor1, c2: mine.capColor2,
        caption: mine.caption, award: mine.award, isBlank: !!mine.isBlank
      } : null
    })
  },

  submitEntry(roundId, tempFilePath, caption, opts) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    if (r.status !== 'shooting') return Promise.reject(new Error('这局已经交卷截止了'))
    if (now() > r.deadlineTs) return Promise.reject(new Error('已过截止时间，等出题人开卷吧'))
    if (r.entries.find((e) => e.ownerOpenid === ME.openid)) return Promise.reject(new Error('你已经交过卷了'))
    const blank = !!(opts && opts.blank) || !tempFilePath
    r.entries.push({
      entryId: uid(),
      ownerOpenid: ME.openid,
      image: blank ? '' : tempFilePath,
      emoji: blank ? '🕳️' : '📷',
      capColor1: '#CFE0EA',
      capColor2: '#EFE3C2',
      caption: blank
        ? BLANK_CAPTIONS[hash(roundId) % BLANK_CAPTIONS.length]
        : ((caption || '').trim() || '（本人拒绝配文，行为本身即是作品）'),
      note: '',
      undercover: false,
      isBlank: blank,
      aiVerdict: 'pass',
      aiReason: 'AI 裁判演示模式下不营业，直接放行。',
      award: null,
      createdAt: now()
    })
    r.players.find((p) => p.openid === ME.openid).submitted = true
    bumpCombo(st)
    save()
    // 人齐自动开卷（开卷时再决定是否混卧底）
    if (r.players.every((p) => p.submitted)) {
      r.status = 'revealing'
      ensureUndercover(r)
    }
    save()
    return Promise.resolve({ ok: true })
  },

  revealNow(roundId) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    if (r.ownerOpenid !== ME.openid && !isDev()) return Promise.reject(new Error('只有出题人能提前开卷'))
    const allIn = r.players.every((p) => p.submitted)
    if (!allIn && !isDev()) return Promise.reject(new Error('还有人没交卷，再等等'))
    r.status = 'revealing'
    ensureUndercover(r)
    save()
    return Promise.resolve({ ok: true })
  },

  getWall(roundId) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r || r.status === 'shooting') return Promise.reject(new Error('还没到揭晓时间'))
    if (r.status !== 'closed') ensureUndercover(r)
    const myGuesses = r.guesses[ME.openid] || {}
    const myVotes = r.votes[ME.openid] || {}
    const shuffled = shuffle(
      r.entries.filter((e) => e.aiVerdict !== 'off').map((e) => ({
        entryId: e.entryId,
        image: e.image,
        emoji: e.emoji,
        c1: e.capColor1,
        c2: e.capColor2,
        caption: e.caption,
        isMine: e.ownerOpenid === ME.openid,
        aiVerdict: e.aiVerdict,
        aiReason: e.aiReason,
        myGuess: myGuesses[e.entryId]
          ? { openid: myGuesses[e.entryId], correct: myGuesses[e.entryId] === e.ownerOpenid }
          : null,
        myVote: myVotes[e.entryId] || null
      })),
      hash(roundId)
    )
    const players = r.players.map((p) => ({ openid: p.openid, nickname: p.nickname, avatar: p.avatar }))
    const hasUndercover = !!r.undercover
    if (hasUndercover) {
      players.push({ openid: '__undercover__', nickname: '卧底', avatar: '🕵️', undercover: true })
    }
    return Promise.resolve({
      total: shuffled.length,
      reviewed: Object.keys(myVotes).length,
      hasUndercover,
      players,
      entries: shuffled
    })
  },

  guess(roundId, entryId, guessedOpenid) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    const e = r.entries.find((x) => x.entryId === entryId)
    if (!e) return Promise.reject(new Error('答卷不存在'))
    r.guesses[ME.openid] = r.guesses[ME.openid] || {}
    r.guesses[ME.openid][entryId] = guessedOpenid
    save()
    return Promise.resolve({ correct: guessedOpenid === e.ownerOpenid, actualName: npcName(e.ownerOpenid) })
  },

  vote(roundId, entryId, tag) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    r.votes[ME.openid] = r.votes[ME.openid] || {}
    r.votes[ME.openid][entryId] = tag
    save()
    return Promise.resolve({ ok: true })
  },

  /** 把本局赢得的出题权赠给一位同局玩家 */
  giftPower(roundId, toOpenid) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    if (!r.result || !r.result.iWonPower) return Promise.reject(new Error('本局的出题权不在你手上'))
    if (r.gift) return Promise.reject(new Error('出题权已经送出去了'))
    if (!r.players.find((p) => p.openid === toOpenid)) return Promise.reject(new Error('这位同学不在本局'))
    if ((st.profile.stats.power || 0) <= 0) return Promise.reject(new Error('手里没有出题权'))
    st.profile.stats.power -= 1
    r.gift = { to: toOpenid, at: now() }
    // 预告里的出题人同步换成获赠者
    if (r.result && r.result.nextTeaser) r.result.nextTeaser = makeTeaser(r, r.result.awards)
    r.result.iWonPower = false
    r.result.gift = r.gift
    save()
    return Promise.resolve({ ok: true, toName: npcName(toOpenid), power: st.profile.stats.power })
  },

  settle(roundId) {
    const st = db()
    const r = st.rounds[roundId]
    if (!r) return Promise.reject(new Error('局不存在'))
    if (now() < r.deadlineTs && r.players.some((p) => !p.submitted) && !isDev()) {
      return Promise.reject(new Error('还没到揭晓时间'))
    }
    ensureUndercover(r)
    const res = ensureSettleResult(r)
    return Promise.resolve({
      round: res.round,
      awards: res.awards,
      comments: res.comments,
      iWonPower: res.iWonPower,
      myStats: res.myStats,
      guessScore: res.guessScore,
      undercover: res.undercover,
      nextTeaser: res.nextTeaser,
      gift: res.gift,
      players: res.players
    })
  },

  getAlbum() {
    return Promise.resolve(db().album.map((a) => ({ ...a, date: a.date || fmtDate(now()) })))
  },

  getPosterQr() {
    return Promise.resolve(null)
  }
}

function isDev() {
  // 演示模式放开彩排限制（快进揭晓等）
  return true
}

export default mockApi
