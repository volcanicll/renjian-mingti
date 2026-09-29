# 发布上线手册

[返回项目首页](../README.md)

> 「人间命题」从本地可跑 → 微信全量发布，需要**平台侧**（不可脚本化）和**代码侧**（已大部分 Ready）两条线并行。
> 本清单按 `src/config/index.js → USE_CLOUD` 是否为 `true` 分为「演示版」和「正式版」，两条路的门槛差别很大。

---

## 先看结论：哪条路？

| | 演示版（USE_CLOUD=false） | 正式版（USE_CLOUD=true） |
|---|---|---|
| 数据 | 本地缓存，NPC 陪玩 | 微信云开发，真实多人 |
| 别人能和你玩吗 | ❌ 不能，各玩各的 | ✅ 能，群分享即开 |
| **能提审通过吗** | ❌ **基本不能** | ✅ 可以 |
| 适合 | 评委本地体验、自己彩排 | 正式上线运营 |

**审核视角**：演示版的测试账号进去看到的是本地假数据，审核员判定「功能不完整/虚假功能」的概率极高，且无法通过"多人互动"的核心卖点。
所以**要发布，就必须切到正式版**。

---

## 阶段 0：账号与资质（全部在网页上，约 3–7 个工作日）

| # | 事项 | 在哪做 | 坑 |
|---|---|---|---|
| 1 | 注册小程序账号拿 AppID | mp.weixin.qq.com → 注册 | 一个邮箱只能一个小程序 |
| 2 | **主体：企业 / 个体工商户** | 注册时选定 | ⚠️ **本项目最大的门槛**，见下方说明 |
| 3 | **小程序备案（ICP 备案）** | mp.weixin.qq.com → 管理 → 备案 | 未备案无法上架；短信核验会联系主体负责人，务必接听 |
| 4 | 设置基本头像/名称/简介 | 管理 → 基本设置 | 名称涉及"社交/社区"可能触发额外材料 |

### ⚠️ 关于主体与类目的硬门槛

本小程序是**好友间 UGC 图片社交**，对应微信服务类目里的 `社交 → 社区/论坛`。
**该类目不对个人主体开放**，且审核要求：

- 企业/个体工商户营业执照
- 具备**内容审核机制**（UGC 类目强制）

如果你只有个人主体，有两条路：

1. **升级为企业/个体工商户主体**（个体工商户注册门槛低、当天可下证）；
2. **弱化公共属性**：把「年鉴」改成只展示自己参与过的局、完全去掉陌生人内容，尝试申报 `图片/摄影` 类目（仍需尝试，不保证）。

> `cloudfunctions/README.md` §7「内容合规清单」也提到了同一结论。

---

## 阶段 1：后端 —— 云开发（约 1 小时）

详见 [云开发部署手册](../cloudfunctions/README.md)，这里只列顺序：

```bash
# 1. 开发者工具 → 云开发 → 开通（按量付费免费额度足够早期）
# 2. 填配置
#    src/config/index.js     USE_CLOUD: false → true
#                            CLOUD_ENV: '你的环境ID'
#    src/manifest.json       mp-weixin.appid: '你的AppID'
# 3. 上传云函数（右键 → 上传并部署：云端安装依赖）
#    cloudfunctions/main   ← 记得验证 sweepTrigger 每 5 分钟触发
#    cloudfunctions/timer
# 4. 建 8 个集合 + 索引（users/rounds/entries/votes/guesses/prompts/counters/reports）
# 5. 初始化题库：云函数 main → 云端测试 → { "action": "admin.seedPrompts", "payload": {} }
# 6. 云函数 main → 配置 → 环境变量
#    AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_VISION_MODEL
#    TMPL_GOT_VOTED / TMPL_YOUR_TURN / TMPL_ROUND_REVEALED / ADMIN_OPENIDS
```

**第二个硬门槛 —— 图片内容安全**。文本侧 `security.msgSecCheck` 已会真正拦违规内容
（判定违规即拒绝，接口不可用时才降级放行）；图片侧仍靠 AI 视觉模型兜底（`verdict=off` 不上墙）。
UGC 类目审核通常会要求：

```
⬆️ 建议补齐：接入 security.mediaCheckAsync 图片机审
   （需配置消息推送接收函数，异步回调处理违规整删除）
```

---

## 阶段 2：代码侧 —— 发布前必改项

| # | 项 | 现状 | 操作 |
|---|---|---|---|
| 1 | AppID | `src/manifest.json` 的 `mp-weixin.appid` 为空 | 填真实 AppID |
| 2 | 云模式 | `USE_CLOUD = false` | 改 `true` + 填 `CLOUD_ENV` |
| 3 | **隐私保护指引** | ✅ 已 Ready | 代码已加 `__usePrivacyCheck__` + `exam-privacy` 弹层；**但仍需在第 3 阶段去平台填写指引并审核** |
| 4 | 演示模式残留 UI | 页面有 `isDemo` 分支（如"演示快进"） | 发布前建议全部关闭；`src/pages/*/index.vue` 搜 `isDemo` |
| 5 | 订阅消息模板 ID | `src/config/index.js` 三处为空 | 申请后填入（不填则静默跳过，不影响主流程） |
| 6 | 版本号 | `src/manifest.json` 的 `versionName/versionCode` | 每次提审 +1 |
| 7 | 关闭调试 | `mp-weixin.setting.urlCheck` 现为 `false` | 正式版建议改 `true` 并配合法域名 |
| 8 | 主包体积 | 现 440K，上限 2MB | 富余，暂无需分包 |

### 隐私合规已实现的部分

- `src/utils/privacy.js` —— 全局单例授权管理
- `src/components/exam-privacy.vue` —— 试卷风授权弹层（挂在全部 7 个页面）
- `src/App.vue` —— `onLaunch` 里注册 `uni.onNeedPrivacyAuthorization`
- `src/manifest.json` —— `__usePrivacyCheck__: true`

**但你必须在 mp.weixin.qq.com → 设置 → 用户隐私保护指引里勾选**，本项目用到：

- ☑ 相册（读取）+ 相册（写入）—— `chooseMedia` / `saveImageToPhotosAlbum`
- ☑ 摄像头 —— `chooseMedia`
- ☑ 用户信息（头像、昵称）—— `input type="nickname"` / `button open-type="chooseAvatar"`

指引审核通过（通常 1–2 个工作日）后，线上的弹层才会拿到内容。

---

## 阶段 3：平台配置（mp.weixin.qq.com）

```
管理 → 基本设置
  ├─ 服务类目：社交 → 社区/论坛（企业主体）
  └─ 用户隐私保护指引：按上节勾选并提交审核

管理 → 开发管理
  ├─ 开发设置：配置 request/download/socket/uploadFile 合法域名
  │            （云开发模式下主要用云存储，一般无需额外域名）
  └─ 接口权限：确认「头像昵称填写能力」已开启

管理 → 备案：提交并等待通过（未完成则无法发布）

Promotion：生成小程序码（云函数 qr.get 已实现，随战报海报下发）
```

---

## 阶段 4：提审前的闭环验证

**两台手机**（或开发者工具 + 真机预览），严格按 `cloudfunctions/README.md` §8 跑一遍：

```
A 开局 → 分享卡片给 B → B 拍照/交白卷 → A 揭晓 → 双方猜人+批注
→ 结果页结算 + 海报保存 → 赠予出题权 → 年鉴可见 → 等 5 分钟定时器自动结算过期局
```

重点Regression（这些都是真机专属问题）：

- [ ] 隐私弹层能否正常拉起并回调（**没这个，拍照完全不能用**）
- [ ] 头像/昵称回填（`<input type="nickname">` 真机才有键盘联动）
- [ ] 云存储图片能否显示（`image` / `previewImage` 支持 cloud://，基础库 ≥2.2.3）
- [ ] 海报 `canvas` + `saveImageToPhotosAlbum` 能否写入相册
- [ ] 分享到群的小程序卡片标题/图片是否正确

---

## 阶段 5：上传 · 体验 · 提审 · 发布

```
1. npm run build:mp-weixin
2. 微信开发者工具 → 导入 dist/build/mp-weixin → 右上角「上传」
   └ 版本号 = manifest.json 的 versionName，备注写清改动
3. mp.weixin.qq.com → 版本管理 → 开发版本 → 选体验版本
   └ 先用体验版让 3–5 位真人玩一轮，别直接提审
4. 提交审核：
   ├ 测试账号：给 openid 白名单或说明"无需登录"
   ├ 补充说明：写明这是好友群内的异步摄影游戏，非公共社区
   └ 附上云端数以证实时多人功能可用
5. 审核通过 → 点击「发布」
   └ 首次发布建议在低峰时段（20:00 后），便于快速回滚
```

**提审被拒的高频原因**（本项目针对性提醒）：

| 驳回原因 | 对策 |
|---|---|
| UGC 无内容审核机制 | 举报入口已落库（`reports` 集合 + 控制台处理）；仍需补 `mediaCheckAsync` 图片机审 |
| 类目不符（个人主体做社交） | 升级主体或弱化公共属性 |
| 测试账号无法体验完整功能 | 提供体验版二维码 + 明确测试步骤 |
| 涉及隐私但无隐私指引 | 阶段 3 完成即可 |

---

## 快速自检清单（打印用）

```
□ 主体为企业/个体工商户
□ ICP 备案已通过
□ service 类目已配置（社交-社区/论坛）
□ 隐私保护指引已提交并通过审核
□ src/manifest.json → mp-weixin.appid 已填
□ src/config/index.js → USE_CLOUD=true，CLOUD_ENV 已填
□ main / timer 云函数已部署，sweepTrigger 生效
□ 8 个数据库集合 + 索引已建（含 reports）
□ 题库已 seed（admin.seedPrompts）
□ AI 环境变量已配（或接受降级）
□ 三个订阅消息模板 ID 已配（含 TMPL_ROUND_REVEALED）
□ ADMIN_OPENIDS 已配，或确认只用控制台初始化题库
□ 演示模式 UI 已关闭（搜 isDemo）
□ DEBUG 相关的 confirm/alert 已清理
□ 两台真机跑通完整闭环
□ 版本号 +1
□ 体验版给真人玩过一轮
□ 审核通过 → 发布
```
