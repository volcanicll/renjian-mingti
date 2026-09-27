# 云开发部署手册

[返回项目首页](../README.md)

「人间命题」后端基于微信云开发（云函数 + 云数据库 + 云存储），个人开发者零运维。
**演示模式（`src/config/index.js → USE_CLOUD=false`）不需要本手册的任何步骤。**

## 1. 前置准备

| 步骤 | 说明 |
|---|---|
| 开通云开发 | 微信开发者工具 → 云开发按钮 → 创建环境（按量付费免费额度足够比赛用） |
| 环境 ID | 复制环境 ID，填入 `src/config/index.js` 的 `CLOUD_ENV`，并把 `USE_CLOUD` 改为 `true` |
| AppID | 注册小程序，把 appid 填入 `src/manifest.json` 的 `mp-weixin.appid` |
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
| users | 用户档案与战绩 | `_openid`, `nickname`, `avatar`, `examNo`, `stats{best,lazy,quote,power,combo}`, `lastSubmitTs` |
| rounds | 局 | `no`, `promptText`, `promptSource`, `mode`, `status(shooting/revealing/closed)`, `ownerOpenid`, `players[]`, `deadlineTs`, `undercover`, `gift`, `result` |
| entries | 答卷 | `roundId`, `openid`, `fileID`, `caption`, `isBlank`, `undercover`, `aiVerdict`, `aiReason`, `award` |
| votes | 批注投票 | `roundId`, `voterOpenid`, `entryId`, `tag(best/lazy/quote)` |
| guesses | 猜人记录 | `roundId`, `voterOpenid`, `entryId`, `guessedOpenid` |
| prompts | 官方题库 | `text`, `style(object/abstract/absurd)`, `useDate`, `active` |
| counters | 序号器 | `_id:'roundSeq'`, `seq` |

建议索引：`entries(roundId)`、`votes(roundId+voterOpenid+entryId 唯一)`、`guesses(同前唯一)`、`rounds(ownerOpenid)`、`rounds(status+deadlineTs)`。

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
| `ADMIN_OPENIDS` | 否 | 管理员 openid（逗号分隔），允许小程序内触发出题库初始化 |

任何 OpenAI 兼容接口都可用（DeepSeek、Kimi、GLM 等），改 `AI_BASE_URL` 与模型名即可。成本参考：判定每张图一次、点评结算批量一次、官方题库离线预生成零成本。

## 6. 订阅消息

mp.weixin.qq.com → 订阅消息 → 申请一次性订阅模板，把模板 ID 填入 `src/config/index.js` 的 `SUBSCRIBE_TEMPLATES`：

- 「你参与的局已揭晓」
- 「你的照片被投了最绝奖」（同时配到云函数环境变量 `TMPL_GOT_VOTED`）
- 「轮到你出题了」（同时配到云函数环境变量 `TMPL_YOUR_TURN`）

模板未配置或用户未授权时会静默跳过，不影响主流程。

## 7. 内容合规清单

- ✅ 已内置：昵称、自定义命题、配文调用 `security.msgSecCheck`；AI 裁判前置过滤明显跑题与违规图片（`verdict=off` 不上墙）。
- ⬆️ 升级路径：接入 `security.mediaCheckAsync` 图片机审（需配置消息推送接收函数）。
- 举报入口：「我的 → 举报一张答卷」；删除答卷可后续在揭晓墙详情页扩展。
- 类目风险：个人主体无法开通社区类目，按策划案 §7 以企业主体申报，或弱化公共广场属性（年鉴仅精选）。

## 8. 验证闭环

两台手机（或开发者工具 + 真机预览）：

1. A 打开小程序 → 首页「开始一局」→ 发卷。
2. 分享卡片给 B（或发到群）→ B 点开 → 拍照交卷或交白卷。
3. A 进入局内 → 人齐后「开卷揭晓」→ 双方在揭晓墙猜人、批注。
4. 任一方进入结果页 → 结算盖章 + AI 点评 + 存海报。
5. 等待 5 分钟定时器，或手动执行 `timer` 云函数验证过期局自动结算。

## 9. 发布前检查

- [ ] `src/manifest.json` 已填写真实 AppID，`USE_CLOUD=true`，`CLOUD_ENV` 指向生产环境。
- [ ] 七个数据库集合、索引与权限已配置。
- [ ] `main` 部署成功且 `sweepTrigger` 生效，`timer` 手动补跑成功。
- [ ] AI、订阅消息和内容安全环境变量已在生产环境配置。
- [ ] 微信公众平台已配置服务类目、隐私保护指引和小程序码能力。
- [ ] 真机完成创建、分享、交卷、揭晓、投票、结算、赠权与年鉴闭环。
