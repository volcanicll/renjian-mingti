# 数据与接口契约

本文件描述页面、`src/api` 和云函数共享的稳定契约。类型注释的代码落点是 `src/api/index.js`；云函数 action 路由落点是 `cloudfunctions/main/index.js`。

## 1. 云函数调用协议

云开发适配器统一调用：

```js
uni.cloud.callFunction({
  name: 'main',
  data: { action, payload }
})
```

成功返回：

```js
{ ok: true, data: /* action-specific data */ }
```

失败返回：

```js
{ ok: false, error: '中文错误信息', code: 'OPTIONAL_CODE' }
```

前端 `src/api/cloud.js` 会把失败转换为带 `message` 和可选 `code` 的 `Error`。

## 2. Action 列表

| Action | 调用者 | 输入 | 输出 / 行为 |
|---|---|---|---|
| `bootstrap` | 已登录用户 | 无 | 今日命题、我的局、昨日战报、个人档案、口袋 |
| `profile.update` | 已登录用户 | `{ nickname?, avatar? }` | 更新昵称头像并返回用户 |
| `round.create` | 已登录用户 | `{ source, text?, mode? }` | 创建局并返回 `RoundDetail`（局主是唯一初始成员） |
| `round.join` | 已登录用户 | `{ roundId }` | 受邀者入局（幂等）；已开卷/已截止则拒绝。**没有它除了局主没人能交卷** |
| `ai.prompt` | 已登录用户 | `{ hint? }` | 生成 `{ text }`，失败回退官方题 |
| `round.get` | 已登录用户 | `{ roundId }` | 返回当前用户视角的 `RoundDetail`（含 `isPlayer`），分享链接的落地预览 |
| `entry.submit` | 局内用户 | `{ roundId, fileID?, caption?, blank? }` | 校验局内身份与状态，写入答卷并更新连击 |
| `round.reveal` | 局主 | `{ roundId }` | 满足条件时进入 `revealing`，必要时加入卧底，并发出卷通知 |
| `wall.get` | **局内用户** | `{ roundId }` | 返回匿名化、按 `roundId` 确定性打乱的揭晓墙，并下发 `canSettle` / `settleAtTs` / `maxAnnotations` |
| `guess.cast` | **局内用户** | `{ roundId, entryId, guessedOpenid }` | 写入或更新猜人；**只有猜对才回填真实姓名** |
| `vote.cast` | **局内用户** | `{ roundId, entryId, tag }` | `tag` 为 `best/lazy/quote`，幂等写入，受每人上限约束 |
| `round.settle` | **局内用户** | `{ roundId }` | 幂等结算并返回 `SettleResult`。**局主可随时收卷；其他人要等「截止 + 阅卷窗口」** |
| `power.gift` | 本局最绝奖得主 | `{ roundId, toOpenid }` | 转移一张出题权并更新明日预告 |
| `save.prompt` | 已登录用户 | `{ promptId, no?, text }` | 收进口袋，同一 `promptId` 去重，上限 20 条 |
| `save.remove` | 已登录用户 | `{ promptId }` | 从口袋移除，返回剩余列表 |
| `report.create` | 已登录用户 | `{ roundId?, entryId?, reason }` | 举报落库到 `reports`，供管理员处理；指定局/答卷时要求是本局成员，且同一人对同一目标只保留一条 `open` 记录 |
| `album.get` | 已登录用户 | 无 | 返回历届最绝奖 `AlbumItem[]` |
| `qr.get` | **局内用户** | `{ roundId }` | 返回 `{ url: string|null }`，同一局复用同一张码（会在局文档写 `qrFileID`，故要求成员身份） |
| `admin.seedPrompts` | 控制台 / 管理员 | `{}` | 幂等写入官方题库；带用户身份时必须命中 `ADMIN_OPENIDS` |
| `timer.sweep` | 系统 | `{}` | 推进/结算过期局，拒绝用户身份调用 |

`cloud.js` 的 `entry.submit` 会先上传图片，再把 `fileID` 传给云函数；`blank: true` 或没有文件时提交白卷。

**入局是生产模式的关键一环**：`round.create` 只把局主写进 `players`，受邀者点开分享卡片进入局内页时，前端发现 `RoundDetail.isPlayer === false` 会调用 `round.join` 补入成员。曾经缺失这一步，导致云模式下局内永远只有局主一人、谁都无法交卷。

## 3. 前端数据模型

以下字段是页面稳定使用的契约，不应随意改名。

### Profile

```js
{
  openid: string,
  nickname: string,
  avatar: string,        // emoji 或图片 URL
  examNo: string,        // 例如 "1024"
  stats: {
    best: number,        // 最绝奖次数
    lazy: number,        // 最敷衍奖次数
    quote: number,       // 金句奖次数，云实现按需返回
    power: number,       // 当前持有的出题权数量
    combo: number        // 连续作答天数
  },
  savedPrompts: SavedPrompt[]   // 口袋；两端都必须下发
}

// SavedPrompt：promptId 是「实现内部的题目标识」——
// 演示模式是题库下标(number)，云模式是 prompts 文档 _id(string)。
// 只用于口袋去重，页面不要对它做类型假设。
{
  promptId, no: number, text, savedAt
}
```

### RoundCard

```js
{
  roundId, promptText, emoji,
  mode: 'flash' | 'overnight',
  role: 'owner' | 'player',
  ownerName,
  status: 'shooting' | 'revealing' | 'closed',
  submittedCount, playerCount, deadlineTs,
  iSubmitted, hasUndercover
}
```

### RoundDetail

```js
{
  roundId, promptText,
  promptSource: 'official' | 'ai' | 'custom',
  mode: 'flash' | 'overnight',
  shootLimitSec: number,
  status: 'shooting' | 'revealing' | 'closed',
  createdAt, deadlineTs, ownerOpenid, ownerName, isMine, no,
  isPlayer,                 // 调用者是否已在 players 里；false 时页面应先调 round.join
  submittedCount, hasUndercover,
  players: [{ openid, nickname, avatar, submitted }],
  myEntry: Entry | null
}
```

`myEntry` 必须带上页面直接消费的展示字段，缺一个云模式就会静默降级：

```js
myEntry: {
  entryId, image, caption,
  emoji,        // 白卷为 '🕳️'，否则 '📷'
  c1, c2,       // 拍立得占位图配色
  isBlank: boolean,
  award: null | 'best' | 'lazy' | 'quote'
}
```

### Entry / WallEntry

内部 `Entry` 可包含作者信息；`WallEntry` 是匿名 DTO，绝不能包含 `ownerOpenid` 或 `undercover`：

```js
// getWall() →
{
  total, reviewed, hasUndercover,
  players: [{ openid, nickname, avatar, undercover? }],
  entries: WallEntry[],
  canSettle: boolean,      // 调用者现在能不能结算（局主恒为 true）
  settleAtTs: number,      // 阅卷窗口结束时间；页面据此显示倒计时
  maxAnnotations: number   // 每人批注上限；页面据此判断「审满」的目标
}

// WallEntry
{
  entryId, image, caption, isMine,
  emoji, c1, c2,            // 拍立得占位图与配色，两端同源
  aiVerdict: 'pass' | 'suspect' | 'off',
  aiReason,
  myGuess: { openid, correct } | null,
  myVote: 'best' | 'lazy' | 'quote' | null
}
```

揭晓墙顺序以 `roundId` 作种子确定性打乱：同一局多次进入顺序一致，否则用户离开再回来就找不到刚才那张了。

`canSettle` / `settleAtTs` / `maxAnnotations` 必须下发：页面不能自己写死阅卷窗口与批注上限，
否则就会给出一个必然被服务端拒绝的「去看结果」按钮，或者让答卷数超过批注上限的局永远审不完。

卧底候选使用保留 openid `__undercover__`。它只出现在猜人候选列表中，不进入答卷 DTO。

### SettleResult

```js
{
  round: { roundId, no, promptText, mode },
  awards: {
    best: Award | null,
    lazy: Award | null,
    quote: Award | null
  },
  comments: [{ entryId, ownerName, caption, text }],
  iWonPower: boolean,
  myStats: Profile.stats,
  guessScore: {
    correct, total, undercoverHit, hasUndercover
  },
  undercover: { entryId, caption, from } | null,
  nextTeaser: { ownerOpenid, ownerName, hint, mine } | null,
  gift: { to, at } | null,
  players: [{ openid, nickname, avatar }]
}
```

`Award` 形状：

```js
{
  entryId, image, caption, votes,
  ownerOpenid, ownerName
}
```

### AlbumItem

```js
{
  entryId, image, caption,
  date: 'MM.DD',
  promptText: '「原始命题」',
  ownerName
}
```

## 4. 数据库集合

| 集合 | 关键字段 | 说明 |
|---|---|---|
| `users` | `_openid`, `nickname`, `avatar`, `examNo`, `stats`, `lastSubmitTs`, `savedPrompts` | 用户档案、奖项、出题权、连击和口袋 |
| `rounds` | `no`, `promptText`, `promptSource`, `mode`, `status`, `ownerOpenid`, `players`, `deadlineTs`, `undercover`, `gift`, `qrFileID`, `result` | 一局的状态、玩家和结算快照 |
| `entries` | `roundId`, `openid`, `fileID`, `emoji`, `c1`, `c2`, `caption`, `isBlank`, `undercover`, `from`, `aiVerdict`, `aiReason`, `award`, `createdAt` | 答卷与 AI 判定 |
| `votes` | `roundId`, `voterOpenid`, `entryId`, `tag`, `createdAt` | 三类奖项投票 |
| `guesses` | `roundId`, `voterOpenid`, `entryId`, `guessedOpenid` | 猜作者与抓卧底 |
| `prompts` | `text`, `style`, `useDate`, `active`, `createdAt` | 官方题库 |
| `counters` | `_id: 'roundSeq'`, `seq` | 全局局编号（只在 `round.create` 递增） |
| `reports` | `reporterOpenid`, `roundId`, `entryId`, `reason`, `status`, `createdAt` | 举报工单，管理员在控制台处理 |

建议索引：

- `entries(roundId)`
- `votes(roundId, voterOpenid, entryId)` 唯一
- `guesses(roundId, voterOpenid, entryId)` 唯一
- `rounds(ownerOpenid)`
- `rounds(status, deadlineTs)`
- `reports(status, createdAt)`

集合权限建议统一为「仅创建者可读写」，页面不直连数据库，所有访问经云函数。

## 5. 核心不变量

1. `wall.get` 的 `entries` 不得出现 `openid`、`ownerOpenid` 或 `undercover` 字段。
2. `rounds.result.settledAt` 一旦存在，结算不得再次发奖或重写统计。
3. 卧底作品不参与 `best/lazy/quote` 评奖，但可以出现在 AI 点评中。
4. 所有用户身份均以云函数上下文 openid 为准，payload 不传调用者身份。
5. **局内动作先校验调用者属于该局**：`entry.submit` / `wall.get` / `guess.cast` / `vote.cast` / `round.settle` 都要求 `openid ∈ rounds.players`；`round.reveal` 额外要求局主。仅持有 `roundId` 不等于有权限。
6. `off` 答卷不进入揭晓墙和结算候选集。
7. 前端 mock 与云实现必须返回相同字段语义；可以增加字段，不要静默改名。
8. **猜人只有猜对才回填真实姓名**。`guess.cast` 不得无条件返回作者昵称，否则匿名墙可被逐张试出。
9. **局编号只在 `round.create` 递增**。`bootstrap` 等读接口不得消耗 `counters/roundSeq`；每日题编号由东八区日期推导。
10. 过期局必须**先进入 `revealing` 走完阅卷期**，超过「截止 + 阅卷窗口」才结算，否则常见局会以三个空奖项收场。
11. **每人每局批注上限为 12 张**（`castVote` 服务端强制，常量在 `cloudfunctions/main/lib/game.js` 的 `MAX_ANNOTATIONS`）。改票不占新配额。
12. **`bootstrap` / `round.get` / `wall.get` 必须下发同一套展示字段**：`emoji`、`c1`、`c2`、`isBlank`、`isPlayer`、`nextTeaser.mine`。少一个页面就会静默降级。
13. **凡是用 `doc(x._id)` 的地方，`x` 必须真的带 `_id`**。微信云数据库的 `add()` 不会把 `_id` 回写到传入的 `data` 上，必须接住返回值；漏接会导致后续 `update` 全部静默 no-op。
14. **结算窗口必须三处一致**：`castVote`、`sweepExpired`、`settleAction` 都用同一个 `VOTE_WINDOW`。任何一处提前放行，都会让阅卷期形同虚设。`settleAction` 若在清扫之前被调用，必须自己补一次「开卷」，绝不允许 `shooting → closed` 直跳。
15. **一轮清扫内不得「开卷即结算」**：第一段刚开卷的局，第二段必须跳过（否则定时器停摆超过一个阅卷窗口后，积压的局会被同一轮清空，阅卷期同样不存在）。
16. **入局、以及任何对 `players` 的追加都必须用 `_.push` 原子写**，不能读整个数组再整体写回 —— 群里多人同时点卡片会互相覆盖，甚至抹掉别人刚写上的 `submitted`。
