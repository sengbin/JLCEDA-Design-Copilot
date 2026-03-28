/*
------------------------------------------------------------------------
名称：聊天记录复制模块
说明：将当前轮次或全部聊天历史按 Markdown 格式复制到剪切板。
      通过顶部常量开关控制各类内容的复制行为。
作者：Lion
邮箱：chengbin@3578.cn
日期：2026-03-28
备注：无
------------------------------------------------------------------------
*/

// -----------------------------------------------------------------------
// 内容控制常量：true = 复制时包含该类型内容，false = 跳过该类型内容
// -----------------------------------------------------------------------

/** 是否复制思考内容（reasoning_content 字段）。 */
export const COPY_INCLUDE_REASONING: boolean = false;

/** 是否复制工具调用的输入参数 JSON。 */
export const COPY_INCLUDE_TOOL_INPUT: boolean = false;

/** 是否复制工具调用的返回数据 JSON。 */
export const COPY_INCLUDE_TOOL_OUTPUT: boolean = false;

// -----------------------------------------------------------------------
// 私有辅助函数
// -----------------------------------------------------------------------

// 从用户消息 content 字段提取纯文本（content 可能是字符串或 OpenAI 多模态数组）。
function extractUserText(content: unknown): string {
	if (typeof content === 'string') {
		return content.trim();
	}
	if (!Array.isArray(content)) {
		return '';
	}
	const parts: string[] = [];
	for (let i = 0; i < content.length; i += 1) {
		const part: any = content[i];
		if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
			const text: string = part.text.trim();
			if (text) {
				parts.push(text);
			}
		}
		else if (part && typeof part === 'object' && part.type === 'image_url') {
			parts.push('[图片附件]');
		}
	}
	return parts.join('\n');
}

// 从 assistant content 字段提取纯文本（string 或 content-block 数组）。
function extractAssistantText(content: unknown): string {
	if (typeof content === 'string') {
		return content.trim();
	}
	if (!Array.isArray(content)) {
		return '';
	}
	const parts: string[] = [];
	for (let i = 0; i < content.length; i += 1) {
		const block: any = content[i];
		if (block && typeof block === 'object') {
			if (block.type === 'text' && typeof block.text === 'string') {
				const text: string = block.text.trim();
				if (text) {
					parts.push(text);
				}
			}
			else if (block.type === 'thinking' && typeof block.thinking === 'string') {
				if (COPY_INCLUDE_REASONING) {
					const thinking: string = block.thinking.trim();
					if (thinking) {
						parts.push(`> **思考过程**\n>\n${thinking.split('\n').map((line: string) => `> ${line}`).join('\n')}`);
					}
				}
			}
		}
	}
	return parts.join('\n\n');
}

// 将工具名转换为可读显示名。
function formatToolName(name: unknown): string {
	return String(name || '').trim() || '未知工具';
}

// 将单条 agentMessage 转换为 Markdown 片段，返回空数组表示应跳过该条。
function messageToMarkdownParts(message: any): string[] {
	if (!message || typeof message !== 'object') {
		return [];
	}
	const role: string = String(message.role || '');
	const parts: string[] = [];

	if (role === 'user') {
		const text: string = extractUserText(message.content);
		if (text) {
			parts.push(`**用户**\n\n${text}`);
		}
		return parts;
	}

	if (role === 'assistant') {
		// 思考内容（reasoning_content 字段，非 content-block 形式）
		if (COPY_INCLUDE_REASONING) {
			const reasoning: string = String(message.reasoning_content || '').trim();
			if (reasoning) {
				const quotedLines: string = reasoning.split('\n').map((line: string) => `> ${line}`).join('\n');
				parts.push(`> **思考过程**\n>\n${quotedLines}`);
			}
		}
		// 正文
		const text: string = extractAssistantText(message.content);
		if (text) {
			parts.push(`**AI**\n\n${text}`);
		}
		// 工具调用（工具名与参数 JSON 一同受开关控制，关闭时整条跳过）
		if (COPY_INCLUDE_TOOL_INPUT && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			for (let i = 0; i < message.tool_calls.length; i += 1) {
				const tc: any = message.tool_calls[i];
				const tcName: string = formatToolName(tc && tc.function ? tc.function.name : '');
				const args: string = String(tc && tc.function ? tc.function.arguments || '' : '').trim();
				let prettyArgs: string = args;
				try {
					prettyArgs = JSON.stringify(JSON.parse(args), null, 2);
				}
				catch {
					// 非 JSON 时保留原样
				}
				parts.push(`**工具调用**：${tcName}\n\n\`\`\`json\n${prettyArgs}\n\`\`\``);
			}
		}
		return parts;
	}

	if (role === 'tool') {
		// 工具返回整条受开关控制，关闭时整条跳过。
		if (!COPY_INCLUDE_TOOL_OUTPUT) {
			return [];
		}
		const toolName: string = formatToolName(message.name);
		const content: string = String(message.content || '').trim();
		let prettyContent: string = content;
		try {
			prettyContent = JSON.stringify(JSON.parse(content), null, 2);
		}
		catch {
			// 非 JSON 时保留原样
		}
		parts.push(`**工具返回**：${toolName}\n\n\`\`\`json\n${prettyContent}\n\`\`\``);
		return parts;
	}

	return [];
}

// 将消息列表转换为完整 Markdown 字符串。
function buildMarkdown(messages: unknown[]): string {
	const source: any[] = Array.isArray(messages) ? messages : [];
	const sections: string[] = [];
	for (let i = 0; i < source.length; i += 1) {
		const msgParts: string[] = messageToMarkdownParts(source[i]);
		for (let j = 0; j < msgParts.length; j += 1) {
			if (msgParts[j]) {
				sections.push(msgParts[j]);
			}
		}
	}
	return sections.join('\n\n---\n\n');
}

// 从 agentMessages 提取当前轮次（最后一条 user 消息起到末尾）。
function getCurrentRoundMessages(agentMessages: unknown[]): unknown[] {
	const source: any[] = Array.isArray(agentMessages) ? agentMessages : [];
	let lastUserIdx: number = -1;
	for (let i = source.length - 1; i >= 0; i -= 1) {
		if (source[i] && typeof source[i] === 'object' && source[i].role === 'user') {
			lastUserIdx = i;
			break;
		}
	}
	if (lastUserIdx < 0) {
		return source.slice();
	}
	return source.slice(lastUserIdx);
}

// -----------------------------------------------------------------------
// 公开 API
// -----------------------------------------------------------------------

/**
 * 将指定轮次聊天记录复制为 Markdown 到剪切板。
 * @param agentMessages - 完整的 agent 消息数组。
 * @param startIndex - 本轮次在 agentMessages 中起始的 user 消息索引；传 -1 或超出范围时降级为当前轮次。
 */
export async function copyRound(agentMessages: unknown[], startIndex: number): Promise<void> {
	const source: any[] = Array.isArray(agentMessages) ? agentMessages : [];
	let messages: unknown[];
	if (startIndex >= 0 && startIndex < source.length) {
		let endIndex: number = source.length;
		for (let i: number = startIndex + 1; i < source.length; i += 1) {
			if (source[i] && typeof source[i] === 'object' && (source[i] as any).role === 'user') {
				endIndex = i;
				break;
			}
		}
		messages = source.slice(startIndex, endIndex);
	}
	else {
		messages = getCurrentRoundMessages(source);
	}
	const text: string = buildMarkdown(messages);
	if (!text) {
		return;
	}
	await navigator.clipboard.writeText(text);
}

/**
 * 将当前轮次聊天记录复制为 Markdown 到剪切板。
 * @param agentMessages - 完整的 agent 消息数组。
 */
export async function copyCurrentRound(agentMessages: unknown[]): Promise<void> {
	const messages: unknown[] = getCurrentRoundMessages(agentMessages);
	const text: string = buildMarkdown(messages);
	if (!text) {
		return;
	}
	await navigator.clipboard.writeText(text);
}

/**
 * 将当前对话全部聊天记录复制为 Markdown 到剪切板。
 * @param agentMessages - 完整的 agent 消息数组。
 */
export async function copyAllHistory(agentMessages: unknown[]): Promise<void> {
	const text: string = buildMarkdown(agentMessages);
	if (!text) {
		return;
	}
	await navigator.clipboard.writeText(text);
}
