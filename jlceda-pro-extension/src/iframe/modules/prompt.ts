// 文件说明：封装系统提示词头部固定内容、自定义后缀持久化与拼接逻辑。
import { buildAgentSystemPrompt } from './llm/agent/agent-tools';
/** 系统提示词本地存储键。 */
export const SYSTEM_PROMPT_STORAGE_KEY: any = 'jlceda-design-copilot-system-prompt';
/** 首次安装时写入的默认自定义提示词。 */
export const DEFAULT_CUSTOM_PROMPT_TEXT: any = [
	'输出语言必须是中文，表达要准确、可执行。',
	'你只能基于当前可用工具与其返回结果工作，不得虚构参数或执行结果。',
	'结果输出必须结构化：目标、执行步骤、调用结果、下一步。',
	'放置器件不要使用 placeComponentWithMouse。',
].join('\n');
/**
 * 系统提示词读取结果。
 */
export interface AgentPromptReadResult {
	/** 固定提示词头部。 */
	promptHeader: string;
	/** 本地保存的自定义提示词后缀。 */
	customPrompt: string;
	/** 拼接后的完整提示词。 */
	prompt: string;
}
// 规范化提示词换行，避免 CRLF/LF 混用。
function normalizePromptLineBreaks(promptText: unknown): string {
	return String(promptText || '').replace(/\r\n/g, '\n');
}
// 读取本地存储中的自定义提示词后缀。
function readCustomPromptFromStorage(storageKey: string, runtimeWindow: Window): string {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return '';
		}
		const storedValue: any = runtimeWindow.localStorage.getItem(storageKey);
		if (storedValue === null || typeof storedValue === 'undefined') {
			const hasWritten: any = writeRawPromptToStorage(storageKey, DEFAULT_CUSTOM_PROMPT_TEXT, runtimeWindow);
			if (!hasWritten) {
				return '';
			}
			return normalizePromptLineBreaks(DEFAULT_CUSTOM_PROMPT_TEXT);
		}
		return normalizePromptLineBreaks(storedValue);
	}
	catch {
		return '';
	}
}
// 写入自定义提示词后缀到本地存储。
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
// 将固定头部与自定义后缀拼接为完整提示词。
function mergePromptText(promptHeader: unknown, customPrompt: unknown): string {
	const headerText: any = normalizePromptLineBreaks(promptHeader).trim();
	const customText: any = normalizePromptLineBreaks(customPrompt).trim();
	if (!customText) {
		return headerText;
	}
	return `${headerText}\n\n${customText}`;
}
/**
 * 读取内置默认系统提示词。
 * @returns 默认提示词文本。
 */
export function readDefaultAgentSystemPrompt(): string {
	return buildAgentSystemPrompt();
}
/**
 * 读取系统提示词：固定头部 + 本地自定义后缀。
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
 * 持久化保存系统提示词。
 * @param promptText - 待保存提示词内容。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 是否保存成功。
 */
export function persistAgentSystemPrompt(promptText: unknown, storageKey: string = SYSTEM_PROMPT_STORAGE_KEY, runtimeWindow: Window = window): boolean {
	return writeRawPromptToStorage(storageKey, promptText, runtimeWindow);
}
