// 文件说明：封装智能体系统指令构建、自定义指令持久化与拼接逻辑。

/** 自定义指令本地存储键。 */
export const SYSTEM_PROMPT_STORAGE_KEY: any = 'jlceda-design-copilot-system-prompt';

/**
 * 系统指令读取结果。
 */
export interface AgentPromptReadResult {
	/** 固定指令头部。 */
	promptHeader: string;
	/** 本地保存的自定义指令后缀。 */
	customPrompt: string;
	/** 拼接后的完整指令。 */
	prompt: string;
}

// 构建智能体系统指令固定头部。
function buildAgentSystemPrompt(): string {
	return [
		'你是嘉立创 EDA 专业版智能操作助手，能够通过调用嘉立创 EDA API 完成原理图设计、PCB 布局、元件搜索、网络连接、设计检验、制造文件导出等各类电子设计任务。',
	].join('\n');
}

// 规范化指令换行，避免 CRLF/LF 混用。
function normalizePromptLineBreaks(promptText: unknown): string {
	return String(promptText || '').replace(/\r\n/g, '\n');
}

// 读取本地存储中的自定义指令后缀。
function readCustomPromptFromStorage(storageKey: string, runtimeWindow: Window): string {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return '';
		}
		const storedValue: any = runtimeWindow.localStorage.getItem(storageKey);
		if (storedValue === null || typeof storedValue === 'undefined') {
			return '';
		}
		return normalizePromptLineBreaks(storedValue);
	}
	catch {
		return '';
	}
}

// 写入自定义指令后缀到本地存储。
function writeRawPromptToStorage(storageKey: string, promptText: unknown, runtimeWindow: Window): boolean {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return false;
		}
		runtimeWindow.localStorage.setItem(storageKey, normalizePromptLineBreaks(promptText));
		return true;
	}
	catch {
		return false;
	}
}

// 将固定头部与自定义后缀拼接为完整指令。
function mergePromptText(promptHeader: unknown, customPrompt: unknown): string {
	const headerText: any = normalizePromptLineBreaks(promptHeader).trim();
	const customText: any = normalizePromptLineBreaks(customPrompt).trim();
	if (!customText) {
		return headerText;
	}
	return `${headerText}\n\n${customText}`;
}

/**
 * 读取内置默认系统指令。
 * @returns 默认指令文本。
 */
export function readDefaultAgentSystemPrompt(): string {
	return buildAgentSystemPrompt();
}

/**
 * 读取系统指令：固定头部 + 本地自定义后缀。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 读取结果。
 */
export function readAgentSystemPrompt(storageKey: string = SYSTEM_PROMPT_STORAGE_KEY, runtimeWindow: Window = window): AgentPromptReadResult {
	const promptHeader: any = readDefaultAgentSystemPrompt();
	const customPrompt: any = readCustomPromptFromStorage(storageKey, runtimeWindow);
	return {
		promptHeader,
		customPrompt,
		prompt: mergePromptText(promptHeader, customPrompt),
	};
}

/**
 * 持久化保存自定义指令。
 * @param promptText - 待保存指令内容。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 是否保存成功。
 */
export function persistAgentSystemPrompt(promptText: unknown, storageKey: string = SYSTEM_PROMPT_STORAGE_KEY, runtimeWindow: Window = window): boolean {
	return writeRawPromptToStorage(storageKey, promptText, runtimeWindow);
}
