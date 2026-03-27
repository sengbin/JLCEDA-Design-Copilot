// 文件说明：Anthropic Messages API 适配器（Claude 系列模型）。
import type { LlmAdapter, LlmAdapterContext, LlmStreamFormat } from './types';
import { resolveImagePayloadMode } from '../../page/model';
import { readAssistantContent } from './types';

// 将 tools.json 格式工具列表转换为 Anthropic 工具格式。
function convertToAnthropicTools(sourceTools: unknown[]): unknown[] {
	const result: unknown[] = [];
	for (let i: any = 0; i < sourceTools.length; i += 1) {
		const item: any = sourceTools[i] && typeof sourceTools[i] === 'object' ? sourceTools[i] : {};
		if (String(item.type || '').trim() !== 'function' || !item.function) {
			continue;
		}
		const fn: any = item.function && typeof item.function === 'object' ? item.function : {};
		const name: any = String(fn.name || '').trim();
		if (!name) {
			continue;
		}
		result.push({
			name,
			description: String(fn.description || ''),
			input_schema: fn.parameters && typeof fn.parameters === 'object'
				? fn.parameters
				: { type: 'object', properties: {}, additionalProperties: true },
		});
	}
	return result;
}

// 将内部消息内容转换为 Anthropic 用户消息内容块数组。
function buildUserContentParts(content: unknown, allowImagePart: boolean): unknown[] {
	const parts: any[] = [];

	function pushText(text?: any) {
		const trimmed: any = String(text || '').trim();
		if (trimmed) {
			parts.push({ type: 'text', text: trimmed });
		}
	}

	// 追加图片内容块（仅支持 base64 格式）。
	function pushImage(imageValue?: any) {
		if (!allowImagePart) {
			return;
		}
		const imageUrl: any = typeof imageValue === 'string'
			? imageValue
			: (imageValue && imageValue.url ? String(imageValue.url) : '');
		if (!imageUrl) {
			return;
		}
		const dataUrlMatch: any = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
		if (dataUrlMatch) {
			parts.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: String(dataUrlMatch[1] || 'image/png').toLowerCase(),
					data: dataUrlMatch[2],
				},
			});
		}
	}

	if (typeof content === 'string') {
		pushText(content);
	}
	else if (Array.isArray(content)) {
		for (let i: any = 0; i < content.length; i += 1) {
			const item: any = content[i];
			if (!item) {
				continue;
			}
			if (typeof item === 'string') {
				pushText(item);
				continue;
			}
			const type: any = String(item.type || '').trim().toLowerCase();
			if (type === 'text' || type === 'input_text') {
				pushText(item.text || item.output_text || '');
			}
			else if (type === 'image_url' || type === 'input_image') {
				pushImage(item.image_url || '');
			}
		}
	}
	return parts;
}

// 构建 Anthropic Messages API 消息数组。
function buildAnthropicMessages(ctx: LlmAdapterContext): unknown[] {
	const { contextMessages, selectedModel } = ctx;
	const imagePayloadMode: any = resolveImagePayloadMode(selectedModel);
	const allowImagePart: any = imagePayloadMode === 'image_url';
	const messages: any[] = [];

	for (let i: any = 0; i < contextMessages.length; i += 1) {
		const msg: any = contextMessages[i];
		if (!msg || !msg.role) {
			continue;
		}

		if (msg.role === 'user') {
			const parts: any = buildUserContentParts(msg.content, allowImagePart);
			if (parts.length > 0) {
				messages.push({ role: 'user', content: parts });
			}
		}
		else if (msg.role === 'assistant') {
			const blocks: any[] = [];
			const text: any = readAssistantContent(msg.content);
			if (text) {
				blocks.push({ type: 'text', text });
			}
			if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
				for (let tc: any = 0; tc < msg.tool_calls.length; tc += 1) {
					const toolCall: any = msg.tool_calls[tc];
					let input: any = {};
					try {
						const argText: any = String(toolCall && toolCall.function ? (toolCall.function.arguments || '{}') : '{}');
						input = JSON.parse(argText);
					}
					catch { }
					blocks.push({
						type: 'tool_use',
						id: String(toolCall && toolCall.id ? toolCall.id : '').trim() || `toolu-${Date.now()}-${tc}`,
						name: String(toolCall && toolCall.function ? (toolCall.function.name || '') : '').trim(),
						input,
					});
				}
			}
			if (blocks.length > 0) {
				messages.push({ role: 'assistant', content: blocks });
			}
		}
		else if (msg.role === 'tool') {
			// tool 结果合并到 user 消息的 tool_result 块中。
			const toolResult: any = {
				type: 'tool_result',
				tool_use_id: String(msg.tool_call_id || '').trim(),
				content: String(msg.content || '').trim(),
			};
			const lastMsg: any = messages.length > 0 ? messages[messages.length - 1] : null;
			if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content) && lastMsg.content.length > 0 && lastMsg.content[0].type === 'tool_result') {
				lastMsg.content.push(toolResult);
			}
			else {
				messages.push({ role: 'user', content: [toolResult] });
			}
		}
	}
	return messages;
}

/**
 * 创建 Anthropic Messages API 适配器（Claude 系列模型）。
 * @returns LLM 适配器实例。
 */
export function createAnthropicAdapter(): LlmAdapter {
	return {
		buildPayload(ctx: LlmAdapterContext): Record<string, unknown> {
			const anthropicTools: any = convertToAnthropicTools(ctx.tools);
			const payload: Record<string, unknown> = {
				model: ctx.modelName,
				max_tokens: ctx.maxOutputTokens,
				stream: true,
				messages: buildAnthropicMessages(ctx),
			};
			if (ctx.systemText) {
				payload.system = ctx.systemText;
			}
			if (anthropicTools.length > 0) {
				payload.tools = anthropicTools;
				payload.tool_choice = { type: 'auto' };
			}
			return payload;
		},
		buildHeaders(apiKey: string): Record<string, string> {
			return {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			};
		},
		getStreamFormat(): LlmStreamFormat {
			return 'anthropic';
		},
	};
}
