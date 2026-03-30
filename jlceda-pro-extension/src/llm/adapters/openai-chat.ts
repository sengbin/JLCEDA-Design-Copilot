// 文件说明：OpenAI chat/completions 格式适配器。
import type { LlmAdapter, LlmAdapterContext, LlmStreamFormat } from './types';
import { resolveImagePayloadMode } from '../../page/model';
import { findLastUserMessageIndex, readReasoningContent } from './types';

/**
 * 规范化消息内容为 chat/completions API 格式。
 * @param content - 消息内容原始值。
 * @param allowImagePart - 是否保留图片内容块。
 * @returns 规范化后的内容（字符串、字符串数组或内容块数组）。
 */
export function normalizeMessageContentForChat(content: unknown, allowImagePart?: boolean): unknown {
	const normalizedParts: any[] = [];
	const textLines: string[] = [];

	// 追加文本内容。
	function pushText(text?: any) {
		const trimmed: any = String(text || '').trim();
		if (!trimmed) {
			return;
		}
		textLines.push(trimmed);
		if (allowImagePart) {
			normalizedParts.push({ type: 'text', text: trimmed });
		}
	}

	// 追加图片内容。
	function pushImage(imageValue?: any) {
		const imageUrl: any = typeof imageValue === 'string'
			? imageValue
			: (imageValue && imageValue.url ? String(imageValue.url) : '');
		if (!imageUrl) {
			return;
		}
		textLines.push('[图片]');
		if (allowImagePart) {
			normalizedParts.push({ type: 'image_url', image_url: { url: imageUrl } });
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
				continue;
			}
			if (type === 'image_url' || type === 'input_image') {
				pushImage(item.image_url || '');
			}
		}
	}

	if (allowImagePart) {
		if (normalizedParts.length === 0) {
			return '';
		}
		if (normalizedParts.length === 1 && normalizedParts[0].type === 'text') {
			return normalizedParts[0].text;
		}
		return normalizedParts;
	}
	return textLines.join('\n').trim();
}

// 构建 chat/completions 消息数组。
export function buildChatMessages(ctx: LlmAdapterContext): unknown[] {
	const outputMessages: any[] = [{ role: 'system', content: String(ctx.systemText || '').trim() }];
	const { contextMessages } = ctx;
	const lastUserIndex: any = findLastUserMessageIndex(contextMessages);
	const imagePayloadMode: any = resolveImagePayloadMode(ctx.selectedModel);
	const allowImagePart: any = imagePayloadMode === 'image_url';

	for (let i: any = 0; i < contextMessages.length; i += 1) {
		const msg: any = contextMessages[i];
		if (!msg || !msg.role) {
			continue;
		}

		if (msg.role === 'tool') {
			if (i <= lastUserIndex) {
				continue;
			}
			outputMessages.push({
				role: 'tool',
				tool_call_id: String(msg.tool_call_id || ''),
				name: String(msg.name || ''),
				content: String(msg.content || '').trim(),
			});
			continue;
		}

		if (msg.role === 'user' || msg.role === 'assistant') {
			const hasToolCalls: any = msg.role === 'assistant'
				&& i > lastUserIndex
				&& Array.isArray(msg.tool_calls)
				&& msg.tool_calls.length > 0;
			const normalizedContent: any = normalizeMessageContentForChat(msg.content, allowImagePart);
			if (!normalizedContent && !hasToolCalls) {
				continue;
			}
			const normalizedMessage: any = {
				role: msg.role,
				// tool_calls 场景使用字符串内容，避免兼容端对 null 处理不一致。
				content: normalizedContent || '',
			};
			if (msg.role === 'assistant') {
				const reasoning: any = readReasoningContent(msg);
				if (reasoning) {
					normalizedMessage.reasoning_content = reasoning;
				}
			}
			if (hasToolCalls) {
				normalizedMessage.tool_calls = msg.tool_calls;
			}
			outputMessages.push(normalizedMessage);
		}
	}
	return outputMessages;
}

/**
 * 创建 OpenAI chat/completions 格式适配器。
 * @returns LLM 适配器实例。
 */
export function createOpenAIChatAdapter(): LlmAdapter {
	return {
		buildPayload(ctx: LlmAdapterContext): Record<string, unknown> {
			return {
				model: ctx.modelName,
				messages: buildChatMessages(ctx),
				tools: ctx.tools,
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
