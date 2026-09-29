# 人间命题

> **AI 出题，全人类作答。**
> 每天一道荒诞命题，三五个好友各拍一张，AI 当裁判兼毒舌点评，赢家拿走明天的出题权。

「人间命题」是一款基于微信群的异步摄影派对小游戏。项目使用 **uni-app + Vue 3** 构建微信小程序，支持零配置演示模式，以及微信云开发、云数据库、云存储和 OpenAI 兼容大模型组成的真实多人模式。

策划案见 [参赛策划案](docs/人间命题-参赛策划案.md)，玩法升级见 [玩法进化方案](docs/玩法进化方案.md)，交互设计稿见 [交互 Demo](design-demo/人间命题-交互demo.html)，产品宣传落地页见 [landing/index.html](landing/index.html)（单文件零依赖，可直接静态托管）。

## 项目状态

- 演示模式已打通完整玩法闭环，`npm run smoke` 共 62 项断言。
- 微信小程序构建通过，产物输出到 `dist/build/mp-weixin`。
- 云函数已实现身份校验、入局与局内成员鉴权、匿名揭晓、幂等结算、定时清扫、AI 降级、举报落库和订阅消息。
- 默认使用演示模式，不会上传数据，也不需要 AppID 或云开发环境。

## 文档导航

| 文档 | 适合谁看 | 内容 |
|---|---|---|
| [开发指南](docs/DEVELOPMENT.md) | 开发者 | 环境准备、启动、构建、测试、目录约定与扩展流程 |
| [架构说明](docs/ARCHITECTURE.md) | 开发者 / 评审 | 分层设计、回合状态机、匿名机制、幂等和降级策略 |
| [数据与接口契约](docs/DATA_CONTRACT.md) | 前端 / 云函数开发者 | 页面数据类型、云函数 action、数据库集合与关键约束 |
| [云开发部署手册](cloudfunctions/README.md) | 部署人员 | 云环境、云函数、数据库、AI、订阅消息与内容合规 |
| [贡献指南](CONTRIBUTING.md) | 协作者 | 分支、提交、验证清单和文档维护要求 |
| [文档索引](docs/README.md) | 所有人 | 仓库内全部说明文档的快速入口 |

## 核心特性

- **一局一个群**：通过小程序卡片分享，不依赖公共广场或实时长连接。
- **三种出题方式**：官方每日题、AI 代出、玩家自定义。
- **两种局模式**：⚡ 闪电局 2 小时，🌙 长夜局 24 小时。
- **匿名揭晓墙**：先猜作者，再投 🏆 最绝、🍬 最敷衍、📝 金句。
- **卧底机制**：有效答卷少于 4 份时混入一张往届作品，卧底不参与评奖。
- **完整结果页**：奖项、猜人战绩、AI 点评、战报海报和明日预告。
- **出题权流转**：最绝奖得主获得下局出题权，并可赠给同局玩家。
- **连续作答**：48 小时内再次交卷即续上 combo。
- **随时可玩**：拍不出来可以交白卷；AI 不可用时自动走规则兜底与文案池。

## 快速开始

### 环境要求

- Node.js 20 LTS（最低兼容 Node.js 18，Vite 5 要求）
- npm 10+
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，调试或部署小程序时需要
- 微信小程序 AppID 与云开发环境，仅真实多人模式需要

### 方式一：演示模式（推荐）

演示模式默认开启：`src/config/index.js` 中的 `USE_CLOUD = false`。全部数据存储在本地缓存，5 位 NPC 会配合作答，可离线体验完整流程。

```bash
npm install
npm run dev:mp-weixin
```

随后在微信开发者工具中导入 `dist/dev/mp-weixin`。只做构建验证时可执行：

```bash
npm run build:mp-weixin
```

开发页面时也可以启动 H5：

```bash
npm run dev:h5
```

> H5 主要用于界面与交互调试；涉及小程序文件选择、云能力和订阅消息的流程仍应在微信开发者工具中验证。

### 方式二：云开发模式

1. 在微信公众平台注册小程序，并在本地将 AppID 填入 `src/manifest.json` 的 `mp-weixin.appid`。真实 AppID 仅用于本地构建，不要提交；仓库内保留空值或 `touristappid`。
2. 在微信开发者工具中开通云开发，把环境 ID 填入 `src/config/index.js` 的 `CLOUD_ENV`。
3. 将 `src/config/index.js` 的 `USE_CLOUD` 改为 `true`。
4. 创建 `users / rounds / entries / votes / guesses / prompts / counters / reports` 集合。
5. 上传部署 `cloudfunctions/main` 与 `cloudfunctions/timer`。
6. 初始化题库，并按需配置 AI、订阅消息和内容安全相关环境变量。
7. 分享卡片给好友后，对方点开即自动入局（`round.join`），无需额外操作。

完整步骤、权限建议和验证路径见 [云开发部署手册](cloudfunctions/README.md)。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev:mp-weixin` | 启动微信小程序开发构建，监听源码变化 |
| `npm run build:mp-weixin` | 构建微信小程序，产物位于 `dist/build/mp-weixin` |
| `npm run dev:h5` | 启动 H5 开发服务器 |
| `npm run build:h5` | 构建 H5 产物 |
| `npm run smoke` | 运行演示模式（mock）完整玩法冒烟测试，62 项断言 |
| `npm run smoke:cloud` | 运行云模式（生产）冒烟测试，114 项断言，覆盖入局、鉴权、匿名、结算、清扫 |
| `npm run smoke:all` | 两套冒烟测试一起跑，提交前推荐 |
| `npm run verify` | `smoke:all` + `build:mp-weixin`，一条命令跑完发布前检查 |
| `npm run dev:custom` | 使用交互参数选择其他 uni-app 平台 |
| `npm run build:custom` | 使用交互参数构建其他 uni-app 平台 |

## 目录结构

```text
.
├── src/
│   ├── api/                 # 统一数据层：index 契约、cloud 适配、mock 适配
│   ├── components/          # 考试风组件：拍立得、红章、顶栏、点评等
│   ├── composables/         # Vue 组合式逻辑
│   ├── config/              # 云开关、环境 ID、订阅模板和玩法常量
│   ├── mock/                # 演示题库、NPC、点评和年鉴种子数据
│   ├── pages/               # 首页 / 局内 / 揭晓 / 结算 / 年鉴 / 我的 / 规则
│   ├── static/              # 小程序静态资源
│   ├── store/               # 轻量全局状态
│   ├── styles/              # 全局试卷视觉系统
│   └── utils/               # 格式化、导航、触感和海报工具
├── cloudfunctions/
│   ├── main/                # action 路由、游戏核心、AI、题库管理
│   └── timer/               # 手动补跑过期局清扫的薄壳函数
├── design-demo/             # 交互 HTML 与演示视频
├── docs/                    # 策划案、玩法、架构、开发与数据文档
└── scripts/                 # 冒烟测试与界面验证辅助脚本
```

## 架构概览

```text
Vue 页面
   │ 只依赖统一 api 契约
   ▼
src/api/index.js
   ├── USE_CLOUD=false → src/api/mock.js → 本地 storage
   └── USE_CLOUD=true  → src/api/cloud.js → main 云函数
                                              ├── 云数据库
                                              ├── 云存储
                                              ├── OpenAI 兼容模型
                                              └── 微信内容安全 / 订阅消息
```

局状态统一为：

```text
shooting（交卷中） → revealing（揭晓/投票） → closed（结算完成）
```

云函数端负责权限、状态流转、匿名化、幂等结算和定时补偿，页面端不直接访问数据库。详细设计见 [架构说明](docs/ARCHITECTURE.md)。

## 数据与安全

- 页面只调用 `src/api`，云开发模式下所有写操作均经过 `main` 云函数。
- `wall.get` 返回的答卷不包含作者字段或卧底标记，结算后才回填作者和卧底信息。
- 投票和猜人按 `roundId + voterOpenid + entryId` 去重，重复请求更新而不是重复计数。
- 结算结果写入 `rounds.result`，重复调用直接复用，保证并发与定时补偿下的幂等性。
- AI 未配置、超时或调用失败时自动降级：判定存疑放行，点评使用兜底文案池。
- API Key 只配置在云函数环境变量中，禁止写入前端代码或提交到仓库。

## 测试与验收

```bash
npm run smoke
npm run build:mp-weixin
```

冒烟测试覆盖建局、NPC 交卷、匿名墙、猜人、三类投票、幂等结算、年鉴、AI 代出、局模式、卧底、白卷、连击、金句奖和明日预告。发布前建议再按 [云开发部署手册](cloudfunctions/README.md) 的双端闭环步骤进行真机验证。
