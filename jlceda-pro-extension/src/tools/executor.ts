// 文件说明：工具运行时调度层 —— 管理序列化工具、参数解析修复、超时执行与工具运行时创建。
import { makeJsonSafe } from '../utils';
import { createApiInvokeHandler } from './api-invoke';
import { createApiSearchHandler } from './api-search';
import { createContextGetHandler } from './context-get';
import { autoRepairToolArgumentsJson } from './repair';

// 当前会话中有效的 blob URL 集合，页面关闭后自动失效，不会持久化。
export const activeBlobUrls: Set<string> = new Set();

// 判断输入是否为普通对象。
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 判断 value 是否为 Blob 或 File（使用 duck typing，避免跨 frame 的 instanceof 失效）。
function isBlobLike(value: unknown): value is Blob {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return typeof obj.size === 'number'
		&& typeof obj.type === 'string'
		&& typeof obj.text === 'function'
		&& typeof obj.slice === 'function';
}

// 将 Blob/File 序列化为纯对象（包含文本内容与下载链接）。
async function serializeBlobLike(value: Blob): Promise<Record<string, unknown>> {
	const blobLike = value as Blob & { name?: unknown; lastModified?: unknown };
	const output: Record<string, unknown> = {
		kind: 'blob',
		size: blobLike.size,
		type: blobLike.type,
		text: await blobLike.text(),
	};
	if (typeof blobLike.name === 'string' && blobLike.name.length > 0) {
		output.name = blobLike.name;
	}
	if (typeof blobLike.lastModified === 'number' && Number.isFinite(blobLike.lastModified)) {
		output.lastModified = blobLike.lastModified;
	}
	// 生成 Object URL，供用户直接点击下载文件，并注册到当前会话有效集合。
	try {
		const objectUrl = URL.createObjectURL(value);
		output.downloadUrl = objectUrl;
		activeBlobUrls.add(objectUrl);
	}
	catch {
		// 环境不支持时跳过，不影响主流程。
	}
	return output;
}

// 转换任意值为可序列化结构。
export async function toSerializableAsync(value: unknown, depth = 0, seen?: WeakSet<object>): Promise<unknown> {
	if (value === null || value === undefined) {
		return value;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'bigint') {
		return value.toString();
	}
	if (typeof value === 'function') {
		const functionName: any = (value as { name?: unknown }).name;
		return `[Function ${typeof functionName === 'string' && functionName ? functionName : 'anonymous'}]`;
	}
	if (depth >= 4) {
		return '[MaxDepthExceeded]';
	}
	if (isBlobLike(value)) {
		return await serializeBlobLike(value);
	}
	const tracked: WeakSet<object> = seen || new WeakSet<object>();
	if (typeof value === 'object') {
		if (tracked.has(value as object)) {
			return '[Circular]';
		}
		tracked.add(value as object);
	}
	if (Array.isArray(value)) {
		const output: unknown[] = [];
		for (let index = 0; index < Math.min(value.length, 120); index += 1) {
			output.push(await toSerializableAsync(value[index], depth + 1, tracked));
		}
		return output;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (isPlainObjectRecord(value)) {
		const output: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) {
			output[key] = await toSerializableAsync(child, depth + 1, tracked);
		}
		return output;
	}
	return makeJsonSafe(value, 4);
}

// 安全执行异步函数。
export async function safeCall(executor: () => unknown | Promise<unknown>): Promise<unknown> {
	try {
		return await Promise.resolve(executor());
	}
	catch {
		return undefined;
	}
}

// 转换异常为安全文本。
function toSafeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}

// 序列化运行时原始错误信息。
function serializeRuntimeRawError(errorValue?: unknown): unknown {
	if (errorValue instanceof Error) {
		return makeJsonSafe({
			name: errorValue.name,
			message: errorValue.message,
			stack: errorValue.stack,
		}, 8);
	}
	return makeJsonSafe(errorValue, 8);
}

// 规范化原始工具参数文本。
function normalizeRawToolArgumentsText(rawArguments?: any): string {
	if (rawArguments === undefined || rawArguments === null) {
		return '';
	}
	if (typeof rawArguments === 'string') {
		return String(rawArguments || '').trim();
	}
	if (typeof rawArguments === 'object') {
		try {
			return JSON.stringify(rawArguments);
		}
		catch {
			return '[unserializable-object]';
		}
	}
	return String(rawArguments || '').trim();
}

// 根据工具名返回参数格式提示。
function buildExpectedArgumentsFormat(toolName: string): string {
	if (toolName === 'jlceda_api_search') {
		return '{"query":"bom","scope":"callable","owner":"sch","limit":10}';
	}
	if (toolName === 'jlceda_context_get') {
		return '{"scope":"sch"}';
	}
	if (toolName === 'jlceda_api_invoke') {
		return '{"apiFullName":"eda.sch_Drc.check","args":{"positionalArgs":[false,false,true]}}';
	}
	return '{"参数1":"值1","参数2":"值2"}';
}

// 合并修复规则列表并去重。
function mergeRepairRules(currentRules?: any[], nextRules?: any[]): string[] {
	const ruleSet: Set<string> = new Set();
	const currentList: any[] = Array.isArray(currentRules) ? currentRules : [];
	const nextList: any[] = Array.isArray(nextRules) ? nextRules : [];
	for (const rule of currentList) {
		const text: any = String(rule || '').trim();
		if (text) {
			ruleSet.add(text);
		}
	}
	for (const rule of nextList) {
		const text: any = String(rule || '').trim();
		if (text) {
			ruleSet.add(text);
		}
	}
	return Array.from(ruleSet);
}

// 预览文本（限制长度，避免调试输出过长）。
function toRepairPreviewText(value: unknown, maxLength = 500): string {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value === 'string') {
		return String(value || '').slice(0, maxLength);
	}
	try {
		return JSON.stringify(value).slice(0, maxLength);
	}
	catch {
		return String(value).slice(0, maxLength);
	}
}

// 将常见旧参数格式修复为当前三工具所需结构。
function normalizeParsedToolArguments(toolName: string, sourceArgs: unknown): {
	changed: boolean;
	args: unknown;
	appliedRules: string[];
	error: string;
} {
	let currentArgs: unknown = sourceArgs;
	let changed = false;
	const appliedRules: string[] = [];

	if (Array.isArray(currentArgs) && currentArgs.length === 1 && isPlainObjectRecord(currentArgs[0])) {
		currentArgs = currentArgs[0];
		changed = true;
		appliedRules.push('unwrapSingleElementArrayPayload');
	}

	if (toolName === 'jlceda_api_search' && isPlainObjectRecord(currentArgs)) {
		const normalized: Record<string, unknown> = { ...currentArgs };
		if (!String(normalized.query || '').trim()) {
			const keywordText: any = String(normalized.keyword || '').trim();
			if (keywordText) {
				normalized.query = keywordText;
				changed = true;
				appliedRules.push('mapKeywordToQuery');
			}
		}
		if ((normalized.limit === undefined || normalized.limit === null) && normalized.maxResults !== undefined) {
			normalized.limit = normalized.maxResults;
			changed = true;
			appliedRules.push('mapMaxResultsToLimit');
		}
		return { changed, args: normalized, appliedRules, error: '' };
	}

	if (toolName !== 'jlceda_api_invoke') {
		return { changed, args: currentArgs, appliedRules, error: '' };
	}

	if (!isPlainObjectRecord(currentArgs)) {
		return { changed, args: currentArgs, appliedRules, error: '' };
	}

	const normalized: Record<string, unknown> = { ...currentArgs };
	if (!String(normalized.apiFullName || '').trim()) {
		const apiPathText: any = String(normalized.apiPath || '').trim();
		if (apiPathText) {
			normalized.apiFullName = apiPathText;
			changed = true;
			appliedRules.push('mapApiPathToApiFullName');
		}
	}

	if (normalized.args === undefined) {
		const collectedArgs: Record<string, unknown> = {};
		if (Array.isArray(normalized.positionalArgs)) {
			collectedArgs.positionalArgs = normalized.positionalArgs;
		}
		if (Array.isArray(normalized.parameterOrder)) {
			collectedArgs.parameterOrder = normalized.parameterOrder;
		}
		if (isPlainObjectRecord(normalized.namedArgs)) {
			collectedArgs.namedArgs = normalized.namedArgs;
		}
		if (Object.keys(collectedArgs).length > 0) {
			normalized.args = collectedArgs;
			changed = true;
			appliedRules.push('collectTopLevelInvokeArgsFields');
		}
	}

	if (Array.isArray(normalized.args)) {
		normalized.args = { positionalArgs: normalized.args };
		changed = true;
		appliedRules.push('wrapArgsArrayAsPositionalArgs');
	}

	if (typeof normalized.args === 'string') {
		const argsText: any = String(normalized.args || '').trim();
		if (argsText) {
			let parsedArgsText: unknown = null;
			let parseSuccess = false;
			try {
				parsedArgsText = JSON.parse(argsText);
				parseSuccess = true;
			}
			catch {
				const argsRepairResult: any = autoRepairToolArgumentsJson(argsText);
				if (argsRepairResult && argsRepairResult.ok) {
					parsedArgsText = argsRepairResult.parsed;
					parseSuccess = true;
					changed = true;
					appliedRules.push('repairArgsStringJson');
					appliedRules.push(...(Array.isArray(argsRepairResult.appliedRules)
						? argsRepairResult.appliedRules.map((rule: any) => `args.${String(rule || '').trim()}`)
						: []));
				}
			}
			if (!parseSuccess) {
				return { changed, args: normalized, appliedRules, error: 'jlceda_api_invoke 的 args 字段不是有效 JSON，且自动修复失败。' };
			}
			if (Array.isArray(parsedArgsText)) {
				normalized.args = { positionalArgs: parsedArgsText };
				changed = true;
				appliedRules.push('parseArgsStringToPositionalArgs');
			}
			else if (isPlainObjectRecord(parsedArgsText)) {
				normalized.args = parsedArgsText;
				changed = true;
				appliedRules.push('parseArgsStringToObject');
			}
			else {
				return { changed, args: normalized, appliedRules, error: 'jlceda_api_invoke 的 args 字段解析结果类型无效。' };
			}
		}
	}

	if (isPlainObjectRecord(normalized.args)) {
		const normalizedArgsObject: Record<string, unknown> = { ...normalized.args };
		if (Array.isArray(normalizedArgsObject.args) && !Array.isArray(normalizedArgsObject.positionalArgs)) {
			normalizedArgsObject.positionalArgs = normalizedArgsObject.args;
			changed = true;
			appliedRules.push('mapArgsObjectArgsToPositionalArgs');
		}
		const hasInvokeKnownField: boolean = Array.isArray(normalizedArgsObject.positionalArgs)
			|| Array.isArray(normalizedArgsObject.args)
			|| isPlainObjectRecord(normalizedArgsObject.namedArgs);
		if (!hasInvokeKnownField && Object.keys(normalizedArgsObject).length > 0) {
			normalized.args = { namedArgs: normalizedArgsObject };
			changed = true;
			appliedRules.push('wrapArgsObjectAsNamedArgs');
		}
		else {
			normalized.args = normalizedArgsObject;
		}
	}

	return { changed, args: normalized, appliedRules, error: '' };
}

/**
 * 执行工具函数。
 * @param toolRuntime - 工具运行时对象。
 * @param toolName - 工具名称。
 * @param rawArguments - 原始参数 JSON 文本。
 * @returns 工具执行结果。
 */
export async function executeTool(toolRuntime?: any, toolName?: any, rawArguments?: any) {
	let args: any = {};
	const normalizedToolName: any = String(toolName || '').trim();
	const rawArgumentsText: any = normalizeRawToolArgumentsText(rawArguments);
	let argumentsRepairStatus: any = 'none';
	let argumentsRepairOriginalPreview: any = '';
	let argumentsRepairRepairedPreview: any = '';
	let argumentsRepairAppliedRules: any = [];
	let argumentsRepairError: any = '';

	try {
		if (rawArguments === undefined || rawArguments === null || rawArgumentsText === '') {
			args = {};
		}
		else if (typeof rawArguments === 'object') {
			args = rawArguments;
		}
		else if (typeof rawArguments === 'string') {
			try {
				args = JSON.parse(rawArguments);
			}
			catch (parseError: any) {
				const repairResult: any = autoRepairToolArgumentsJson(rawArguments);
				argumentsRepairStatus = repairResult && repairResult.ok ? 'fixed' : 'failed';
				argumentsRepairOriginalPreview = String(repairResult && repairResult.originalPreview ? repairResult.originalPreview : '').trim();
				argumentsRepairRepairedPreview = String(repairResult && repairResult.repairedPreview ? repairResult.repairedPreview : '').trim();
				argumentsRepairAppliedRules = Array.isArray(repairResult && repairResult.appliedRules) ? repairResult.appliedRules : [];
				argumentsRepairError = String(repairResult && repairResult.error ? repairResult.error : '').trim();
				if (repairResult && repairResult.ok) {
					args = repairResult.parsed;
				}
				else {
					throw parseError;
				}
			}
		}
		else {
			throw new TypeError('工具参数类型无效。');
		}

		const normalizedResult: any = normalizeParsedToolArguments(normalizedToolName, args);
		if (String(normalizedResult.error || '').trim()) {
			argumentsRepairStatus = 'failed';
			argumentsRepairError = String(normalizedResult.error || '').trim();
			argumentsRepairOriginalPreview = rawArgumentsText.slice(0, 500);
			argumentsRepairRepairedPreview = toRepairPreviewText(normalizedResult.args, 500);
			argumentsRepairAppliedRules = mergeRepairRules(argumentsRepairAppliedRules, normalizedResult.appliedRules);
			throw new TypeError(argumentsRepairError);
		}
		if (normalizedResult.changed) {
			args = normalizedResult.args;
			argumentsRepairStatus = 'fixed';
			argumentsRepairOriginalPreview = argumentsRepairOriginalPreview || rawArgumentsText.slice(0, 500);
			argumentsRepairRepairedPreview = toRepairPreviewText(args, 500);
			argumentsRepairAppliedRules = mergeRepairRules(argumentsRepairAppliedRules, normalizedResult.appliedRules);
		}
	}
	catch {
		return {
			ok: false,
			error: '工具参数不是有效 JSON。',
			errorCode: 'INVALID_TOOL_ARGUMENTS_JSON',
			errorStage: 'parse-arguments',
			toolName: normalizedToolName,
			expectedArgumentsFormat: buildExpectedArgumentsFormat(normalizedToolName),
			rawArgumentsPreview: rawArgumentsText.slice(0, 500),
			argumentsRepairStatus,
			argumentsRepairOriginalPreview,
			argumentsRepairRepairedPreview,
			argumentsRepairAppliedRules,
			argumentsRepairError,
		};
	}

	const runtimeObject: any = toolRuntime && typeof toolRuntime === 'object' ? toolRuntime : {};
	const handlerMap: Record<string, (args?: unknown) => Promise<unknown>> = {
		async jlceda_api_search(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleApiSearchTask !== 'function') {
				return { ok: false, error: 'jlceda_api_search 处理器未初始化。' };
			}
			return await runtimeObject.handleApiSearchTask(handlerArgs);
		},
		async jlceda_context_get(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleContextTask !== 'function') {
				return { ok: false, error: 'jlceda_context_get 处理器未初始化。' };
			}
			return await runtimeObject.handleContextTask(handlerArgs);
		},
		async jlceda_api_invoke(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleInvokeTask !== 'function') {
				return { ok: false, error: 'jlceda_api_invoke 处理器未初始化。' };
			}
			return await runtimeObject.handleInvokeTask(handlerArgs);
		},
	};

	const handler: any = handlerMap[normalizedToolName];
	if (!handler) {
		return { ok: false, error: `不支持的工具：${toolName}` };
	}

	const result: any = await handler(args);
	if (!result || typeof result !== 'object') {
		return result;
	}
	if (argumentsRepairStatus === 'fixed') {
		result.argumentsRepairStatus = 'fixed';
		result.argumentsRepairOriginalPreview = argumentsRepairOriginalPreview;
		result.argumentsRepairRepairedPreview = argumentsRepairRepairedPreview;
		result.argumentsRepairAppliedRules = argumentsRepairAppliedRules;
		result.argumentsRepairError = argumentsRepairError;
	}
	return result;
}

/**
 * 带超时保护执行工具函数。
 * @param toolRuntime - 工具运行时对象。
 * @param toolName - 工具名称。
 * @param rawArguments - 原始参数 JSON 文本。
 * @param timeoutSeconds - 超时时间（秒）。
 * @returns 工具执行结果。
 */
export async function executeToolWithTimeout(toolRuntime?: any, toolName?: any, rawArguments?: any, timeoutSeconds?: any) {
	const timeoutValue: any = Number(timeoutSeconds);
	const effectiveTimeoutSeconds: any = Number.isFinite(timeoutValue) && timeoutValue > 0
		? timeoutValue
		: 30;
	const effectiveTimeoutMs: any = Math.max(1, Math.round(effectiveTimeoutSeconds * 1000));
	const timeoutDisplaySeconds: any = Number.isInteger(effectiveTimeoutSeconds)
		? String(effectiveTimeoutSeconds)
		: String(Number(effectiveTimeoutSeconds.toFixed(3)));

	let timerId: any = 0;
	const executionPromise: any = Promise.resolve().then(() => executeTool(toolRuntime, toolName, rawArguments)).catch((error) => {
		return { ok: false, error: serializeRuntimeRawError(error) };
	});
	const timeoutPromise: any = new Promise((resolve) => {
		timerId = window.setTimeout(() => {
			resolve({
				ok: false,
				error: `工具执行超时（${timeoutDisplaySeconds}秒）：${toolName || '未命名工具'}`,
			});
		}, effectiveTimeoutMs);
	});
	try {
		return await Promise.race([executionPromise, timeoutPromise]);
	}
	finally {
		if (timerId) {
			window.clearTimeout(timerId);
		}
	}
}

/**
 * 创建工具运行时实现。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 工具运行时对象。
 */
export function createAgentToolRuntime(runtimeWindow?: any) {
	const deps = { safeCall, toSerializableAsync, activeBlobUrls };
	const { handleApiSearchTask } = createApiSearchHandler(runtimeWindow || window);
	const { handleContextTask } = createContextGetHandler(runtimeWindow || window, deps);
	const { handleInvokeTask, resolveApiMemberInAnyRoot } = createApiInvokeHandler(runtimeWindow || window, deps);

	return {
		resolveApiMemberInAnyRoot,
		handleApiSearchTask: async (payload?: unknown) => {
			try {
				return await handleApiSearchTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleContextTask: async (payload?: unknown) => {
			try {
				return await handleContextTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleInvokeTask: async (payload?: unknown) => {
			try {
				return await handleInvokeTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
	};
}
