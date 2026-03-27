// 文件说明：OpenAI v1/responses 格式适配器。
import type { LlmAdapter, LlmAdapterContext, LlmStreamFormat } from './types';
import { findLastUserMessageIndex, readAssistantContent, readReasoningContent } from './types';

// 将 tools.json 格式工具列表转换为 Responses API 扁平格式（无 .function 子对象）。
function convertToResponsesTools(sourceTools: unknown[]): unknown[] {
	const result: unknown[] = [];
	for (let i: any = 0; i < sourceTools.length; i += 1) {
		const item: any = sourceTools[i] && typeof sourceTools[i] === 'object' ? sourceTools[i] : {};
		if (String(item.type || '').trim() !== 'function') {
			continue;
		}
		const fn: any = item.function && typeof item.function === 'object' ? item.function : {};
		const name: any = String(fn.name || '').trim();
		if (!name) {
			continue;
		}
		result.push({
			type: 'function',
			name,
			description: String(fn.description || ''),
			parameters: fn.parameters && typeof fn.parameters === 'object'
				? fn.parameters
				: { type: 'object', properties: {}, additionalProperties: true },
		});
	}
	return result;
}

// 规范化消息内容为 Responses API 所需结构。
function normalizeContentForResponses(content: unknown, role: string): unknown[] {
	const normalized: any[] = [];
	// assistant 消息内容类型必须为 output_text，user 为 input_text。
	const textType: any = String(role || '').trim() === 'assistant' ? 'output_text' : 'input_text';

	function pushText(text?: any) {
		const trimmed: any = String(text || '').trim();
		if (trimmed) {
			normalized.push({ type: textType, text: trimmed });
		}
	}

	function pushImage(urlValue?: any) {
		if (!urlValue) {
			return;
		}
		const imageUrl: any = typeof urlValue === 'string' ? urlValue : (urlValue && urlValue.url ? urlValue.url : '');
		if (!imageUrl) {
			return;
		}
		normalized.push({ type: 'input_image', image_url: imageUrl });
	}

	if (typeof content === 'string') {
		pushText(content);
		return normalized;
	}
	if (!Array.isArray(content)) {
		return normalized;
	}
	for (let i: any = 0; i < content.length; i += 1) {
		const item: any = content[i];
		if (!item || typeof item !== 'object') {
			continue;
		}
		const type: any = String(item.type || '').trim().toLowerCase();
		if (type === 'input_text' || type === 'text') {
			pushText(item.text || item.output_text || '');
			continue;
		}
		if (type === 'input_image' || type === 'image_url') {
			pushImage(item.image_url || '');
		}
	}
	return normalized;
}

// 组装 responses 回退输入文本（当 entries 为空时使用）。
function buildResponsesInputFallback(contextMessages: unknown[], systemText: string): string {
	const historyLines: string[] = [];
	for (let i: any = 0; i < contextMessages.length; i += 1) {
		const msg: any = contextMessages[i];
		if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) {
			continue;
		}
		const text: any = readAssistantContent(msg.content);
		if (!text) {
			continue;
		}
		historyLines.push(`${msg.role === 'assistant' ? '助手' : '用户'}：${text}`);
	}
	const recentLines: any = historyLines.slice(-12);
	const historyText: any = recentLines.join('\n');
	const pieces: any = [`系统提示：${String(systemText || '').trim()}`];
	if (historyText) {
		pieces.push(`对话历史：\n${historyText}`);
	}
	return pieces.join('\n\n');
}

// 构建 Responses API 输入条目数组。
function buildResponsesInput(ctx: LlmAdapterContext): unknown[] {
	const { contextMessages, systemText } = ctx;
	const lastUserIndex: any = findLastUserMessageIndex(contextMessages);
	const entries: any[] = [];

	for (let i: any = 0; i < contextMessages.length; i += 1) {
		const msg: any = contextMessages[i];
		if (!msg || !msg.role) {
			continue;
		}

		if (msg.role === 'tool') {
			if (i <= lastUserIndex) {
				continue;
			}
			const callId: any = String(msg.tool_call_id || '').trim();
			const output: any = String(msg.content || '').trim();
			if (!callId || !output) {
				continue;
			}
			entries.push({ type: 'function_call_output', call_id: callId, output });
			continue;
		}

		if (msg.role !== 'user' && msg.role !== 'assistant') {
			continue;
		}

		// assistant 消息携带 tool_calls 时，历史轮次只保留文本，当前轮次转换为 function_call 条目，
		// 避免孤立 function_call 缺少对应 output 导致模型死循环。
		if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
			const textContent: any = normalizeContentForResponses(msg.content, 'assistant');
			if (i <= lastUserIndex) {
				if (textContent.length > 0) {
					entries.push({ role: 'assistant', content: textContent });
				}
				continue;
			}
			if (textContent.length > 0) {
				entries.push({ role: 'assistant', content: textContent });
			}
			for (let tc: any = 0; tc < msg.tool_calls.length; tc += 1) {
				const toolCall: any = msg.tool_calls[tc];
				if (!toolCall || !toolCall.function) {
					continue;
				}
				entries.push({
					type: 'function_call',
					call_id: String(toolCall.id || `call-${tc}`),
					name: String(toolCall.function.name || ''),
					arguments: String(toolCall.function.arguments || '{}'),
				});
			}
			continue;
		}

		const contentArray: any = normalizeContentForResponses(msg.content, msg.role);
		if (contentArray.length === 0) {
			continue;
		}
		const entry: any = { role: msg.role, content: contentArray };
		if (msg.role === 'assistant') {
			const reasoning: any = readReasoningContent(msg);
			if (reasoning) {
				entry.reasoning_content = reasoning;
			}
		}
		entries.push(entry);
	}

	if (entries.length === 0) {
		entries.push({
			role: 'user',
			content: [{ type: 'input_text', text: buildResponsesInputFallback(contextMessages, systemText) }],
		});
	}
	return entries;
}

/**
 * 创建 OpenAI v1/responses 格式适配器。
 * @returns LLM 适配器实例。
 */
export function createOpenAIResponsesAdapter(): LlmAdapter {
	return {
		buildPayload(ctx: LlmAdapterContext): Record<string, unknown> {
			return {
				model: ctx.modelName,
				instructions: ctx.systemText || undefined,
				input: buildResponsesInput(ctx),
				tools: convertToResponsesTools(ctx.tools),
				tool_choice: 'auto',
				max_output_tokens: ctx.maxOutputTokens,
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
			return 'responses';
		},
	};
}
