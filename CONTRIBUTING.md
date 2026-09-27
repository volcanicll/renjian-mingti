# 贡献指南

## 开始之前

1. 阅读 [README.md](README.md)、[开发指南](docs/DEVELOPMENT.md) 和 [架构说明](docs/ARCHITECTURE.md)。
2. 从最新主分支创建短生命周期分支，例如 `feat/undercover-ranking`、`fix/timer-sweep`。
3. 不提交 API Key、真实用户数据、`project.private.config.json` 或本地构建产物。

## 提交规范

提交信息建议使用简洁的 Conventional Commits 前缀：

```text
feat: 增加卧底命中排行
fix: 修复结算页重复发奖
docs: 补充云函数环境变量说明
test: 覆盖白卷连击边界
refactor: 抽离揭晓墙 DTO
```

一个提交只解决一个清晰问题。不要混入无关格式化或大规模重命名。

## 变更检查清单

### 所有改动

- [ ] 不包含密钥、真实小程序 AppID、隐私数据和无必要的生成文件。
- [ ] 新增行为有明确错误处理，不把底层云能力泄漏到页面。
- [ ] 文档字段、路径和命令与实际代码一致。

### 前端 / 玩法

- [ ] 页面仍只调用 `src/api/index.js` 暴露的方法。
- [ ] mock 与 cloud 两种实现保持相同返回契约。
- [ ] 小程序自定义导航、胶囊区和安全区已检查。

### 云函数 / 数据

- [ ] 身份来自 `cloud.getWXContext()`，不信任 payload 用户 ID。
- [ ] 状态流转、局内身份和重复请求均有服务端校验。
- [ ] 新增集合或索引已更新 [DATA_CONTRACT.md](docs/DATA_CONTRACT.md)。
- [ ] 新增环境变量已更新 [cloudfunctions/README.md](cloudfunctions/README.md)。

## 验证要求

提交前至少执行：

```bash
npm run smoke
npm run build:mp-weixin
```

涉及云函数、AI、订阅消息、文件上传或内容安全时，还需在微信开发者工具或真机完成双端闭环验证，并在 PR 描述中记录验证环境与结果。

## 文档同步规则

| 代码变化 | 必须同步 |
|---|---|
| `src/api/index.js` 字段或方法 | `docs/DATA_CONTRACT.md` |
| 玩法状态、时限、奖项 | `README.md`、相关策划/玩法文档、冒烟测试 |
| 云函数 action 或集合 | `docs/DATA_CONTRACT.md`、`cloudfunctions/README.md` |
| 本地 AppID / 云环境配置 | `README.md`、`docs/DEVELOPMENT.md` |
| 构建、启动、测试命令 | `README.md`、`docs/DEVELOPMENT.md` |
| 架构边界或降级策略 | `docs/ARCHITECTURE.md` |
