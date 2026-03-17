// 文件说明：工具运行时调度层 —— 管理序列化工具、参数解析规范化、超时执行与工具运行时创建。
import { makeJsonSafe } from '../utils';
import { createApiInvokeHandler } from './api-invoke';
import { createApiSearchHandler } from './api-search';
import { createContextGetHandler } from './context-get';

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
		return '{"apiFullName":"eda.sch_Drc.check","args":"[false,false,true]"}';
	}
	return '{"参数1":"值1","参数2":"值2"}';
}

// 将常见旧参数格式规范化为当前三工具所需结构。
function normalizeParsedToolArguments(toolName: string, sourceArgs: unknown): {
	changed: boolean;
	args: unknown;
	error: string;
} {
	let currentArgs: unknown = sourceArgs;
	let changed = false;

	if (Array.isArray(currentArgs) && currentArgs.length === 1 && isPlainObjectRecord(currentArgs[0])) {
		currentArgs = currentArgs[0];
		changed = true;
	}

	if (toolName === 'jlceda_api_search' && isPlainObjectRecord(currentArgs)) {
		const normalized: Record<string, unknown> = { ...currentArgs };
		if (!String(normalized.query || '').trim()) {
			const keywordText: any = String(normalized.keyword || '').trim();
			if (keywordText) {
				normalized.query = keywordText;
				changed = true;
			}
		}
		if ((normalized.limit === undefined || normalized.limit === null) && normalized.maxResults !== undefined) {
			normalized.limit = normalized.maxResults;
			changed = true;
		}
		return { changed, args: normalized, error: '' };
	}

	if (toolName !== 'jlceda_api_invoke') {
		return { changed, args: currentArgs, error: '' };
	}

	if (!isPlainObjectRecord(currentArgs)) {
		return { changed, args: currentArgs, error: '' };
	}

	const normalized: Record<string, unknown> = { ...currentArgs };
	if (!String(normalized.apiFullName || '').trim()) {
		const apiPathText: any = String(normalized.apiPath || '').trim();
		if (apiPathText) {
			normalized.apiFullName = apiPathText;
			changed = true;
		}
	}

	return { changed, args: normalized, error: '' };
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

	try {
		if (rawArguments === undefined || rawArguments === null || rawArgumentsText === '') {
			args = {};
		}
		else if (typeof rawArguments === 'object') {
			args = rawArguments;
		}
		else if (typeof rawArguments === 'string') {
			// Function Calling strict 模式下参数始终为合法 JSON，解析失败直接报错。
			args = JSON.parse(rawArguments);
		}
		else {
			throw new TypeError('工具参数类型无效。');
		}

		const normalizedResult: any = normalizeParsedToolArguments(normalizedToolName, args);
		if (String(normalizedResult.error || '').trim()) {
			throw new TypeError(String(normalizedResult.error || '').trim());
		}
		if (normalizedResult.changed) {
			args = normalizedResult.args;
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
