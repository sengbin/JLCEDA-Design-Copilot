// 文件说明：封装大模型请求配置校验、工具声明筛选与请求体组装逻辑。
// 允许暴露给模型的工具列表。
const MANUAL_EXPOSED_TOOL_NAMES: any = [
	'jlceda_api_index',
	'jlceda_api_search',
	'jlceda_context_get',
	'jlceda_api_invoke',
	'jlceda_schematic_check',
	'todo_list',
	'component_select',
];
/**
 * 判断是否为 DeepSeek 系列模型（按模型名称前缀匹配，不依赖平台标识）。
 * @param modelName - 模型名称。
 * @returns 是否为 DeepSeek 模型。
 */
export function isDeepSeekModel(modelName: unknown): boolean {
	return String(modelName || '').trim().toLowerCase().startsWith('deepseek');
}
// 为工具列表的每个 function 定义注入 strict: true，用于 DeepSeek Function Calling strict 模式。
function applyStrictModeToTools(sourceTools: unknown[]): unknown[] {
	const toolList: any = Array.isArray(sourceTools) ? sourceTools : [];
	return toolList.map((tool: any) => {
		if (!tool || typeof tool !== 'object') {
			return tool;
		}
		if (String(tool.type || '').trim() !== 'function' || !tool.function || typeof tool.function !== 'object') {
			return tool;
		}
		return {
			...tool,
			function: {
				...tool.function,
				strict: true,
			},
		};
	});
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
	maxOutputTokens: number;
}): Record<string, unknown> {
	const manualResponsesTools: any = pickManualExposedTools(params.responsesTools);
	const manualChatTools: any = pickManualExposedTools(params.chatTools);
	// DeepSeek 模型按名称前缀检测，匹配时对 chat 工具列表启用 strict Function Calling 模式。
	const effectiveChatTools: any = isDeepSeekModel(params.modelName || params.selectedModel)
		? applyStrictModeToTools(manualChatTools)
		: manualChatTools;
	if (params.isResponsesEndpoint) {
		return {
			model: params.modelName,
			input: params.responsesInput,
			tools: manualResponsesTools,
			tool_choice: 'auto',
			max_output_tokens: params.maxOutputTokens,
			stream: true,
		};
	}
	return {
		model: params.modelName,
		messages: params.chatMessages,
		tools: effectiveChatTools,
		tool_choice: 'auto',
		temperature: 0.0,
		max_tokens: params.maxOutputTokens,
		stream: true,
	};
}
/**
 * 将 OpenAI 格式工具列表转换为 Anthropic Messages API 格式。
 * @param sourceTools - OpenAI 格式工具列表。
 * @returns Anthropic 格式工具列表。
 */
export function buildAnthropicTools(sourceTools: unknown[]): unknown[] {
	const exposedTools: any = pickManualExposedTools(sourceTools);
	const anthropicTools: unknown[] = [];
	for (let index: any = 0; index < exposedTools.length; index += 1) {
		const toolItem: any = exposedTools[index] && typeof exposedTools[index] === 'object' ? exposedTools[index] : {};
		if (String(toolItem.type || '').trim() !== 'function' || !toolItem.function) {
			continue;
		}
		const functionDef: any = toolItem.function && typeof toolItem.function === 'object' ? toolItem.function : {};
		const toolName: any = String(functionDef.name || '').trim();
		if (!toolName) {
			continue;
		}
		anthropicTools.push({
			name: toolName,
			description: String(functionDef.description || ''),
			input_schema: functionDef.parameters && typeof functionDef.parameters === 'object'
				? functionDef.parameters
				: { type: 'object', properties: {}, additionalProperties: true },
		});
	}
	return anthropicTools;
}
/**
 * 构建 Anthropic Messages API 请求体。
 * @param params - 请求参数。
 * @param params.modelName - 模型名称。
 * @param params.systemText - 系统提示文本。
 * @param params.messages - Anthropic 格式消息列表。
 * @param params.tools - Anthropic 格式工具列表。
 * @param params.maxOutputTokens - 最大输出 Token 数。
 * @returns 请求体对象。
 */
export function buildAnthropicRequestPayload(params: {
	modelName: string;
	systemText: string;
	messages: unknown[];
	tools: unknown[];
	maxOutputTokens: number;
}): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		model: params.modelName,
		max_tokens: params.maxOutputTokens,
		stream: true,
		messages: params.messages,
	};
	if (params.systemText) {
		payload.system = params.systemText;
	}
	if (params.tools.length > 0) {
		payload.tools = params.tools;
		payload.tool_choice = { type: 'auto' };
	}
	return payload;
}
