# 文档索引

本目录保存产品、玩法和工程实现文档。第一次接触项目时，建议按“产品背景 → 本地运行 → 架构 → 数据契约 → 部署”的顺序阅读。

| 文档 | 内容 |
|---|---|
| [人间命题-参赛策划案.md](人间命题-参赛策划案.md) | 创意来源、核心流程、AI 角色、商业与合规考量 |
| [玩法进化方案.md](玩法进化方案.md) | v2 的闪电局、卧底、白卷、金句奖、出题权赠与、连击与明日预告 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 环境准备、运行命令、测试、开发约定和功能扩展流程 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 分层架构、状态机、匿名安全、幂等结算和故障降级 |
| [DATA_CONTRACT.md](DATA_CONTRACT.md) | 页面数据模型、云函数 action、数据库集合与关键约束 |

部署操作、环境变量和上线检查不在此目录重复维护，统一见 [cloudfunctions/README.md](../cloudfunctions/README.md)。

## 维护约定

- API 字段和 action 变更时，必须同步更新 `src/api/index.js` 顶部注释、[DATA_CONTRACT.md](DATA_CONTRACT.md) 和对应 mock/cloud 实现。
- 玩法规则变更时，同步更新策划/玩法文档、README 的“核心特性”，并补充 `scripts/smoke-mock.js` 断言。
- 云函数行为、action、集合字段变更时，必须补充或更新 `scripts/cloud-smoke.js` 断言（`npm run smoke:cloud`）。
  只改 `smoke-mock.js` 覆盖不到云函数：漏 `.get()`、`_id` 未回写这类缺陷读代码看不出来，只有真跑一次才会暴露。
- 部署步骤或环境变量变更时，同步更新 [cloudfunctions/README.md](../cloudfunctions/README.md)。
- 文档中的命令和路径应链接到仓库内真实文件，避免只写概念不写落点。
