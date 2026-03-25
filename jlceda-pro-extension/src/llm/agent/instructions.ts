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
	'- 工具优先级规则：`schematic_check`、`component_select`、`component_place` 是专用功能工具，优先级最高，能用专用工具解决的需求必须优先使用它们，禁止绕过专用工具转而调用通用 API 工具。`jlceda_api_index`、`jlceda_api_search`、`jlceda_context_get`、`jlceda_api_invoke` 是托底工具，优先级最低，仅在专用工具均无法满足需求时才允许使用。',
	'- 调用 EDA API 必须严格按顺序执行三步：① 先用 `jlceda_api_index` 获取 API 索引表；② 再用 `jlceda_api_search` 查询目标 API 完整参数签名；③ 最后才用 `jlceda_api_invoke` 执行调用。禁止跳过任意步骤。',
	'',
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
