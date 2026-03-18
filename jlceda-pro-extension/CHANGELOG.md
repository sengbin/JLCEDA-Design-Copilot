# 2.2.1 (2026-03-18)

- 新增器件布局规范（强制执行）：要求所有器件必须放置在原理图红框内的中间区域，禁止摆放到边角；放置前先调用 `getCurrentSchematicPageInfo()` 获取页面尺寸，以图页中心为基准规划布局坐标；规范器件间距、信号流向排列和 NetFlag 对齐方式。
- 新增连线完整性要求（强制执行）：放置全部器件后必须完成所有功能引脚的电气连接，禁止留悬空引脚；明确三种连线策略（显式导线段、NetFlag + 短导线、NetLabel 复用网络）并要求完成连线自检。
- 更新"放置元件到原理图"执行范式，增加页面尺寸获取步骤和器件坐标规划步骤。
- 新增"原理图功能性审查"执行范式：明确用户说"检查原理图"时的默认意图是功能性审查（电路用途分析、器件选型合理性、引脚连接正确性、电源网络完整性、信号路径完整性、电路能否正常工作），而非 ERC/DRC 规则检查；给出标准六步执行流程并要求输出结构化审查报告。
- 新增"原理图检查意图说明"章节：只有用户明确说"跑一下 ERC"、"检查有没有 ERC 报错"、"做一下 DRC"时，才调用 sch_Drc.check / pcb_Drc.check。

# 2.2.0 (2026-03-18)

- 新增模型循环检测：当模型连续 3 次输出相同回复并重复调用相同工具但无法推进任务时，自动终止对话并以醒目错误框提示用户切换模型。该问题常见于部分国产模型在关闭思考模式时丢失上下文状态，是模型缺陷而非用户问题。
- 去掉百度平台预置配置，文心一言模型在EDA设计上的表现不佳，不再主动支持。用户仍可通过自定义平台接入文心一言或其他百度模型。
- 新增 "Anthropic 自定义" 平台，支持 Anthropic Messages API 原生格式，使用 `x-api-key` + `anthropic-version` 请求头，工具调用基于 `input_schema`/`tool_use`/`tool_result` 格式，默认支持图片上传。
- 将原 "自定义" 平台重命名为 "OpenAI 自定义"，与新增的 Anthropic 自定义平台区分。
- 设置页验证功能支持 Anthropic 格式：使用正确的请求头与请求体对 Anthropic 接口进行连通性验证。
- 缩小模型配置选项卡标题的左右边距，防止多平台时选项卡文字挤压变形。
- 缩小文本输入框内部边距，使内容布局更紧凑。
- 用 argsJson 字符串字段解决 DeepSeek strict 模式下 JSON 格式问题。
  - jlceda_api_invoke 工具参数 schema 只保留 argsJson（字符串），完全兼容 strict 封闭要求。
  - 移除 repair 与所有旧参数格式兼容逻辑。

# 2.1.0 (2026-03-17)

- 重构 `src/` 目录结构，改为按职责分层：`llm/`、`llm/agent/`、`platform/`、`page/`、`session/`、`tools/`。
- 将 `model.ts`、`upload.ts` 移入 `page/` 目录，职责归属更清晰。
- 修复 `theme.ts` 中访问 `window.eda` 时的 TypeScript 类型报错（ts2339）。
- 修复聊天页在选择“自定义”平台时图片上传按钮无法触发文件选择的问题，默认启用 `image_url` 图片载荷模式。

# 2.0.0 (2026-03-16)

- 升级到 2.0.0 版本，扩展改名为：AI 设计助手。
- 新增"自定义"平台选项卡：用户可填写任意 OpenAI 兼容接口的终结点、API Key 和模型名称，实现对接各类第三方大模型。
- API 返回文件（Blob）时，自动生成 `downloadUrl` 下载链接并携带文件名，AI 回复中输出可点击的 Markdown 链接，用户点击即可直接下载 BOM、网表等导出文件。
- Markdown 渲染支持 `blob:` URL 链接，渲染为带 `download` 属性的 `<a>` 标签，点击触发浏览器下载。
- 修复 `page.ts` 中访问 `window.eda` 和 `window.parent.eda` 时的 TypeScript 类型报错。
- 重构工具体系：删除旧的四工具实现（`jlceda_list_apis`、`jlceda_get_api_member`、`jlceda_search_offline_api_doc`、`jlceda_call_api`）。
- 新增并启用三工具实现（`jlceda_api_search`、`jlceda_context_get`、`jlceda_api_invoke`），逻辑对齐 `JLCEDA-MCP/mcp-connector`。
- `jlceda_api_search` 改为直接读取离线文档 `iframe/jlceda-pro-api-doc.json`，支持 `query/scope/owner/limit` 检索参数。
- `jlceda_context_get` 新增 EDA 运行时上下文快照采集（工程、文档、图页、选区等）。
- `jlceda_api_invoke` 改为基于 `apiFullName`（`eda.xxx.yyy`）解析并调用 API，参数支持 `positionalArgs/args/namedArgs`。
- 更新工具声明、工具白名单与调试展示逻辑，全面切换到新三工具命名与参数格式。
- 增强工具参数自动修复规则，补齐 `"args": }}` 与 `"args": positionalArgs":[]}` 等异常 JSON 形态，避免在 `parse-arguments` 阶段误失败。

# 1.1.0 (2026-03-08)

- 优化了一些 UI 细节，字体、颜色、大小、粗细，深色主题以及浅色主题都有了更好的视觉体验。
- 设置页面 UI 升级，增加自定义指令功能。
- 增加智谱大模型平台适配，以及思考模式独立开关。
- 聊天页面 UI 升级，增加多会话持久化本地管理功能。
- 聊天会话标题通过AI自动生成并存储到会话列表中，提升用户体验。
- 同步更新用户文档中的设置说明和聊天功能介绍。
- B站视频使用方法同步更新，增加新功能演示和使用指南，链接在设置页面，点击即可弹出视频页面。
- 完成从 sdk 1.1.1 项目迁移到 sdk 1.3.2 项目的源代码适配，补齐迁移后类型与运行时接口兼容处理。
- 清理并替换源代码中的类型检查屏蔽写法，统一补充显式类型声明，恢复严格类型检查路径。
- 完成 `tsc --noEmit`、`eslint src` 与构建链路校验，修复迁移过程中暴露的编译与代码规范问题。
- 基于新版 `@jlceda/pro-api-types` 重新全量提取离线 API 文档 JSON，并增强检索关键词扩展与同义词匹配能力。
- 对齐新版 `sys_Message.showToastMessage` 的消息类型枚举，`messageType.warning` 现映射为 API 要求的 `warn`。

# 1.0.1 (2026-02-28)

- 模型配置页新增醒目提示：获取 API Key 后需先在平台充值，否则可能因余额不足导致验证失败。
- 锁定三个平台 Endpoint 输入框为只读，禁止手动修改。
- 配置读取、保存与验证流程统一使用固定 Endpoint，避免历史配置带入非预期 URL。
- 同步更新用户文档中的配置步骤与 Endpoint 锁定说明。

# 1.0.0 (2026-02-26)

初始版本

- 聊天面板：与本地 Agent 对话，辅助设计流程。
