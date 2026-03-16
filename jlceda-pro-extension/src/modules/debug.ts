// 文件说明：提供调试信息提取与 API 路径收集相关辅助函数。
// 工具执行调试开关：开启时显示可展开的详情，关闭时仅显示标题。
export const DEBUG_TOOL_EXEC_DETAILS_EXPANDABLE: any = true;
// 工具折叠展示：总览行开关，每行控制折叠展开视图是否展示对应数据。
const DEBUG_TOOL_EXEC_SHOW_TOOL_NAME: any = true; // 展示工具名
const DEBUG_TOOL_EXEC_SHOW_CALL_STATUS: any = true; // 展示调用状态（执行中/已完成/超时）
const DEBUG_TOOL_EXEC_SHOW_RESULT_STATUS: any = true; // 展示返回结果（成功/失败/等待中）
const DEBUG_TOOL_EXEC_SHOW_CALLED_API: any = true; // 展示调用 API 路径列表
const DEBUG_TOOL_EXEC_SHOW_REPAIR_STATUS: any = false; // 展示参数修复状态输出
const DEBUG_TOOL_EXEC_SHOW_REPAIR_RECEIVED_ARGUMENTS: any = false; // 修复成功时展示收到参数
const DEBUG_TOOL_EXEC_SHOW_SUCCESS_RECEIVED_ARGUMENTS: any = true; // API 调用成功时展示收到参数
const DEBUG_TOOL_EXEC_SHOW_REPAIR_FAILED_ARGUMENTS: any = true; // 修复失败时展示错误参数快照
const DEBUG_TOOL_EXEC_SHOW_ERROR_INFO: any = true; // 展示整体错误信息摘要
// 工具错误详情：字段开关，控制每种错误子信息是否加入折叠详情内容。
const DEBUG_TOOL_ERROR_SHOW_BASE_ERROR: any = true; // 基础 error 文本
const DEBUG_TOOL_ERROR_SHOW_STAGE: any = false; // 失败阶段说明
const DEBUG_TOOL_ERROR_SHOW_EXPECTED_FORMAT: any = false; // 期望参数格式示例
const DEBUG_TOOL_ERROR_SHOW_RECEIVED_ARGUMENTS: any = false; // 实际收到的参数片段
const DEBUG_TOOL_ERROR_SHOW_REPAIR_STATUS: any = false; // 参数修复状态
const DEBUG_TOOL_ERROR_SHOW_REPAIR_FAILED_ARGUMENTS: any = true; // 修复失败时的原始参数展示
const DEBUG_TOOL_ERROR_SHOW_REPAIR_DIAGNOSIS: any = false; // 修复诊断信息
const DEBUG_TOOL_ERROR_SHOW_TARGET_API: any = true; // 目标 API 路径
const DEBUG_TOOL_ERROR_SHOW_CONCLUSION: any = true; // 调用结论信息
// 追加展示片段。
function appendDisplayPart(parts?: any, enabled?: any, text?: any) {
	if (!Array.isArray(parts)) {
		return;
	}
	if (!enabled) {
		return;
	}
	const normalizedText: any = String(text || '').trim();
	if (!normalizedText) {
		return;
	}
	parts.push(normalizedText);
}
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
 * 构建工具错误信息展示文本。
 * @param toolCall - 工具调用对象。
 * @param toolResult - 工具返回对象。
 * @param running - 是否执行中。
 * @returns 展示用错误文本。
 */
export function formatToolErrorDisplayText(toolCall?: any, toolResult?: any, running?: any) {
	if (running) {
		return '无';
	}
	const resultObject: any = toolResult && typeof toolResult === 'object' ? toolResult : {};
	const baseErrorText: any = formatDebugErrorValue(resultObject.error);
	const outputParts: any = [];
	const toolName: any = getToolCallName(toolCall);
	const errorCode: any = String(resultObject.errorCode || '').trim();
	const errorStage: any = String(resultObject.errorStage || '').trim();
	const hasBaseError: any = !!(baseErrorText && baseErrorText !== '无');
	appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_BASE_ERROR && hasBaseError, baseErrorText);
	appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_STAGE && !!errorStage, `失败阶段：${errorStage}`);
	if (toolName === 'jlceda_api_invoke' && errorCode === 'INVALID_TOOL_ARGUMENTS_JSON') {
		const expectedFormat: any = String(resultObject.expectedArgumentsFormat || '{"apiFullName":"eda.sch_Drc.check","args":{"positionalArgs":[false,false,true]}}').trim();
		const rawArgumentsPreview: any = String(resultObject.rawArgumentsPreview || getToolCallArgumentsText(toolCall) || '').trim();
		const candidateApiPath: any = normalizeApiPath(resultObject.apiFullName || resultObject.apiPath || extractApiPathFromRawArguments(rawArgumentsPreview));
		const argumentsRepairStatus: any = String(resultObject.argumentsRepairStatus || '').trim();
		const argumentsRepairOriginalPreview: any = String(resultObject.argumentsRepairOriginalPreview || '').trim();
		const argumentsRepairError: any = String(resultObject.argumentsRepairError || '').trim();
		appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_EXPECTED_FORMAT, `参数格式：${expectedFormat}`);
		appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_RECEIVED_ARGUMENTS, `收到参数：${rawArgumentsPreview || '无'}`);
		if (argumentsRepairStatus === 'fixed') {
			appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_REPAIR_STATUS, '参数修复：接收到错误参数格式，已修复。');
		}
		if (argumentsRepairStatus === 'failed') {
			appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_REPAIR_STATUS, '参数修复：接收到错误参数格式，修复失败。');
			if (argumentsRepairOriginalPreview) {
				appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_REPAIR_FAILED_ARGUMENTS, `错误参数：${argumentsRepairOriginalPreview}`);
			}
			if (argumentsRepairError) {
				appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_REPAIR_DIAGNOSIS, `修复诊断：${argumentsRepairError}`);
			}
		}
		if (candidateApiPath) {
			appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_TARGET_API, `目标API：${candidateApiPath}`);
		}
		else {
			appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_TARGET_API, '目标API：未识别');
		}
		appendDisplayPart(outputParts, DEBUG_TOOL_ERROR_SHOW_CONCLUSION, '调用结论：未执行 API 调用（参数解析失败）。');
	}
	if (outputParts.length <= 0) {
		return '无';
	}
	return outputParts.join('\n');
}
/**
 * 构建工具折叠展示文本。
 * @param toolCall - 工具调用对象。
 * @param toolResult - 工具返回对象。
 * @param running - 是否执行中。
 * @returns 折叠展示文本。
 */
export function formatToolExecDisplayText(toolCall?: any, toolResult?: any, running?: any) {
	const callObject: any = toolCall && typeof toolCall === 'object' ? toolCall : {};
	const toolName: any = callObject && callObject.function
		? String(callObject.function.name || '').trim()
		: '';
	const resultObject: any = toolResult && typeof toolResult === 'object' ? toolResult : {};
	const argumentsRepairStatus: any = String(resultObject.argumentsRepairStatus || '').trim();
	const argumentsRepairOriginalPreview: any = String(resultObject.argumentsRepairOriginalPreview || '').trim();
	const rawArgumentsText: any = getToolCallArgumentsText(toolCall);
	const hasOkFlag: any = toolResult && typeof toolResult === 'object' && Object.prototype.hasOwnProperty.call(toolResult, 'ok');
	const hasBooleanBusinessResult: any = toolResult && typeof toolResult === 'object' && typeof toolResult.result === 'boolean';
	const isBusinessResultPassed: any = hasBooleanBusinessResult ? Boolean(toolResult.result) : true;
	const businessFailReason: any = hasOkFlag && Boolean(toolResult && toolResult.ok) && !isBusinessResultPassed
		? '调用成功但返回 false（业务检查未通过）。'
		: '';
	const errorText: any = formatToolErrorDisplayText(toolCall, toolResult, running);
	const isTimeout: any = !running && errorText.includes('超时');
	const statusText: any = running ? '执行中' : (isTimeout ? '超时' : '已完成');
	const isSuccess: any = hasOkFlag
		? (Boolean(toolResult && toolResult.ok) && isBusinessResultPassed)
		: !(errorText && errorText !== '无');
	const resultText: any = running
		? '等待中'
		: (isSuccess ? '成功' : '失败');
	const calledApiPaths: any = extractToolCalledApiPaths(toolCall, toolResult);
	const calledApiText: any = calledApiPaths.length > 0
		? calledApiPaths.join('，')
		: (!running && toolName === 'jlceda_api_invoke' && String(resultObject.errorStage || '').trim() === 'parse-arguments'
				? '未执行（参数解析失败）'
				: '无');
	const outputLines: any = [];
	appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_TOOL_NAME, `工具名：${toolName || '未命名工具'}`);
	appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_CALL_STATUS, `调用状态：${statusText}`);
	appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_RESULT_STATUS, `返回结果：${resultText}`);
	appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_CALLED_API, `调用 API：${calledApiText}`);
	if (!running && toolName === 'jlceda_api_invoke' && isSuccess && argumentsRepairStatus !== 'fixed') {
		appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_SUCCESS_RECEIVED_ARGUMENTS, `收到参数：${rawArgumentsText || '无'}`);
	}
	if (!running && argumentsRepairStatus === 'fixed') {
		appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_REPAIR_STATUS, '参数修复：接收到错误参数格式，已修复。');
		appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_REPAIR_RECEIVED_ARGUMENTS, `收到参数：${argumentsRepairOriginalPreview || '无'}`);
	}
	if (!running && argumentsRepairStatus === 'failed') {
		appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_REPAIR_STATUS, '参数修复：接收到错误参数格式，修复失败。');
		if (argumentsRepairOriginalPreview) {
			appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_REPAIR_FAILED_ARGUMENTS, `错误参数：${argumentsRepairOriginalPreview}`);
		}
	}
	if (!running && !isSuccess) {
		appendDisplayPart(outputLines, DEBUG_TOOL_EXEC_SHOW_ERROR_INFO, `错误信息：${businessFailReason || errorText}`);
	}
	if (outputLines.length <= 0) {
		return '无';
	}
	return outputLines.join('\n');
}
/**
 * 提取对象中的 API 路径字段并追加到输出列表。
 * @param value - 待检测对象。
 * @param outputList - 输出路径列表。
 */
export function appendDebugApiPaths(value: unknown, outputList: string[]): void {
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
export function collectApiPathsFromValue(value?: any, outputList?: any, visitedObjects?: any, depth?: any) {
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
export function extractToolCalledApiPaths(toolCall?: any, toolResult?: any) {
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
