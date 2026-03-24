# JLCEDA Design Copilot

JLCEDA Design Copilot 是面向嘉立创 EDA 专业版的 AI 对话插件，让你可以在 EDA 里直接和 AI 对话，描述需求、分析电路，并让 AI 调用 EDA API 完成操作。

项目地址：https://github.com/sengbin/JLCEDA-Design-Copilot

讨论QQ群：9041389，欢迎你反馈更多的问题和建议。

## 整体架构

```text
用户（嘉立创 EDA）
    ↕ 聊天 UI
AI 大模型（DeepSeek / 智谱 / 阿里 / 自定义）
    ↕ 工具调用
EDA API 运行时（Extension iframe 内）
```

主要组成：

- **聊天页**：流式对话 UI，支持多会话、图片上传、Agent 工具调用与结果渲染。
- **设置页**：平台配置管理，支持 API Key 验证、系统指令管理。
- **Agent 工具运行时**：执行 EDA API 调用、超时保护与离线文档检索。

## 可用工具

| 工具                       | 说明                                                 |
| -------------------------- | ---------------------------------------------------- |
| `schematic_check`        | 一键执行原理图完整检查，返回 ERC 结果与器件布局图（含坐标、引脚信息） |
| `component_select`       | 在 EDA 系统库中搜索候选器件，并展示交互选型面板供用户确认 |
| `component_place`        | 按顺序启动器件交互放置流程，在侧边栏显示当前进度     |
| `todo_list`              | 更新结构化任务列表，在输入框上方独立展示待办项       |

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
