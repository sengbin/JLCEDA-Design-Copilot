# JLCEDA Design Copilot（开发者文档）

面向嘉立创 EDA 专业版的 AI 对话扩展项目，包含扩展入口、聊天页、模型配置页、Agent 工具运行时与离线 API 文档检索能力。

---

## 1. 项目定位

`JLCEDA Design Copilot` 运行在嘉立创 EDA 专业版中，目标是为原理图/PCB 场景提供稳定、可配置、可扩展的 AI 对话能力。

当前核心能力：

- 聊天式交互（流式响应）
- 多模型平台配置（DeepSeek / 智谱 / 阿里 / 百度）
- Agent 工具调用（EDA API 调用与离线文档检索）

扩展声明文件：`jlceda-pro-extension/extension.json`
扩展入口：`jlceda-pro-extension/dist/index`

---

## 2. 目录结构

```text
JLCEDA-Design-Copilot/
├─ LICENSE
├─ README.md
└─ jlceda-pro-extension/
	├─ CHANGELOG.md
	├─ README.md
	├─ extension.json
	├─ package-lock.json
	├─ package.json
	├─ eslint.config.mjs
	├─ tsconfig.json
	├─ build/
	│  ├─ packaged.ts
	│  └─ update-build-time.ts
	├─ config/
	│  ├─ esbuild.common.ts
	│  └─ esbuild.prod.ts
	├─ src/
	│  ├─ index.ts
	│  ├─ types/
	│  │  └─ global.d.ts
	│  └─ iframe/
	│     ├─ chat.ts
	│     ├─ config.ts
	│     └─ modules/
	│        ├─ debug.ts
	│        ├─ doc.ts
	│        ├─ model.ts
	│        ├─ page.ts
	│        ├─ platform.json
	│        ├─ platform.ts
	│        ├─ prompt.ts
	│        ├─ session-title.ts
	│        ├─ session.ts
	│        ├─ theme.ts
	│        ├─ tool-arguments-repair.ts
	│        ├─ tool.ts
	│        ├─ upload.ts
	│        ├─ utils.ts
	│        └─ llm/
	│           ├─ llm-client.ts
	│           ├─ llm-stream.ts
	│           └─ agent/
	│              ├─ agent-tools.json
	│              ├─ agent-tools.ts
	│              └─ agent.ts
	├─ iframe/
	│  ├─ chat.css
	│  ├─ common.css
	│  ├─ index.html
	│  ├─ jlceda-pro-api-doc.json
	│  ├─ model-config.css
	│  ├─ model-config.html
	│  └─ overlayscrollbars.css
	├─ locales/
	│  ├─ en.json
	│  ├─ zh-Hans.json
	│  └─ extensionJson/
	│     ├─ en.json
	│     └─ zh-Hans.json
	├─ images/
	└─ dist/
```

---

## 3. 环境要求

- Node.js `>=20.17.0`
- npm
- 嘉立创 EDA 专业版

---

## 4. 安装与本地开发

在 `jlceda-pro-extension` 目录执行：

```bash
npm install
```

发布前必须执行：

```bash
npm run build
```

---

## 5. 架构说明

### 5.1 分层结构

- 扩展入口层：`src/index.ts`
- 页面层：`src/iframe/chat.ts`、`src/iframe/config.ts`
- 业务模块层：`src/iframe/modules/*`
- 模型与流式协议层：`src/iframe/modules/llm/*`
- 工具运行时层：`src/iframe/modules/tool.ts`
- 数据层：浏览器本地存储 + 扩展内离线文档文件

### 5.2 模块职责

- `src/index.ts`
  - 注册扩展菜单入口。
  - 打开聊天页与设置页 iframe。
- `src/iframe/config.ts`
  - 渲染平台配置 UI（Key/Model/思考模式）。
  - 执行配置验证并保存本地配置。
  - 管理系统提示词导入、导出与持久化。
- `src/iframe/chat.ts`
  - 维护聊天 UI、消息列表、多会话切换。
  - 组装模型请求并处理流式返回。
  - 调度 Agent 工具调用与结果渲染。
- `src/iframe/modules/model.ts`
  - 统一模型配置读取/写入、模型选择与思考模式键规则。
- `src/iframe/modules/session.ts`
  - 提供会话创建、切换、删除、恢复、节流持久化。
- `src/iframe/modules/llm/llm-client.ts`
  - 校验模型调用参数。
  - 构建 Chat/Responses 两类请求体。
  - 通过白名单筛选可暴露工具。
- `src/iframe/modules/llm/llm-stream.ts`
  - 解析 SSE 事件。
  - 聚合工具调用增量参数。
- `src/iframe/modules/tool.ts`
  - 创建工具运行时。
  - 执行工具调用、参数修复与超时保护。
- `src/iframe/modules/doc.ts`
  - 加载并索引离线 API 文档，提供关键词检索。

### 5.3 核心数据流

1. 用户通过菜单触发 `openChatTool` 或 `openAiModelConfig`，打开对应 iframe 页面。
2. 设置页将平台配置写入本地存储；聊天页启动时读取配置与模型选择。
3. 聊天页校验 `apiKey/model/endpoint`，构建模型请求并发起流式调用。
4. 流式响应按 SSE 事件解析，文本增量直接渲染；工具调用增量先合并再执行。
5. 工具执行结果回填到会话上下文，模型继续下一步推理，直到本轮结束。
6. 会话快照按节流策略写入本地存储，重开页面后可恢复。

### 5.4 关键持久化键

- 模型配置：`jlceda-design-copilot-ai-model-config`
- 模型选择：`jlceda-design-copilot-model-selection`
- 聊天会话：`jlceda-design-copilot-chat-session-v2`
- 系统提示词：`jlceda-design-copilot-system-prompt`

### 5.5 工具安全边界

- 模型侧仅暴露固定白名单工具：
  - `jlceda_list_apis`
  - `jlceda_get_api_member`
  - `jlceda_call_api`
  - `jlceda_search_offline_api_doc`
- 工具参数必须是合法 JSON；解析失败时进入参数修复流程，修复失败直接返回结构化错误。
- 工具调用使用超时保护，避免长时间阻塞聊天主流程。

---

## 6. 开发规范

### 6.1 基础约束

- 开发语言统一为 TypeScript。

### 6.2 注释与可读性

- 内部函数需有简洁中文注释，说明函数职责。
- 对外导出函数需保留完整注释，便于编辑器智能感知。

### 6.3 错误处理与提示

- 所有外部输入（配置、工具参数、API 路径）必须先做校验。
- 失败路径需要给出明确错误信息，不允许静默失败。
- 需要用户感知的异常，统一通过 `showEdaToastMessage` 呈现。

### 6.4 构建与检查

- 每次修改后必须在 `jlceda-pro-extension` 目录执行：`npm run build`。
- 代码质量要求：`eslint` 与 `tsc --noEmit` 检查结果必须无警告和错误。
- 构建会自动更新 `locales/zh-Hans.json` 的构建时间，提交前需撤销该自动变更。

### 6.5 接口与工具调用

- 优先通过平台配置与离线文档确定 API 路径。

---

## 7. 参考资料

- 嘉立创 EDA 专业版 API：
  - https://prodocs.lceda.cn/cn/api/reference/pro-api.html
  - https://prodocs.lceda.cn/cn/api/guide/

---

## 8. 许可证

本仓库使用 Apache-2.0 许可证（详见各目录 LICENSE 文件）。
