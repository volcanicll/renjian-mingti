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
| `bootstrap` | 已登录用户 | 无 | 今日命题、我的局、昨日战报、个人档案 |
| `profile.update` | 已登录用户 | `{ nickname?, avatar? }` | 更新昵称头像并返回用户 |
| `round.create` | 已登录用户 | `{ source, text?, mode? }` | 创建局并返回 `RoundDetail` |
| `ai.prompt` | 已登录用户 | `{ hint? }` | 生成 `{ text }`，失败回退官方题 |
| `round.get` | 已登录用户 | `{ roundId }` | 返回当前用户视角的 `RoundDetail` |
| `entry.submit` | 局内用户 | `{ roundId, fileID?, caption?, blank? }` | 校验状态与身份，写入答卷并更新连击 |
| `round.reveal` | 局主 | `{ roundId }` | 满足条件时进入 `revealing`，必要时加入卧底 |
| `wall.get` | 已登录用户 | `{ roundId }` | 返回匿名化、随机排序的揭晓墙 |
| `guess.cast` | 已登录用户 | `{ roundId, entryId, guessedOpenid }` | 写入或更新猜人，返回是否命中 |
| `vote.cast` | 已登录用户 | `{ roundId, entryId, tag }` | `tag` 为 `best/lazy/quote`，幂等写入 |
| `round.settle` | 已登录用户 | `{ roundId }` | 幂等结算并返回 `SettleResult` |
| `power.gift` | 本局最绝奖得主 | `{ roundId, toOpenid }` | 转移一张出题权并更新明日预告 |
| `album.get` | 已登录用户 | 无 | 返回历届最绝奖 `AlbumItem[]` |
| `qr.get` | 已登录用户 | `{ roundId }` | 返回 `{ url: string|null }` |
| `admin.seedPrompts` | 控制台 / 管理员 | `{}` | 幂等写入官方题库 |
| `timer.sweep` | 系统 | `{}` | 结算过期局，拒绝用户身份调用 |

`cloud.js` 的 `entry.submit` 会先上传图片，再把 `fileID` 传给云函数；`blank: true` 或没有文件时提交白卷。

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
  }
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
  submittedCount, hasUndercover,
  players: [{ openid, nickname, avatar, submitted }],
  myEntry: Entry | null
}
```

### Entry / WallEntry

内部 `Entry` 可包含作者信息；`WallEntry` 是匿名 DTO，绝不能包含 `ownerOpenid` 或 `undercover`：

```js
{
  entryId, image, caption, isMine,
  aiVerdict: 'pass' | 'suspect' | 'off',
  aiReason,
  myGuess: { openid, correct } | null,
  myVote: 'best' | 'lazy' | 'quote' | null
}
```

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
| `users` | `_openid`, `nickname`, `avatar`, `examNo`, `stats`, `lastSubmitTs` | 用户档案、奖项、出题权和连击 |
| `rounds` | `no`, `promptText`, `promptSource`, `mode`, `status`, `ownerOpenid`, `players`, `deadlineTs`, `undercover`, `gift`, `result` | 一局的状态、玩家和结算快照 |
| `entries` | `roundId`, `openid`, `fileID`, `caption`, `isBlank`, `undercover`, `from`, `aiVerdict`, `aiReason`, `award`, `createdAt` | 答卷与 AI 判定 |
| `votes` | `roundId`, `voterOpenid`, `entryId`, `tag`, `createdAt` | 三类奖项投票 |
| `guesses` | `roundId`, `voterOpenid`, `entryId`, `guessedOpenid` | 猜作者与抓卧底 |
| `prompts` | `text`, `style`, `useDate`, `active`, `createdAt` | 官方题库 |
| `counters` | `_id: 'roundSeq'`, `seq` | 全局局编号 |

建议索引：

- `entries(roundId)`
- `votes(roundId, voterOpenid, entryId)` 唯一
- `guesses(roundId, voterOpenid, entryId)` 唯一
- `rounds(ownerOpenid)`
- `rounds(status, deadlineTs)`

## 5. 核心不变量

1. `wall.get` 的 `entries` 不得出现 `openid`、`ownerOpenid` 或 `undercover` 字段。
2. `rounds.result.settledAt` 一旦存在，结算不得再次发奖或重写统计。
3. 卧底作品不参与 `best/lazy/quote` 评奖，但可以出现在 AI 点评中。
4. 所有用户身份均以云函数上下文 openid 为准，payload 不传调用者身份。
5. 所有写操作先校验局状态和调用者是否属于该局。
6. `off` 答卷不进入揭晓墙和结算候选集。
7. 前端 mock 与云实现必须返回相同字段语义；可以增加字段，不要静默改名。
