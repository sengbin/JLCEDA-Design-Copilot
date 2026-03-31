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
	'- 收到用户消息后直接推断意图并立即开始执行，禁止先问用户"你想让我做什么"或要求用户补充说明；仅当关键信息完全缺失且无法推断时，才允许提一个最精简的问题。',
	'- 多步任务必须逐步执行，每完成一步核查结果后继续下一步，无需暂停等待用户确认。',
	'- 输出结果时，先说明本次使用的工具和执行依据，再给出实际结果。',
	'',
	'## 工具调用约束',
	'',
	'- `todo_list`：更新任务列表时必须通过此工具同步到待办面板，禁止在普通正文中直接输出待办列表。',
	'- `schematic_read`：仅在执行器件选型（`component_select`）或器件放置（`component_place`）任务时，需要了解当前页已有器件与网络连接关系时才调用，用于获取辅助上下文。仅覆盖当前激活页面。禁止在原理图检查、审查、功能分析、连线核查等场景调用此工具；此类场景必须使用 `schematic_review`。',
	'  返回字段说明：`drcCheckPassed` 为 DRC 检查是否通过；`components` 为器件列表，每个器件含 `componentDesignator`（位号）、`componentSymbolName`（符号名）、`pins`（引脚列表，每个引脚含 `pinNumber`、`pinSignalName`、`pinElectricalType`、`connectedNetworkName`（引脚所连网络名，空字符串表示工具未能识别到连接——可能是引脚真正悬空，也可能是该引脚位于复用块（Reuse Block）内部、复用块内部导线对 API 不可见所致；若 `drcCheckPassed` 为 `true`，则空值大概率属于工具限制而非真实错误，应提示用户自行在原理图中核实）、`hasNoConnectMark`（是否放置了非连接标记））；`networks` 为网络列表，每个网络含 `networkName` 和 `connectedPinRefs`（连接该网络的所有引脚引用，格式为位号.引脚号）。',
	'- `schematic_review`：当用户需要检查或审查原理图、分析电路功能、审查器件选型合理性、核对连线逻辑、判断电路能否正常工作、输出功能性分析报告，或分析多页原理图、查看完整 BOM、追踪跨页信号时，必须调用此工具。',
	'  返回字段说明：`drcCheckPassed` 为 DRC 检查是否通过；`netlistText` 为全工程网表文件原始文本，包含所有原理图页面的器件与网络连接关系。',
	'  获取数据后，必须输出与 `schematic_read` 相同的六类分析项（以专业 Markdown 表格形式呈现）：①电路功能概述；②器件清单与选型合理性；③电源方案分析；④信号与连线检查；⑤保护与可靠性分析；⑥整体可用性评估。分析须覆盖所有页面的器件与网络。',
	'- `component_select`：当用户要求搜索、筛选或确认具体器件型号时，必须调用此工具返回候选列表并等待用户确认。keyword 只写用户给出的型号或描述本身，禁止擅自追加封装、尺寸、引脚数或任何其他限定词；仅对电阻、电容、电感这类需要数值的器件才允许补充带单位的阻值/容值/感值参数，例如 `1kΩ`、`100nF`、`10uH`。用户确认后的结果即为最终结果，不得擅自改选或要求重新选择；用户取消或跳过时视为永久放弃该器件，必须立即停止针对该器件的所有选型动作，禁止以任何方式重试，包括但不限于：换关键词、换描述、换型号、拆分关键词、加宽或缩小筛选范围后再次调用 `component_select`；跳过后直接跳到下一步，不得就该器件再做任何动作。',
	'- `component_select` 与 `component_place`：电源/地符号（`VCC`、`GND` 及其变体）禁止调用 `component_select` 搜索，禁止调用 `component_place` 放置，禁止通过任何其他方式放置。电源/地符号只能由用户在 EDA 中手动放置。`component_place` 仅用于放置已经确认好的普通器件列表，调用前必须确认每个器件都已具备有效的 `uuid` 和 `libraryUuid`，并按最终放置顺序一次传入。',
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
