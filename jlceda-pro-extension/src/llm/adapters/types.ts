// 文件说明：LLM 适配器统一接口定义与各适配器共用工具函数。
import { MANUAL_EXPOSED_TOOL_NAMES } from '../../tools/executor';

/** 智能体内部统一消息格式。 */
export interface AgentMessage {
	role: string;
	content?: unknown;
	reasoning_content?: string;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

/** 工具调用格式。 */
export interface ToolCall {
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
}

/** 传入适配器的统一上下文参数。 */
export interface LlmAdapterContext {
	/** 模型名称。 */
	modelName: string;
	/** 经过 token 预算裁剪后的上下文消息列表。 */
	contextMessages: AgentMessage[];
	/** 系统提示文本。 */
	systemText: string;
	/** 已筛选的可暴露工具列表（tools.json 原始格式）。 */
	tools: unknown[];
	/** 最大输出 token 数。 */
	maxOutputTokens: number;
	/** 当前选中的模型标识。 */
	selectedModel: string;
}

/** 流式响应格式类型。 */
export type LlmStreamFormat = 'chat' | 'responses' | 'anthropic';

/** LLM 适配器接口（策略模式）。 */
export interface LlmAdapter {
	/** 构建 HTTP 请求体。 */
	buildPayload: (context: LlmAdapterContext) => Record<string, unknown>;
	/** 构建 HTTP 请求头。 */
	buildHeaders: (apiKey: string) => Record<string, string>;
	/** 返回本适配器使用的流式响应格式类型。 */
	getStreamFormat: () => LlmStreamFormat;
}

/**
 * 按固定名单筛选可暴露给模型的工具。
 * @param sourceTools - tools.json 原始工具列表。
 * @returns 筛选后的工具列表。
 */
export function pickExposedTools(sourceTools: unknown[]): unknown[] {
	const items: any = Array.isArray(sourceTools) ? sourceTools : [];
	const allowedNames: any = new Set(MANUAL_EXPOSED_TOOL_NAMES);
	const result: unknown[] = [];
	for (let i: any = 0; i < items.length; i += 1) {
		const item: any = items[i] && typeof items[i] === 'object' ? items[i] : {};
		const fn: any = item.function && typeof item.function === 'object' ? item.function : {};
		const name: any = String(fn.name || '').trim();
		if (name && allowedNames.has(name)) {
			result.push(items[i]);
		}
	}
	return result;
}

/**
 * 读取消息内容的纯文本。
 * @param content - 消息内容字段。
 * @returns 文本内容。
 */
export function readAssistantContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((item: any) => {
				if (!item) {
					return '';
				}
				if (typeof item === 'string') {
					return item;
				}
				if (item.type === 'text' || item.type === 'input_text') {
					return String(item.text || '');
				}
				if (item.type === 'image_url' || item.type === 'input_image') {
					return '[图片]';
				}
				return '';
			})
			.join('\\n')
			.trim();
	}
	return '';
}

/**
 * 规范化推理内容文本。
 * @param value - 推理内容原始值。
 * @returns 推理文本。
 */
export function normalizeReasoning(value: unknown): string {
	if (!value) {
		return '';
	}
	if (typeof value === 'string') {
		return value.trim();
	}
	if (Array.isArray(value)) {
		return value
			.map((item: any) => {
				if (!item) {
					return '';
				}
				if (typeof item === 'string') {
					return item;
				}
				if (typeof item.text === 'string') {
					return item.text;
				}
				if (typeof item.reasoning_content === 'string') {
					return item.reasoning_content;
				}
				return '';
			})
			.join('\n')
			.trim();
	}
	if (typeof value === 'object' && value !== null) {
		const v: any = value;
		if (typeof v.text === 'string') {
			return v.text.trim();
		}
		if (typeof v.reasoning_content === 'string') {
			return v.reasoning_content.trim();
		}
	}
	return '';
}

/**
 * 读取消息中的推理内容。
 * @param message - 消息对象。
 * @param fallbackText - 备用文本。
 * @returns 推理文本。
 */
export function readReasoningContent(message: unknown, fallbackText?: string): string {
	const msg: any = message;
	const fromMessage: any = normalizeReasoning(
		msg && (msg.reasoning_content || msg.reasoning || msg.reasoningContent),
	);
	if (fromMessage) {
		return fromMessage;
	}
	return String(fallbackText || '').trim();
}

/**
 * 获取消息列表中最后一条用户消息的索引。
 * @param messages - 消息列表。
 * @returns 索引，无则返回 -1。
 */
export function findLastUserMessageIndex(messages: AgentMessage[]): number {
	const source: any = Array.isArray(messages) ? messages : [];
	for (let i: any = source.length - 1; i >= 0; i -= 1) {
		if (source[i] && source[i].role === 'user') {
			return i;
		}
	}
	return -1;
}
