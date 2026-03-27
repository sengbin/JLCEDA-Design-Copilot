// 文件说明：DeepSeek 系列模型专用适配器（chat/completions 格式，数组参数转字符串，启用 strict 模式）。
import type { LlmAdapter, LlmAdapterContext, LlmStreamFormat } from './types';
import { buildChatMessages } from './openai-chat';

// 为 DeepSeek 适配工具声明：启用 strict 模式。
function adaptToolsForDeepSeek(sourceTools: unknown[]): unknown[] {
	const items: any = Array.isArray(sourceTools) ? sourceTools : [];
	return items.map((tool: any) => {
		if (!tool || typeof tool !== 'object') {
			return tool;
		}
		if (String(tool.type || '').trim() !== 'function' || !tool.function || typeof tool.function !== 'object') {
			return tool;
		}
		const fn: any = tool.function;
		return {
			...tool,
			function: {
				...fn,
				strict: true,
			},
		};
	});
}

/**
 * 创建 DeepSeek 系列模型专用适配器。
 * @returns LLM 适配器实例。
 */
export function createDeepSeekAdapter(): LlmAdapter {
	return {
		buildPayload(ctx: LlmAdapterContext): Record<string, unknown> {
			return {
				model: ctx.modelName,
				messages: buildChatMessages(ctx),
				tools: adaptToolsForDeepSeek(ctx.tools),
				tool_choice: 'auto',
				temperature: 0.0,
				max_tokens: ctx.maxOutputTokens,
				stream: true,
			};
		},
		buildHeaders(apiKey: string): Record<string, string> {
			return {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			};
		},
		getStreamFormat(): LlmStreamFormat {
			return 'chat';
		},
	};
}
