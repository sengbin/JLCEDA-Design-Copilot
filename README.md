# JLCEDA Design Copilot

JLCEDA Design Copilot 是面向嘉立创 EDA 专业版的 AI 对话插件，让你可以在 EDA 里直接和 AI 对话，描述需求、分析电路，并让 AI 调用 EDA API 完成操作。

项目地址：https://github.com/sengbin/JLCEDA-Design-Copilot

## 整体架构

```text
用户（嘉立创 EDA）
    ↕ 聊天 UI
AI 大模型（DeepSeek / 智谱 / 阿里 / 百度 / 自定义）
    ↕ 工具调用
EDA API 运行时（Extension iframe 内）
```

主要组成：

- **聊天页**：流式对话 UI，支持多会话、图片上传、Agent 工具调用与结果渲染。
- **设置页**：平台配置管理，支持 API Key 验证、思考模式开关与系统提示词管理。
- **Agent 工具运行时**：执行 EDA API 调用、超时保护与离线文档检索。

## 可用工具

| 工具 | 说明 |
|------|------|
| `jlceda_api_search` | 离线查询 EDA API 文档，支持按名称、scope、owner 过滤 |
| `jlceda_context_get` | 读取当前工程、文档、原理图/PCB 及选区上下文 |
| `jlceda_api_invoke` | 执行指定 EDA API 并返回结果，支持自定义超时 |

## 安装

打开嘉立创 EDA，进入扩展管理器，搜索"AI 设计助手"并安装。

更多使用说明见 [jlceda-pro-extension/README.md](./jlceda-pro-extension/README.md)。

---

## 开发说明

以下内容面向开发者与维护者。

### 仓库结构

```text
JLCEDA-Design-Copilot/
├─ jlceda-pro-extension/    EDA 侧扩展主目录
│  ├─ src/                  TypeScript 源码
│  ├─ iframe/               页面资源（HTML / CSS / JSON）
│  ├─ locales/              多语言文件
│  └─ build/                构建脚本
└─ tool/                    辅助脚本（文档生成等）
```

### 开发环境要求

- Node.js 20+
- npm
- 嘉立创 EDA 专业版（安装与联调）

### 构建

```bash
cd jlceda-pro-extension
npm install
npm run build
```

产物：`jlceda-pro-extension/dist/` 下的打包文件。

### 开发约定

1. 业务逻辑、页面逻辑、工具运行时按职责分层，不混入同一文件。
2. 新增平台支持时，同步更新 `platform.json`、相关 README 与 CHANGELOG。
3. 新增或变更工具定义时，同步更新 `agent-tools.json`、`agent-tools.ts` 与 CHANGELOG。
4. 发布前执行 `npm run build`，确认构建产物正常。

### 相关文档

- [jlceda-pro-extension/README.md](./jlceda-pro-extension/README.md)
- [jlceda-pro-extension/CHANGELOG.md](./jlceda-pro-extension/CHANGELOG.md)

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证。
