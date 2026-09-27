# 开发指南

## 1. 环境准备

| 工具 | 建议版本 | 用途 |
|---|---|---|
| Node.js | 20 LTS | 依赖安装、构建、测试 |
| npm | 10+ | 使用仓库内 `package-lock.json` 锁定依赖 |
| 微信开发者工具 | 最新稳定版 | 运行、调试、部署微信小程序 |

最低版本参考：Node.js 18、npm 9。项目基于 Vite 5、Vue 3 和 uni-app Vue 3，不使用 Pinia，全局状态位于 `src/store/index.js`。

```bash
git clone <repository-url>
cd wechat-uni
npm install
```

## 2. 运行模式

项目有两种数据实现，由 `src/config/index.js` 的 `USE_CLOUD` 控制：

| 模式 | 配置 | 数据位置 | 用途 |
|---|---|---|---|
| 演示模式 | `USE_CLOUD = false` | `uni` 本地 storage + mock 数据 | 零配置开发、UI 调试、离线演示、自动化测试 |
| 云开发模式 | `USE_CLOUD = true` | 微信云数据库 / 云存储 | 真实多人联调、真机验收、发布 |

页面始终只导入 `src/api`。不要从页面直接调用 `uni.cloud` 或访问数据库。

### 演示模式

```bash
npm run dev:mp-weixin
```

在微信开发者工具中导入 `dist/dev/mp-weixin`。若只想验证一次生产构建：

```bash
npm run build:mp-weixin
```

H5 可用于界面调试：

```bash
npm run dev:h5
```

小程序专有 API 与云能力仍以微信开发者工具的结果为准。

### 云开发模式

1. 在本地将 `src/manifest.json` 中 `mp-weixin.appid` 设为真实 AppID；提交前恢复为空值。即使 AppID 不是 AppSecret，GitHub Secret Scanning 也会识别并要求处理，因此不要将真实值提交到仓库。
2. 将 `src/config/index.js` 中 `CLOUD_ENV` 设为云环境 ID，并把 `USE_CLOUD` 改为 `true`。
3. 按 [../cloudfunctions/README.md](../cloudfunctions/README.md) 创建集合、部署云函数并配置环境变量。
4. 重新执行 `npm run dev:mp-weixin` 或 `npm run build:mp-weixin`。

## 3. 验证命令

| 命令 | 检查内容 |
|---|---|
| `npm run smoke` | 演示模式完整玩法闭环，当前 39 项断言 |
| `npm run build:mp-weixin` | uni-app 小程序编译与模块引用 |
| `npm run build:h5` | H5 编译兼容性 |

提交前至少运行：

```bash
npm run smoke
npm run build:mp-weixin
```

## 4. 代码边界

```text
页面 / 组件
    ↓
src/api/index.js            统一契约，不写业务实现
    ├── src/api/mock.js     演示实现
    └── src/api/cloud.js    只负责云函数和上传适配
             ↓
cloudfunctions/main         鉴权、游戏规则、数据库、AI、消息
```

新增或修改功能时按以下顺序处理：

1. 在 `src/api/index.js` 明确输入、输出和错误语义。
2. 在 `src/api/mock.js` 实现可独立运行的演示行为。
3. 在 `src/api/cloud.js` 与 `cloudfunctions/main` 实现真实行为。
4. 页面只调用 `api` 暴露的方法，不复制规则。
5. 为可自动验证的核心路径补充 `scripts/smoke-mock.js` 断言。
6. 同步更新 [DATA_CONTRACT.md](DATA_CONTRACT.md) 和受影响的玩法文档。

## 5. 核心状态与规则

- 局状态：`shooting → revealing → closed`，非法跳转要在服务端拦截。
- 模式时限：`flash` 为 2 小时，`overnight` 为 24 小时。
- 开卷条件：局内所有人已交卷，或已过截止时间。
- 卧底条件：有效答卷少于 4 份，混入一张往届作品；卧底不参与评奖。
- 猜人与投票：按用户和答卷去重，重复提交是更新而非累加。
- 结算：`rounds.result` 是幂等标记；已结算的局不得重复发奖。
- 连击：距上次交卷 48 小时内再次交卷为 `combo + 1`，否则重置为 1。

## 6. 开发约定

- 前端内部导入使用 `@/` 别名。
- Vue 页面与组件使用 Vue 3 语法，保持现有选项式/组合式混用风格，局部改动不要无关重写。
- 云函数使用 CommonJS，因为微信云函数运行环境直接加载 `index.js`。
- 文案、题库、兜底点评优先集中在数据文件或常量区，避免散落在模板中。
- 新增依赖前说明必要性；云函数尽量只依赖 `wx-server-sdk`，AI 请求使用内置 `https`。
- 不提交 `node_modules/`、`dist/`、`project.private.config.json`、`.env*` 或任何 API Key。
- 本地配置只改 `src/config/index.js` 时，不要在同一个提交中混入无关业务改动。

## 7. 常见问题

### 构建后开发者工具显示 `touristappid`

演示模式可以继续使用测试号。真机、云能力或发布前，在本地将真实 AppID 填入 `src/manifest.json` 的 `mp-weixin.appid` 后重新构建；不要把真实 AppID 提交到 Git。

### 云函数提示没有身份

确认从微信小程序内调用，并且 `USE_CLOUD = true`、`CLOUD_ENV` 正确、云环境已经初始化。

### AI 没有生效

检查云函数环境变量 `AI_API_KEY`、`AI_BASE_URL` 和模型名。未配置时系统按设计降级，不会阻断交卷或结算。

### 图片看不到

云存储的 `cloud://` 文件 ID 需要在云函数中换取临时 URL。检查 `withUrls()` 调用链和云存储权限，不要直接把 fileID 当成普通 HTTP 地址。

### 定时结算没有触发

先确认 `main` 云函数已部署且 `config.json` 中 `sweepTrigger` 生效；也可以在控制台手动调用 `timer` 云函数补跑。
