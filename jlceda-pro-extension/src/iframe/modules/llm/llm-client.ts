// 文件说明：封装大模型请求配置校验、工具声明筛选与请求体组装逻辑。
// 允许暴露给模型的工具列表。
const MANUAL_EXPOSED_TOOL_NAMES: any = [
	'jlceda_list_apis',
	'jlceda_get_api_member',
	'jlceda_call_api',
	'jlceda_search_offline_api_doc',
];
const THINKING_DISABLED_CONFIG: any = Object.freeze({
	type: 'disabled',
});
// 归一化模型名称，便于前缀匹配。
function normalizeModelNameForThinkingSwitch(modelName: unknown): string {
	return String(modelName || '').trim().toLowerCase();
}
// 判断是否使用非标准 enable_thinking 字段（千问、文心）。
function shouldUseEnableThinkingField(modelName: unknown): boolean {
	const normalizedModelName: any = normalizeModelNameForThinkingSwitch(modelName);
	if (!normalizedModelName) {
		return false;
	}
	return normalizedModelName.startsWith('qwen') || normalizedModelName.startsWith('ernie');
}
// 将思考模式开关值归一化为布尔值。
function normalizeThinkingEnabled(value: unknown): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	const normalizedText: any = String(value || '').trim().toLowerCase();
	if (!normalizedText) {
		return true;
	}
	if (normalizedText === '0' || normalizedText === 'false' || normalizedText === 'off') {
		return false;
	}
	return true;
}
// 构建思考模式控制字段。
function buildThinkingControlPayload(selectedModel: unknown, thinkingEnabled: unknown): Record<string, unknown> {
	const enabled: any = normalizeThinkingEnabled(thinkingEnabled);
	if (shouldUseEnableThinkingField(selectedModel)) {
		return {
			enable_thinking: enabled,
		};
	}
	if (enabled) {
		return {};
	}
	return {
		thinking: THINKING_DISABLED_CONFIG,
	};
}
/**
 * 按固定名单筛选可暴露给模型的工具。
 * @param sourceTools - 原始工具列表。
 * @returns 固定名单内的工具列表。
 */
export function pickManualExposedTools(sourceTools: unknown[]): unknown[] {
	const items: any = Array.isArray(sourceTools) ? sourceTools : [];
	const allowedNames: any = new Set(MANUAL_EXPOSED_TOOL_NAMES);
	const selectedTools: unknown[] = [];
	for (let index: any = 0; index < items.length; index += 1) {
		const item: any = items[index] && typeof items[index] === 'object' ? items[index] : {};
		const toolFunction: any = item && item.function && typeof item.function === 'object' ? item.function : {};
		const toolName: any = String(toolFunction.name || '').trim();
		if (!toolName || !allowedNames.has(toolName)) {
			continue;
		}
		selectedTools.push(items[index]);
	}
	return selectedTools;
}
/**
 * 构建 responses 格式工具声明。
 * @param sourceTools - 可用工具列表。
 * @returns responses 工具声明数组。
 */
export function buildResponsesTools(sourceTools: unknown[]): unknown[] {
	const exposedTools: any = Array.isArray(sourceTools) ? sourceTools : [];
	const responseTools: unknown[] = [];
	for (let index: any = 0; index < exposedTools.length; index += 1) {
		const toolItem: any = exposedTools[index] && typeof exposedTools[index] === 'object' ? exposedTools[index] : {};
		if (!toolItem || String(toolItem.type || '').trim() !== 'function') {
			continue;
		}
		const functionItem: any = toolItem.function && typeof toolItem.function === 'object' ? toolItem.function : {};
		const functionName: any = String(functionItem.name || '').trim();
		if (!functionName) {
			continue;
		}
		responseTools.push({
			type: 'function',
			name: functionName,
			description: String(functionItem.description || ''),
			parameters: functionItem.parameters && typeof functionItem.parameters === 'object'
				? functionItem.parameters
				: {
						type: 'object',
						properties: {},
						additionalProperties: true,
					},
		});
	}
	return responseTools;
}
/**
 * 校验模型调用配置。
 * @param config - 模型配置。
 * @param normalizeEndpoint - 地址规范化函数。
 * @returns 规范化后的调用参数。
 */
export function validateModelRequestConfig(config: Record<string, unknown>, normalizeEndpoint: (url: unknown) => string): {
	endpoint: string;
	modelName: string;
	apiKey: string;
} {
	const endpoint: any = normalizeEndpoint(config.apiUrl);
	if (!endpoint) {
		throw new Error('API URL 无效，请先在“设置”中设置。');
	}
	const apiKey: any = String(config.apiKey || '').trim();
	if (!apiKey) {
		throw new Error('API Key 为空，请先在“设置”中设置。');
	}
	const modelName: any = String(config.model || '').trim();
	if (!modelName) {
		throw new Error('模型名称为空，请先在“设置”中配置。');
	}
	return { endpoint, modelName, apiKey };
}
/**
 * 构建大模型请求体。
 * @param params - 请求参数。
 * @param params.isResponsesEndpoint - 是否使用 Responses 端点。
 * @param params.modelName - 模型名称。
 * @param params.responsesInput - Responses 输入内容。
 * @param params.responsesTools - Responses 工具列表。
 * @param params.chatMessages - Chat 消息列表。
 * @param params.chatTools - Chat 工具列表。
 * @param params.selectedModel - 当前选中模型。
 * @param params.thinkingEnabled - 思考模式开关。
 * @param params.maxOutputTokens - 最大输出 Token 数。
 * @returns 请求体对象。
 */
export function buildModelRequestPayload(params: {
	isResponsesEndpoint: boolean;
	modelName: string;
	responsesInput: unknown[];
	responsesTools: unknown[];
	chatMessages: unknown[];
	chatTools: unknown[];
	selectedModel: string;
	thinkingEnabled?: boolean | string;
	maxOutputTokens: number;
}): Record<string, unknown> {
	const manualResponsesTools: any = pickManualExposedTools(params.responsesTools);
	const manualChatTools: any = pickManualExposedTools(params.chatTools);
	const thinkingControlPayload: any = buildThinkingControlPayload(params.modelName || params.selectedModel, params.thinkingEnabled);
	if (params.isResponsesEndpoint) {
		return {
			model: params.modelName,
			input: params.responsesInput,
			tools: manualResponsesTools,
			tool_choice: 'auto',
			...thinkingControlPayload,
			max_output_tokens: params.maxOutputTokens,
			stream: true,
		};
	}
	return {
		model: params.modelName,
		messages: params.chatMessages,
		tools: manualChatTools,
		tool_choice: 'auto',
		...thinkingControlPayload,
		temperature: 0.0,
		max_tokens: params.maxOutputTokens,
		stream: true,
	};
}
