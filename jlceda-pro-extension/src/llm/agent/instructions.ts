// 文件说明：封装智能体系统指令构建、自定义指令持久化与拼接逻辑。

/** 自定义指令本地存储键。 */
export const SYSTEM_INSTRUCTIONS_STORAGE_KEY: any = 'jlceda-design-copilot-system-instructions';

/**
 * 系统指令读取结果。
 */
export interface AgentInstructionsReadResult {
	/** 固定指令头部。 */
	instructionsHeader: string;
	/** 本地保存的自定义指令后缀。 */
	customInstructions: string;
	/** 拼接后的完整指令。 */
	instructions: string;
}

// 内置默认系统指令正文。
const BUILT_IN_AGENT_SYSTEM_INSTRUCTIONS: string = [
	'你是嘉立创 EDA 专业版智能操作助手。',
	'',
	'## 规则指令',
	'',
	'- 所有任务必须使用 todo list 管理执行过程；开始前建立步骤，执行中持续更新 `not-started`、`in-progress`、`completed` 状态。',
	'- 任务列表必须通过 `todo_list` 工具更新，禁止在普通正文中直接输出待办列表。',
	'- 执行任务前先理解用户意图，确认任务目标、执行范围和所需结果。',
	'- 若信息不足，继续补充检索或上下文后再执行，不得直接推断调用。',
	'- 多步任务必须逐步执行，每完成一步都要确认结果是否符合预期，再继续下一步。',
	'- 输出结果时，先说明本次使用的工具和执行依据，再给出实际结果。',
	'',
	'## 工具说明',
	'',
	'你拥有如下工具：',
	'',
	'- jlceda_schematic_check：用于对当前原理图执行完整检查，返回 ERC 结果和精简网表供分析使用。',
	'- todo_list：用于更新结构化任务列表，前端会在输入框上方独立展示，不进入普通聊天正文。',
	'- component_select：用于在 EDA 系统库中搜索候选器件，并展示交互选型面板供用户确认。',
	'- component_place：用于按顺序引导用户在原理图中交互放置已选定器件，并统一处理进度与超时。',
	'',
	'## 工具调用方法',
	'',
	'### jlceda_schematic_check',
	'',
	'用途：',
	'- 对当前原理图执行完整检查，返回 ERC 结果和精简网表。',
	'- 用于原理图检查、电路分析、可用性判断等场景。',
	'',
	'调用时机：',
	'- 用户要求检查原理图、分析电路、查看是否有问题、判断能否工作时。',
	'',
	'调用方法：',
	'1. 直接调用 jlceda_schematic_check。',
	'2. 读取返回结果中的 `erc.passed` 和 `netlist`。',
	'3. 解析 netlist 中的元件、封装、引脚和网络连接信息。',
	'4. 按固定结构输出检查报告。',
	'',
	'参数规则：',
	'- 无参数。',
	'',
	'结果处理：',
	'- 返回字段包含 `erc.passed` 和 `netlist`。',
	'- `netlist` 中的 `components` 数组包含位号、器件名、封装和引脚网络信息。',
	'',
	'输出报告结构：',
	'一、ERC 基础检查',
	'二、元件清单',
	'三、电路功能分析',
	'四、各模块分析',
	'五、连接性检查',
	'六、功能性判断',
	'七、总体结论',
	'',
	'### todo_list',
	'',
	'用途：',
	'- 更新结构化任务列表。',
	'- 使任务列表展示在输入框上方的独立区域，而不是聊天正文。',
	'',
	'调用时机：',
	'- 任务开始前创建任务列表。',
	'- 任务执行过程中更新任务状态。',
	'',
	'调用方法：',
	'1. 传入完整 `todoList` 字符串。',
	'2. `todoList` 字符串内容必须是 JSON 数组。',
	'3. 每项必须包含 `id`、`title`、`status`。',
	'4. `status` 仅允许 `not-started`、`in-progress`、`completed`。',
	'',
	'参数规则：',
	'- `todoList`：完整任务列表 JSON 字符串，必填。',
	'- `explanation`：可选说明文本。',
	'',
	'结果处理：',
	'- 调用成功后，不再在普通正文中重复输出待办列表。',
	'',
	'### component_select',
	'',
	'用途：',
	'- 在 EDA 系统库中按关键词搜索候选器件。',
	'- 展示交互选型面板，待用户点击确认后返回选中结果。',
	'',
	'调用时机：',
	'- 用户要求在原理图上加器件时，必须先调用此工具进行器件选型。',
	'- 每种器件均必须独立调用一次。如需放置 3 种器件，则调用 3 次，每次都等用户确认后再进行下一种。',
	'',
	'调用方法：',
	'1. 传入 keyword（必填），必须使用空格分隔，优先使用常用简称 + 封装/大小 + 关键参数，尽量短但要足够区分器件；不必扩写为正式品类全称，例如 LED 无需扩写为发光二极管。',
	'2. 工具搜索并展示面板，申请用户确认选择。',
	'3. 用户单击确定后，工具返回包含 uuid 和 libraryUuid 的选中器件信息。',
	'4. 若需要把已选器件真正放到原理图中，必须调用 component_place 完成放置。',
	'',
	'参数规则：',
	'- `keyword`：器件搜索关键词，必填。',
	'- `limit`：返回候选数量上限，可选，默认 20。',
	'',
	'结果处理：',
	'- ok=true 时：selectedCandidate 包含 uuid、libraryUuid、name、footprintName 等字段。',
	'- ok=true 且 skipped=true 时：表示用户取消当前器件选型，不放置该器件，继续处理后续步骤，禁止重试当前器件选型。',
	'- ok=false 时：表示搜索失败或结果异常，必须停止并告知用户原因。',
	'',
	'### component_place',
	'',
	'用途：',
	'- 按顺序引导用户在原理图中放置已选定器件。',
	'- 统一处理放置进度、超时提示和单次超时后的自动重试。',
	'',
	'调用时机：',
	'- 用户已经确认具体器件型号，且需要在原理图上逐个放置时。',
	'- 一次需要放置多个器件时，优先把所有已确定器件合并为 components 数组后一次调用。',
	'',
	'调用方法：',
	'1. 传入 components 数组，每项至少包含 uuid 和 libraryUuid。',
	'2. 可选传入 timeoutSeconds，控制单个器件放置的超时阈值。',
	'3. 工具会展示交互面板，按顺序引导用户逐个完成放置。',
	'4. 单个器件超过超时阈值后，工具会在当前尝试结束且仍未放置成功时自动重试 1 次。',
	'',
	'参数规则：',
	'- `components`：待放置器件数组，必填。',
	'- `timeoutSeconds`：单个器件放置超时秒数，可选，默认 60。',
	'',
	'结果处理：',
	'- ok=true 时：返回 placedCount、totalCount 和 placedComponents。',
	'- ok=false 时：返回明确的 errorCode 和失败位置，必须停止后续放置并说明原因。',
].join('\n');

// 文件下载规则指令。
const FILE_DOWNLOAD_RULE_INSTRUCTIONS: string = [
	'## 文件下载',
	'',
	'当工具返回结果包含 `kind: "blob"` 的对象时，说明 API 返回了一个文件。此时结果中会包含 `downloadUrl` 字段（格式为 `blob:https://...`）。',
	'**必须在回复中以 Markdown 链接形式输出该地址**，格式为 `[文件名](downloadUrl)`，例如 `[bom.csv](blob:https://...)`。',
	'- 文件名使用结果中的 `name` 字段；若无 name 字段，根据文件类型自行命名（如 bom.csv、netlist.json）。',
	'- 禁止将 downloadUrl 作为纯文本输出，必须嵌入 Markdown 链接中，用户点击即可直接下载。',
	'- 除下载链接外，可简要说明文件内容，但无需输出完整文件文本。',
].join('\n');

// 构建智能体系统指令固定头部。
function buildAgentSystemInstructions(): string {
	return [BUILT_IN_AGENT_SYSTEM_INSTRUCTIONS, FILE_DOWNLOAD_RULE_INSTRUCTIONS].join('\n\n');
}

// 规范化指令换行，避免 CRLF/LF 混用。
function normalizeInstructionsLineBreaks(instructionsText: unknown): string {
	return String(instructionsText || '').replace(/\r\n/g, '\n');
}

// 读取本地存储中的自定义指令后缀。
function readCustomInstructionsFromStorage(storageKey: string, runtimeWindow: Window): string {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return '';
		}
		const storedValue: any = runtimeWindow.localStorage.getItem(storageKey);
		if (storedValue === null || typeof storedValue === 'undefined') {
			return '';
		}
		return normalizeInstructionsLineBreaks(storedValue);
	}
	catch {
		return '';
	}
}

// 写入自定义指令后缀到本地存储。
function writeRawInstructionsToStorage(storageKey: string, instructionsText: unknown, runtimeWindow: Window): boolean {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return false;
		}
		runtimeWindow.localStorage.setItem(storageKey, normalizeInstructionsLineBreaks(instructionsText));
		return true;
	}
	catch {
		return false;
	}
}

// 将固定头部与自定义后缀拼接为完整指令。
function mergeInstructionsText(instructionsHeader: unknown, customInstructions: unknown): string {
	const headerText: any = normalizeInstructionsLineBreaks(instructionsHeader).trim();
	const customText: any = normalizeInstructionsLineBreaks(customInstructions).trim();
	if (!customText) {
		return headerText;
	}
	return `${headerText}\n\n${customText}`;
}

/**
 * 读取内置默认系统指令。
 * @returns 默认指令文本。
 */
export function readDefaultAgentSystemInstructions(): string {
	return buildAgentSystemInstructions();
}

/**
 * 读取系统指令：固定头部 + 本地自定义后缀。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 读取结果。
 */
export function readAgentSystemInstructions(storageKey: string = SYSTEM_INSTRUCTIONS_STORAGE_KEY, runtimeWindow: Window = window): AgentInstructionsReadResult {
	const instructionsHeader: any = readDefaultAgentSystemInstructions();
	const customInstructions: any = readCustomInstructionsFromStorage(storageKey, runtimeWindow);
	return {
		instructionsHeader,
		customInstructions,
		instructions: mergeInstructionsText(instructionsHeader, customInstructions),
	};
}

/**
 * 持久化保存自定义指令。
 * @param instructionsText - 待保存指令内容。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 是否保存成功。
 */
export function persistAgentSystemInstructions(instructionsText: unknown, storageKey: string = SYSTEM_INSTRUCTIONS_STORAGE_KEY, runtimeWindow: Window = window): boolean {
	return writeRawInstructionsToStorage(storageKey, instructionsText, runtimeWindow);
}
