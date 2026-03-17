// 文件说明：提供调试信息提取与工具调用展示相关辅助函数。

// 总开关：开启时显示可展开的详情，关闭时仅显示标题。
export const DEBUG_TOOL_EXEC_DETAILS_EXPANDABLE: any = true;

// 折叠标题开关：控制标题栏中各字段是否显示。
export const DEBUG_TOOL_EXEC_SHOW_TOOL_NAME: any = true; // 标题中显示工具名
export const DEBUG_TOOL_EXEC_SHOW_CALLED_API: any = true; // 标题中显示调用 API 路径

// 内容区开关：控制折叠展开后各区块是否显示。
const DEBUG_SHOW_SENT_DATA: any = true; // 发送数据（AI 发出的工具调用参数）
const DEBUG_SHOW_RECEIVED_DATA: any = true; // 接收数据（EDA API 返回结果）
const DEBUG_SHOW_CALL_STATUS: any = true; // 调用状态
const DEBUG_SHOW_RESULT_STATUS: any = true; // 返回结果

// 内容区节标记（供解析方识别各数据区块用）。
export const TOOL_EXEC_SENT_DATA_BEGIN = '<<<SENT_DATA_BEGIN>>>';
export const TOOL_EXEC_SENT_DATA_END = '<<<SENT_DATA_END>>>';
export const TOOL_EXEC_RECEIVED_DATA_BEGIN = '<<<RECEIVED_DATA_BEGIN>>>';
export const TOOL_EXEC_RECEIVED_DATA_END = '<<<RECEIVED_DATA_END>>>';

// 规范化 API 路径文本。
function normalizeApiPath(apiPath: unknown): string {
	return String(apiPath || '').trim();
}
// 解析工具调用参数对象。
function parseToolArgumentsObject(rawArguments?: any) {
	if (rawArguments === undefined || rawArguments === null) {
		return null;
	}
	if (typeof rawArguments === 'object') {
		return rawArguments;
	}
	if (typeof rawArguments !== 'string') {
		return null;
	}
	const sourceText: any = String(rawArguments || '').trim();
	if (!sourceText) {
		return null;
	}
	try {
		const parsed: any = JSON.parse(sourceText);
		if (parsed && typeof parsed === 'object') {
			return parsed;
		}
	}
	catch {
		return null;
	}
	return null;
}
// 从原始参数文本中提取 API 全路径。
function extractApiPathFromRawArguments(rawArguments?: any) {
	if (typeof rawArguments !== 'string') {
		return '';
	}
	const sourceText: any = String(rawArguments || '').trim();
	if (!sourceText) {
		return '';
	}
	const quotedFullNameMatch: any = sourceText.match(/["']apiFullName["']\s*:\s*["']([^"']+)["']/i);
	if (quotedFullNameMatch && quotedFullNameMatch[1]) {
		return normalizeApiPath(quotedFullNameMatch[1]);
	}
	const quotedMatch: any = sourceText.match(/["']apiPath["']\s*:\s*["']([^"']+)["']/i);
	if (quotedMatch && quotedMatch[1]) {
		return normalizeApiPath(quotedMatch[1]);
	}
	const plainFullNameMatch: any = sourceText.match(/\bapiFullName\s*:\s*([\w.$]+)/i);
	if (plainFullNameMatch && plainFullNameMatch[1]) {
		return normalizeApiPath(plainFullNameMatch[1]);
	}
	const plainMatch: any = sourceText.match(/\bapiPath\s*:\s*([\w.$]+)/i);
	if (plainMatch && plainMatch[1]) {
		return normalizeApiPath(plainMatch[1]);
	}
	return '';
}
// 格式化错误值为可读文本。
function formatDebugErrorValue(errorValue?: any) {
	if (errorValue === undefined || errorValue === null) {
		return '无';
	}
	if (typeof errorValue === 'string' || typeof errorValue === 'number' || typeof errorValue === 'boolean') {
		const text: any = String(errorValue || '').trim();
		return text || '无';
	}
	if (typeof errorValue === 'object') {
		try {
			return JSON.stringify(errorValue);
		}
		catch {
			return '[unserializable-error-object]';
		}
	}
	return String(errorValue || '无');
}
// 获取工具调用名称。
function getToolCallName(toolCall?: any) {
	const callObject: any = toolCall && typeof toolCall === 'object' ? toolCall : {};
	const functionObject: any = callObject.function && typeof callObject.function === 'object'
		? callObject.function
		: {};
	return String(functionObject.name || '').trim();
}
// 获取工具调用参数文本。
function getToolCallArgumentsText(toolCall?: any) {
	const callObject: any = toolCall && typeof toolCall === 'object' ? toolCall : {};
	const functionObject: any = callObject.function && typeof callObject.function === 'object'
		? callObject.function
		: {};
	const argumentsValue: any = functionObject.arguments;
	if (argumentsValue === undefined || argumentsValue === null) {
		return '';
	}
	if (typeof argumentsValue === 'string') {
		return String(argumentsValue || '').trim();
	}
	if (typeof argumentsValue === 'object') {
		try {
			return JSON.stringify(argumentsValue);
		}
		catch {
			return '[unserializable-tool-arguments]';
		}
	}
	return String(argumentsValue || '').trim();
}
/**
 * 构建工具折叠展示文本（固定格式：发送数据 / 接收数据 / 调用状态 / 返回结果）。
 * @param toolCall - 工具调用对象。
 * @param toolResult - 工具返回对象。
 * @param running - 是否执行中。
 * @returns 折叠展示文本。
 */
export function formatToolExecDisplayText(toolCall?: any, toolResult?: any, running?: any) {
	const toolName: any = getToolCallName(toolCall);
	const rawArgumentsText: any = getToolCallArgumentsText(toolCall);
	const resultObject: any = toolResult && typeof toolResult === 'object' ? toolResult : {};
	// 提取 API 路径。
	const calledApiPaths: any = extractToolCalledApiPaths(toolCall, toolResult);
	const calledApiText: any = calledApiPaths.length > 0
		? calledApiPaths.join('，')
		: '无';
	// 计算调用状态与返回结果。
	const hasOkFlag: any = toolResult && typeof toolResult === 'object' && Object.prototype.hasOwnProperty.call(toolResult, 'ok');
	const hasBooleanBusinessResult: any = toolResult && typeof toolResult === 'object' && typeof toolResult.result === 'boolean';
	const isBusinessResultPassed: any = hasBooleanBusinessResult ? Boolean(toolResult.result) : true;
	const rawErrorText: any = formatDebugErrorValue(resultObject.error);
	// 错误文本为"无"表示没有真实错误。
	const hasRealError: any = rawErrorText !== '无';
	const isTimeout: any = !running && hasRealError && rawErrorText.includes('超时');
	const callStatus: any = running ? '执行中' : (isTimeout ? '超时' : '已完成');
	const isSuccess: any = hasOkFlag
		? (Boolean(toolResult && toolResult.ok) && isBusinessResultPassed)
		: !hasRealError;
	const resultStatus: any = running ? '等待中' : (isSuccess ? '成功' : '失败');
	// 组装输出文本，标题行始终输出以供 buildFoldTitle 解析。
	const lines: string[] = [];
	lines.push(`工具名：${toolName || '未命名工具'}`);
	lines.push(`调用API：${calledApiText}`);
	// 发送数据区块。
	if (DEBUG_SHOW_SENT_DATA && rawArgumentsText) {
		lines.push(TOOL_EXEC_SENT_DATA_BEGIN);
		lines.push(rawArgumentsText);
		lines.push(TOOL_EXEC_SENT_DATA_END);
	}
	// 接收数据区块（仅在有结果时输出）。
	if (DEBUG_SHOW_RECEIVED_DATA && !running && toolResult !== undefined && toolResult !== null) {
		let receivedJson: any = '';
		try {
			receivedJson = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
		}
		catch {
			receivedJson = '[unserializable-result]';
		}
		if (receivedJson) {
			lines.push(TOOL_EXEC_RECEIVED_DATA_BEGIN);
			lines.push(receivedJson);
			lines.push(TOOL_EXEC_RECEIVED_DATA_END);
		}
	}
	// 调用状态行。
	if (DEBUG_SHOW_CALL_STATUS) {
		lines.push(`调用状态：${callStatus}`);
	}
	// 返回结果行。
	if (DEBUG_SHOW_RESULT_STATUS) {
		lines.push(`返回结果：${resultStatus}`);
	}
	return lines.join('\n');
}
/**
 * 提取对象中的 API 路径字段并追加到输出列表。
 * @param value - 待检测对象。
 * @param outputList - 输出路径列表。
 */
function appendDebugApiPaths(value: unknown, outputList: string[]): void {
	const sourceObject: any = value && typeof value === 'object' ? value : null;
	if (!sourceObject || !Array.isArray(outputList)) {
		return;
	}
	if (Object.prototype.hasOwnProperty.call(sourceObject, 'apiPath')) {
		const apiPathText: any = normalizeApiPath(sourceObject.apiPath);
		if (apiPathText) {
			outputList.push(apiPathText);
		}
	}
	if (Object.prototype.hasOwnProperty.call(sourceObject, 'apiFullName')) {
		const apiFullNameText: any = normalizeApiPath(sourceObject.apiFullName);
		if (apiFullNameText) {
			outputList.push(apiFullNameText);
		}
	}
	if (Object.prototype.hasOwnProperty.call(sourceObject, 'resolvedApiPath')) {
		const resolvedApiPathText: any = normalizeApiPath(sourceObject.resolvedApiPath);
		if (resolvedApiPathText) {
			outputList.push(resolvedApiPathText);
		}
	}
}
/**
 * 递归收集对象中的 API 路径。
 * @param value - 待遍历值。
 * @param outputList - 输出路径列表。
 * @param visitedObjects - 已访问对象列表。
 * @param depth - 当前深度。
 */
function collectApiPathsFromValue(value?: any, outputList?: any, visitedObjects?: any, depth?: any) {
	const currentDepth: any = typeof depth === 'number' ? depth : 0;
	if (currentDepth > 8) {
		return;
	}
	if (value === undefined || value === null) {
		return;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'function') {
		return;
	}
	if (Array.isArray(value)) {
		for (let index: any = 0; index < value.length; index += 1) {
			collectApiPathsFromValue(value[index], outputList, visitedObjects, currentDepth + 1);
		}
		return;
	}
	if (typeof value !== 'object') {
		return;
	}
	if (visitedObjects.includes(value)) {
		return;
	}
	visitedObjects.push(value);
	appendDebugApiPaths(value, outputList);
	const keys: any = Object.keys(value);
	for (let index: any = 0; index < keys.length; index += 1) {
		const key: any = keys[index];
		collectApiPathsFromValue(value[key], outputList, visitedObjects, currentDepth + 1);
	}
}
/**
 * 提取工具调用涉及的 API 路径。
 * @param toolCall - 工具调用对象。
 * @param toolResult - 工具返回对象。
 * @returns 去重后的 API 路径列表。
 */
function extractToolCalledApiPaths(toolCall?: any, toolResult?: any) {
	const outputList: any = [];
	const visitedObjects: any = [];
	const callObject: any = toolCall && typeof toolCall === 'object' ? toolCall : {};
	const toolArguments: any = callObject && callObject.function
		? callObject.function.arguments
		: null;
	const parsedArguments: any = parseToolArgumentsObject(toolArguments);
	if (parsedArguments) {
		collectApiPathsFromValue(parsedArguments, outputList, visitedObjects, 0);
	}
	else {
		const rawApiPath: any = extractApiPathFromRawArguments(typeof toolArguments === 'string' ? toolArguments : '');
		if (rawApiPath) {
			outputList.push(rawApiPath);
		}
	}
	if (toolResult && typeof toolResult === 'object') {
		collectApiPathsFromValue(toolResult, outputList, visitedObjects, 0);
	}
	const uniqueList: any = [];
	for (let index: any = 0; index < outputList.length; index += 1) {
		const item: any = String(outputList[index] || '').trim();
		if (!item) {
			continue;
		}
		if (uniqueList.includes(item)) {
			continue;
		}
		uniqueList.push(item);
	}
	return uniqueList;
}
