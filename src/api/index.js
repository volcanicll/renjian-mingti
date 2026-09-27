/**
 * 「人间命题」API 服务层 —— 统一数据访问契约
 *
 * 页面只 import 这里的 `api`，不感知底层实现。
 * USE_CLOUD=false → mock（本地完整玩法，演示/彩排用）
 * USE_CLOUD=true  → cloud（微信云开发，main 云函数统一分发 action）
 *
 * ============ 数据结构契约（页面与云函数共同遵守）============
 *
 * Profile  用户档案
 *   { openid, nickname, avatar(emoji或图片URL), examNo:'1024',
 *     stats: { best:int, lazy:int, power:int, combo:int } }
 *     // 最绝次数/最敷衍次数/手握出题权张数/连续作答天数
 *
 * RoundCard  首页「进行中的局」条目
 *   { roundId, promptText, emoji, mode:'flash'|'overnight',
 *     role:'owner'|'player', ownerName,
 *     status:'shooting'|'revealing'|'closed',
 *     submittedCount, playerCount, deadlineTs(ms), iSubmitted, hasUndercover }
 *
 * RoundDetail  局内页
 *   { roundId, promptText, promptSource:'official'|'ai'|'custom',
 *     mode:'flash'|'overnight', shootLimitSec:int,
 *     status, createdAt, deadlineTs, ownerOpenid, ownerName,
 *     isMine, no:int, submittedCount, hasUndercover,
 *     players: [{ openid, nickname, avatar, submitted:boolean }],
 *     myEntry: Entry|null }
 *
 * Entry  一份答卷
 *   { entryId, image(临时路径/云文件ID/https), caption, isBlank:boolean,
 *     aiVerdict:'pass'|'suspect'|'off', aiReason, award:null|'best'|'lazy'|'quote' }
 *
 * getWall() → { total:int, reviewed:int, hasUndercover:boolean,
 *     players: [{ openid, nickname, avatar, undercover? }],  // 含我；有卧底时末尾追加 🕵️ 卧底候选
 *     entries: WallEntry[] }
 *
 * WallEntry  揭晓墙卡片（匿名化，绝不含 owner / undercover 信息）
 *   { entryId, image, caption, isMine,
 *     aiVerdict?, aiReason?,
 *     myGuess: { openid, correct } | null,   // 猜卧底时 openid === '__undercover__'
 *     myVote: 'best'|'lazy'|'quote'|null }
 *
 * SettleResult  结算页
 *   { round:{ roundId, no, promptText, mode },
 *     awards: {
 *       best: { entryId, image, caption, ownerName, ownerOpenid, votes } | null,
 *       lazy: { ...同上 } | null,
 *       quote:{ ...同上 } | null },           // 金句奖
 *     comments: [{ entryId, ownerName, caption, text }],   // AI 红笔点评（含卧底）
 *     iWonPower: boolean,
 *     myStats: { best, lazy, power, combo },
 *     guessScore: { correct:int, total:int, undercoverHit:boolean, hasUndercover:boolean },
 *     undercover: { entryId, caption, from } | null,       // 卧底揭晓
 *     nextTeaser: { ownerOpenid, ownerName, hint, mine } | null,  // 明日预告（打码悬念）
 *     gift: { to:openid, at:ts } | null }                  // 出题权赠予记录
 *
 * AlbumItem  年鉴
 *   { entryId, image, caption, date:'MM.DD', promptText, ownerName }
 *
 * ============ v2 玩法要点 ============
 * 1. 局模式：flash 闪电局 2 小时 / overnight 长夜局 24 小时
 * 2. 卧底：开卷时有效答卷 < 4 份，自动混入 1 张往届作品，猜中它有额外战绩
 * 3. 白卷：限时拍不出来就交白卷，AI 有专门的嘲讽文案
 * 4. 三奖项：🏆最绝 / 🍬最敷衍 / 📝金句
 * 5. 出题权可赠与：赢家可把出题权送给同局任意一人（社交货币化）
 * 6. 连击：48 小时内再作答即续上，首页显示「连续作答 N 天」
 * 7. 明日预告：结算即公布下局出题人 + 打码命题，制造悬念召回
 */

import config from '@/config'
import mockApi from './mock'
import cloudApi from './cloud'

const impl = config.USE_CLOUD ? cloudApi : mockApi

/** 是否演示模式（页面可据此显示"演示快进"等彩排按钮） */
export const isDemo = !config.USE_CLOUD

const api = {
  /** 首页启动数据：今日命题 + 我的局 + 昨日战报 + 档案 */
  getBootstrap: () => impl.getBootstrap(),

  /** 更新昵称头像（首次进入或我的页编辑） */
  updateProfile: (patch) => impl.updateProfile(patch),

  /** 创建一局 source: official|ai|custom；custom 时必传 text；mode: flash|overnight */
  createRound: ({ source, text, mode }) => impl.createRound({ source, text, mode }),

  /** AI 代出一道题 */
  generateAiPrompt: (hint) => impl.generateAiPrompt(hint),

  /** 局内页详情（轮询以刷新同学交卷状态） */
  getRound: (roundId) => impl.getRound(roundId),

  /** 交卷：tempFilePath 来自 wx.chooseMedia；caption 可空；opts.blank=true 交白卷 */
  submitEntry: (roundId, tempFilePath, caption, opts) =>
    impl.submitEntry(roundId, tempFilePath, caption, opts),

  /** 提前揭晓（仅局主且人齐时服务端才放行） */
  revealNow: (roundId) => impl.revealNow(roundId),

  /** 揭晓墙：匿名打乱后的答卷列表 */
  getWall: (roundId) => impl.getWall(roundId),

  /** 猜作者，返回是否猜中与真实姓名 */
  guess: (roundId, entryId, guessedOpenid) =>
    impl.guess(roundId, entryId, guessedOpenid),

  /** 批注投票 tag: 'best'|'lazy'|'quote'；同一答卷可改票，多张可批注 */
  vote: (roundId, entryId, tag) => impl.vote(roundId, entryId, tag),

  /** 把本局赢得的出题权赠给同局某位玩家 */
  giftPower: (roundId, toOpenid) => impl.giftPower(roundId, toOpenid),

  /** 结算（幂等）：算奖、AI 点评、发出题权、入年鉴、生成明日预告 */
  settle: (roundId) => impl.settle(roundId),

  /** 年鉴：历届最绝奖作品 */
  getAlbum: () => impl.getAlbum(),

  /** 战报海报小程序码（云模式返回图片URL；演示模式返回 null 用假码） */
  getPosterQr: (roundId) => impl.getPosterQr(roundId),

  /** 订阅消息授权包装（模板未配置时静默跳过） */
  requestSubscribe: (keys = []) => {
    const ids = keys.map((k) => config.SUBSCRIBE_TEMPLATES[k]).filter(Boolean)
    // #ifdef MP-WEIXIN
    if (!config.USE_CLOUD || ids.length === 0 || !uni.requestSubscribeMessage) return Promise.resolve()
    return new Promise((resolve) => {
      uni.requestSubscribeMessage({ tmplIds: ids, complete: resolve })
    })
    // #endif
    // #ifndef MP-WEIXIN
    return Promise.resolve()
    // #endif
  }
}

export default api
