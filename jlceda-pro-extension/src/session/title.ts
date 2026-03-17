// 文件说明：封装会话标题异步生成逻辑（模型请求与标题文本规范化）。
/**
 * 会话标题生成请求参数。
 */
export interface SessionTitleGenerateRequest {
	/** 模型接口地址。 */
	endpoint: string;
	/** 模型 API Key。 */
	apiKey: string;
	/** 模型名称。 */
	modelName: string;
	/** 用户输入文本。 */
	userText: string;
	/** 可选中断信号。 */
	abortSignal?: AbortSignal;
}
const SESSION_TITLE_MAX_LENGTH: any = 18;
const SESSION_TITLE_THINKING_CONFIG: any = Object.freeze({
	type: 'disabled',
});
const SESSION_TITLE_ENABLE_THINKING: any = false;
// 归一化模型名称，便于前缀匹配。
function normalizeModelNameForPrefixMatch(modelName: string): string {
	return String(modelName || '').trim().toLowerCase();
}
// 判断是否使用非标准 enable_thinking 字段（千问、文心）。
function shouldUseEnableThinkingField(modelName: string): boolean {
	const normalizedModelName: any = normalizeModelNameForPrefixMatch(modelName);
	if (!normalizedModelName) {
		return false;
	}
	return normalizedModelName.startsWith('qwen') || normalizedModelName.startsWith('ernie');
}
// 根据模型前缀构建思考控制字段。
function buildThinkingControlByModel(modelName: string): Record<string, unknown> {
	if (shouldUseEnableThinkingField(modelName)) {
		return {
			enable_thinking: SESSION_TITLE_ENABLE_THINKING,
		};
	}
	return {
		thinking: SESSION_TITLE_THINKING_CONFIG,
	};
}
// 构建标题生成用系统指令。
function buildSessionTitleSystemInstructions(): string {
	return [
		'你是一个会话标题生成器。',
		'请根据用户输入生成一个简短、明确、可读的中文标题。',
		'输出要求：',
		'1. 仅输出标题本身，不要任何解释。',
		'2. 不要加引号、序号、前缀。',
		'3. 标题长度控制在 8 到 18 个中文字符之间。',
		'4. 标题要聚焦用户输入的核心意图。',
	].join('\n');
}
// 规范化标题文本。
function normalizeSessionTitleText(rawText: unknown): string {
	const normalizedRaw: any = String(rawText || '').replace(/\r\n/g, '\n').trim();
	if (!normalizedRaw) {
		return '';
	}
	const firstLine: any = normalizedRaw.split('\n')[0].trim();
	if (!firstLine) {
		return '';
	}
	const strippedPrefix: any = firstLine.replace(/^(?:标题|会话标题|title)\s*[:：-]\s*/i, '').trim();
	const strippedQuote: any = strippedPrefix.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
	const compacted: any = strippedQuote.replace(/\s+/g, ' ').trim();
	if (!compacted) {
		return '';
	}
	if (compacted.length <= SESSION_TITLE_MAX_LENGTH) {
		return compacted;
	}
	return compacted.slice(0, SESSION_TITLE_MAX_LENGTH).trim();
}
// 从 responses 非流式返回中提取文本。
function extractResponsesText(resultObject: Record<string, unknown>): string {
	const outputText: any = String(resultObject && resultObject.output_text ? resultObject.output_text : '').trim();
	if (outputText) {
		return outputText;
	}
	const outputList: any = Array.isArray(resultObject && resultObject.output) ? resultObject.output : [];
	const textParts: string[] = [];
	for (let index: any = 0; index < outputList.length; index += 1) {
		const outputItem: any = outputList[index] && typeof outputList[index] === 'object' ? outputList[index] : {};
		const contentList: any = Array.isArray(outputItem && outputItem.content) ? outputItem.content : [];
		for (let itemIndex: any = 0; itemIndex < contentList.length; itemIndex += 1) {
			const contentItem: any = contentList[itemIndex] && typeof contentList[itemIndex] === 'object' ? contentList[itemIndex] : {};
			if (String(contentItem.type || '').trim() !== 'output_text') {
				continue;
			}
			const textValue: any = String(contentItem.text || '').trim();
			if (textValue) {
				textParts.push(textValue);
			}
		}
	}
	return textParts.join('\n').trim();
}
// 从 chat completions 非流式返回中提取文本。
function extractChatCompletionsText(resultObject: Record<string, unknown>): string {
	const choices: any = Array.isArray(resultObject && resultObject.choices) ? resultObject.choices : [];
	if (choices.length === 0) {
		return '';
	}
	const firstChoice: any = choices[0] && typeof choices[0] === 'object' ? choices[0] : {};
	const messageObject: any = firstChoice && firstChoice.message && typeof firstChoice.message === 'object' ? firstChoice.message : {};
	const messageContent: any = messageObject.content;
	if (typeof messageContent === 'string') {
		return String(messageContent || '').trim();
	}
	if (!Array.isArray(messageContent)) {
		return '';
	}
	const textParts: string[] = [];
	for (let index: any = 0; index < messageContent.length; index += 1) {
		const part: any = messageContent[index] && typeof messageContent[index] === 'object' ? messageContent[index] : {};
		const partText: any = String(part.text || '').trim();
		if (partText) {
			textParts.push(partText);
		}
	}
	return textParts.join('\n').trim();
}
// 构建 responses 接口请求体。
function buildResponsesTitlePayload(modelName: string, userText: string): Record<string, unknown> {
	const thinkingControlPayload: any = buildThinkingControlByModel(modelName);
	return {
		model: modelName,
		input: [
			{
				role: 'system',
				content: [
					{
						type: 'input_text',
						text: buildSessionTitleSystemInstructions(),
					},
				],
			},
			{
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: userText,
					},
				],
			},
		],
		...thinkingControlPayload,
		temperature: 0,
		max_output_tokens: 64,
		stream: false,
	};
}
// 构建 chat completions 接口请求体。
function buildChatCompletionsTitlePayload(modelName: string, userText: string): Record<string, unknown> {
	const thinkingControlPayload: any = buildThinkingControlByModel(modelName);
	return {
		model: modelName,
		messages: [
			{
				role: 'system',
				content: buildSessionTitleSystemInstructions(),
			},
			{
				role: 'user',
				content: userText,
			},
		],
		...thinkingControlPayload,
		temperature: 0,
		max_tokens: 64,
		stream: false,
	};
}
/**
 * 异步调用模型生成会话标题。
 * @param request - 标题生成请求参数。
 * @returns 规范化后的标题；若无法生成则返回空字符串。
 */
export async function generateSessionTitleByModel(request: SessionTitleGenerateRequest): Promise<string> {
	const endpoint: any = String(request && request.endpoint ? request.endpoint : '').trim();
	const apiKey: any = String(request && request.apiKey ? request.apiKey : '').trim();
	const modelName: any = String(request && request.modelName ? request.modelName : '').trim();
	const userText: any = String(request && request.userText ? request.userText : '').trim();
	if (!endpoint || !apiKey || !modelName || !userText) {
		return '';
	}
	const isResponsesEndpoint: any = endpoint.endsWith('/responses');
	const payload: any = isResponsesEndpoint
		? buildResponsesTitlePayload(modelName, userText)
		: buildChatCompletionsTitlePayload(modelName, userText);
	const response: any = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`,
		},
		signal: request && request.abortSignal ? request.abortSignal : undefined,
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		return '';
	}
	let dataObject: Record<string, unknown> | null = null;
	try {
		dataObject = await response.json();
	}
	catch {
		dataObject = null;
	}
	if (!dataObject) {
		return '';
	}
	const rawTitle: any = isResponsesEndpoint
		? extractResponsesText(dataObject)
		: extractChatCompletionsText(dataObject);
	return normalizeSessionTitleText(rawTitle);
}
