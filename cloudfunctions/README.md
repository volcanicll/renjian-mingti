# 云开发部署手册

[返回项目首页](../README.md)

「人间命题」后端基于微信云开发（云函数 + 云数据库 + 云存储），个人开发者零运维。
**演示模式（`src/config/index.js → USE_CLOUD=false`）不需要本手册的任何步骤。**

## 1. 前置准备

| 步骤 | 说明 |
|---|---|
| 开通云开发 | 微信开发者工具 → 云开发按钮 → 创建环境（按量付费免费额度足够比赛用） |
| 环境 ID | 复制环境 ID，填入 `src/config/index.js` 的 `CLOUD_ENV`，并把 `USE_CLOUD` 改为 `true` |
| AppID | 注册小程序，仅在本地把 appid 填入 `src/manifest.json` 的 `mp-weixin.appid`，不要提交真实值 |
| 构建 | 执行 `npm run build:mp-weixin`，在开发者工具中导入 `dist/build/mp-weixin` |

## 2. 部署云函数

在开发者工具资源管理器中：

1. 右键 `cloudfunctions/main` → **上传并部署：云端安装依赖（不上传 node_modules）**
2. 右键 `cloudfunctions/timer` → 同上
3. 部署后到 云开发控制台 → 云函数 → `main` → 配置：
   - **超时时间**：60 秒（AI 判定需要）
   - **定时触发器**：若 `config.json` 未自动生效，手动创建触发器 `sweepTrigger`，周期 `0 */5 * * * * *`（每 5 分钟）

`main` 是业务入口；`timer` 只用于控制台手动补跑过期局清扫，不承载额外规则。

## 3. 创建数据库集合

云开发控制台 → 数据库 → 新建以下集合（权限建议选「仅创建者可读写」，安全全部由云函数侧完成）：

| 集合 | 用途 | 关键字段 |
|---|---|---|
| users | 用户档案与战绩 | `_openid`, `nickname`, `avatar`, `examNo`, `stats{best,lazy,quote,power,combo}`, `lastSubmitTs`, `savedPrompts[]` |
| rounds | 局 | `no`, `promptText`, `promptSource`, `mode`, `status(shooting/revealing/closed)`, `ownerOpenid`, `players[]`, `deadlineTs`, `undercover`, `gift`, `qrFileID`, `result` |
| entries | 答卷 | `roundId`, `openid`, `fileID`, `emoji`, `c1`, `c2`, `caption`, `isBlank`, `undercover`, `aiVerdict`, `aiReason`, `award` |
| votes | 批注投票 | `roundId`, `voterOpenid`, `entryId`, `tag(best/lazy/quote)` |
| guesses | 猜人记录 | `roundId`, `voterOpenid`, `entryId`, `guessedOpenid` |
| prompts | 官方题库 | `text`, `style(object/abstract/absurd)`, `useDate`, `active` |
| counters | 序号器 | `_id:'roundSeq'`, `seq`（只在 `round.create` 递增） |
| reports | 举报工单 | `reporterOpenid`, `roundId`, `entryId`, `reason`, `status`, `createdAt` |

建议索引：`entries(roundId)`、`votes(roundId+voterOpenid+entryId 唯一)`、`guesses(同前唯一)`、`rounds(ownerOpenid)`、`rounds(status+deadlineTs)`、`reports(status+createdAt)`。

## 4. 初始化题库

方式 A：云开发控制台 → 云函数 → `main` → 云端测试，执行：

```json
{ "action": "admin.seedPrompts", "payload": {} }
```

方式 B：小程序内由 `ADMIN_OPENIDS` 中的管理员调用同一 action。幂等，重复执行无副作用（已有 ≥30 条 active 题目时跳过）。

## 5. AI 接入（出题 / 判定 / 点评）

云函数 `main` → 配置 → 环境变量：

| 变量 | 必填 | 说明 |
|---|---|---|
| `AI_API_KEY` | 是 | 大模型平台 API Key。不配置则 AI 全部静默降级（放行 + 兜底点评池） |
| `AI_BASE_URL` | 否 | OpenAI 兼容接口地址，默认智谱 `https://open.bigmodel.cn/api/paas/v4` |
| `AI_MODEL` | 否 | 文字模型（出题/点评），默认 `glm-4-flash` |
| `AI_VISION_MODEL` | 否 | 视觉判定模型，默认 `glm-4v-flash` |
| `TMPL_GOT_VOTED` | 否 | 「作品被投最绝奖」订阅消息模板 ID |
| `TMPL_YOUR_TURN` | 否 | 「轮到你出题」订阅消息模板 ID |
| `TMPL_ROUND_REVEALED` | 否 | 「你参与的局已揭晓」订阅消息模板 ID |
| `ADMIN_OPENIDS` | 否 | 管理员 openid（逗号分隔），允许小程序内触发出题库初始化。**留空时小程序内调用一律被拒**，只能用控制台方式 A |

任何 OpenAI 兼容接口都可用（DeepSeek、Kimi、GLM 等），改 `AI_BASE_URL` 与模型名即可。成本参考：判定每张图一次、点评结算批量一次、官方题库离线预生成零成本。

## 6. 订阅消息

mp.weixin.qq.com → 订阅消息 → 申请一次性订阅模板，把模板 ID 填入 `src/config/index.js` 的 `SUBSCRIBE_TEMPLATES`：

- 「你参与的局已揭晓」（同时配到云函数环境变量 `TMPL_ROUND_REVEALED`，开卷时发送）
- 「你的照片被投了最绝奖」（同时配到云函数环境变量 `TMPL_GOT_VOTED`）
- 「轮到你出题了」（同时配到云函数环境变量 `TMPL_YOUR_TURN`）

三个模板都要配到云函数环境变量，否则对应通知不会发出（用户那次授权就白问了）。模板未配置或用户未授权时静默跳过，不影响主流程。

## 7. 内容合规清单

- ✅ 已内置：昵称、自定义命题、配文调用 `security.msgSecCheck`，**检查成功且判定违规时直接拒绝**；接口不可用（配额/网络）时降级放行并记日志。
- ✅ 已内置：AI 裁判前置过滤明显跑题与违规图片（`verdict=off` 不上墙）。
- ✅ 已内置：举报落库。「我的 → 举报一张答卷」和「揭晓墙详情 → 举报这张答卷」都会写入 `reports` 集合，字段为举报人、局、答卷、理由与时间，管理员可在云开发控制台按 `status=open` 处理。
- ⬆️ 仍缺：`security.mediaCheckAsync` 图片机审（需配置消息推送接收函数）。这是提审 UGC 类目时最可能被驳回的点。
- ⬆️ 仍缺：举报的管理端界面与自动下架；目前只有数据落库与人工处理。
- ⬆️ 仍缺：答卷删除能力（`rules` 页面文案已承诺「可随时删除或举报」，删除尚未实现）。
- 类目风险：个人主体无法开通社区类目，按策划案 §7 以企业主体申报，或弱化公共广场属性（年鉴仅精选）。

## 8. 验证闭环

两台手机（或开发者工具 + 真机预览）：

1. A 打开小程序 → 首页「开始一局」→ 发卷。
2. 分享卡片给 B（或发到群）→ B 点开后**自动入局**（局内页会调 `round.join`）→ 拍照交卷或交白卷。
   若 B 交卷时报「你不在这局里」，说明 `round.join` 没生效，先查云函数是否已重新部署。
3. A 进入局内 → 人齐后「开卷揭晓」→ 双方在揭晓墙猜人、批注。
   猜错时应显示「神秘同学」而不是真实昵称（这是匿名性检查点）。
4. 任一方进入结果页 → 结算盖章 + AI 点评 + 存海报。
5. 等待 5 分钟定时器，或手动执行 `timer` 云函数，验证：
   过期的 `shooting` 局先变成 `revealing`（可继续阅卷），再过 24 小时才结算成 `closed`；
   且**同一轮清扫不会「开卷即结算」**（返回值里 `opened` 与 `settled` 不会同时命中同一局）。
6. 结算窗口：局主在揭晓墙可以随时收卷；非局主在窗口内点「去看结果」应被拒并提示
   「阅卷还没结束」，页面上此时不显示结算按钮，只显示倒计时。
7. 揭晓墙详情「举报这张答卷」→ 云开发控制台 `reports` 集合应出现一条记录；
   同一张答卷重复举报会被拦。

## 9. 发布前检查

- [ ] `src/manifest.json` 已填写真实 AppID，`USE_CLOUD=true`，`CLOUD_ENV` 指向生产环境。
- [ ] 八个数据库集合、索引与权限已配置（含 `reports`）。
- [ ] `main` 部署成功且 `sweepTrigger` 生效，`timer` 手动补跑成功。
- [ ] AI、订阅消息（含 `TMPL_ROUND_REVEALED`）和内容安全环境变量已在生产环境配置。
- [ ] `ADMIN_OPENIDS` 已配置，或确认只用控制台方式初始化题库。
- [ ] 微信公众平台已配置服务类目、隐私保护指引和小程序码能力。
- [ ] 真机完成创建、分享、自动入局、交卷、揭晓、猜人、投票、结算、赠权与年鉴闭环。
- [ ] `security.mediaCheckAsync` 图片机审已接入（UGC 类目审核的常见驳回点）。
