// 文件说明：工具运行时调度层 —— 管理序列化工具、参数解析规范化、超时执行与工具运行时创建。
import { makeJsonSafe } from '../utils';
import { createApiIndexHandler } from './api-index';
import { createApiInvokeHandler } from './api-invoke';
import { createApiSearchHandler } from './api-search';
import { createComponentPlaceHandler } from './component-place';
import { createComponentSelectHandler } from './component-select';
import { createEdaContextHandler } from './eda-context';
import { createSchematicReadHandler } from './schematic-read';
import { createSchematicReviewHandler } from './schematic-review';
import { createTodoListHandler } from './todo_list';

// 允许暴露给模型并允许执行的工具白名单。
export const MANUAL_EXPOSED_TOOL_NAMES: string[] = [
	// 下面四个透传 API 工具仅作调试使用。
	// 'api_index',
	// 'api_search',
	// 'eda_context',
	// 'api_invoke',
	'schematic_read',
	'schematic_review',
	'todo_list',
	'component_select',
	'component_place',
];

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
	if (toolName === 'api_index') {
		return '{"owner":"sch"}';
	}
	if (toolName === 'api_search') {
		return '{"query":"bom","scope":"callable","owner":"sch","limit":10}';
	}
	if (toolName === 'eda_context') {
		return '{"scope":"sch"}';
	}
	if (toolName === 'api_invoke') {
		return '{"apiFullName":"eda.sch_Drc.check","args":"[false,false,true]"}';
	}
	if (toolName === 'schematic_read') {
		return '{}';
	}
	if (toolName === 'schematic_review') {
		return '{}';
	}
	if (toolName === 'todo_list') {
		return '{"todoList":"[{\\"id\\":1,\\"title\\":\\"任务标题\\",\\"status\\":\\"in-progress\\"}]","explanation":"可选说明"}';
	}
	if (toolName === 'component_select') {
		return '{"keyword":"器件关键词"}';
	}
	if (toolName === 'component_place') {
		return '{"components":[{"uuid":"器件UUID","libraryUuid":"库UUID","name":"器件名称","footprintName":"封装名称","subPartName":""}],"timeoutSeconds":60}';
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

	if (toolName === 'api_search' && isPlainObjectRecord(currentArgs)) {
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

	if (toolName !== 'api_invoke') {
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
		async api_index(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleApiIndexTask !== 'function') {
				return { ok: false, error: 'api_index 处理器未初始化。' };
			}
			return await runtimeObject.handleApiIndexTask(handlerArgs);
		},
		async api_search(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleApiSearchTask !== 'function') {
				return { ok: false, error: 'api_search 处理器未初始化。' };
			}
			return await runtimeObject.handleApiSearchTask(handlerArgs);
		},
		async eda_context(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleEdaContextTask !== 'function') {
				return { ok: false, error: 'eda_context 处理器未初始化。' };
			}
			return await runtimeObject.handleEdaContextTask(handlerArgs);
		},
		async api_invoke(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleApiInvokeTask !== 'function') {
				return { ok: false, error: 'api_invoke 处理器未初始化。' };
			}
			return await runtimeObject.handleApiInvokeTask(handlerArgs);
		},
		async schematic_read(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleSchematicReadTask !== 'function') {
				return { ok: false, error: 'schematic_read 处理器未初始化。' };
			}
			return await runtimeObject.handleSchematicReadTask(handlerArgs);
		},
		async schematic_review(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleSchematicReviewTask !== 'function') {
				return { ok: false, error: 'schematic_review 处理器未初始化。' };
			}
			return await runtimeObject.handleSchematicReviewTask(handlerArgs);
		},
		async todo_list(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleTodoListTask !== 'function') {
				return { ok: false, error: 'todo_list 处理器未初始化。' };
			}
			return await runtimeObject.handleTodoListTask(handlerArgs);
		},
		// 工具：component_select；功能：调用 EDA 系统库搜索候选器件，返回选型交互协议。
		async component_select(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleComponentSelectTask !== 'function') {
				return { ok: false, error: 'component_select 处理器未初始化。' };
			}
			return await runtimeObject.handleComponentSelectTask(handlerArgs);
		},
		// 工具：component_place；功能：逐个引导用户在原理图中交互放置已选定器件。
		async component_place(handlerArgs?: unknown): Promise<unknown> {
			if (typeof runtimeObject.handleComponentPlaceTask !== 'function') {
				return { ok: false, error: 'component_place 处理器未初始化。' };
			}
			return await runtimeObject.handleComponentPlaceTask(handlerArgs);
		},
	};

	const handler: any = MANUAL_EXPOSED_TOOL_NAMES.includes(normalizedToolName)
		? handlerMap[normalizedToolName]
		: undefined;
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
	const { handleApiIndexTask } = createApiIndexHandler();
	const { handleApiSearchTask } = createApiSearchHandler(runtimeWindow || window);
	const { handleEdaContextTask } = createEdaContextHandler(runtimeWindow || window, deps);
	const { handleApiInvokeTask, resolveApiMemberInAnyRoot } = createApiInvokeHandler(runtimeWindow || window, deps);
	const { handleSchematicReadTask } = createSchematicReadHandler(runtimeWindow || window, deps);
	const { handleSchematicReviewTask } = createSchematicReviewHandler(runtimeWindow || window, deps);
	const { handleTodoListTask } = createTodoListHandler();
	const { handleComponentSelectTask } = createComponentSelectHandler(runtimeWindow || window);
	const { handleComponentPlaceTask } = createComponentPlaceHandler();

	return {
		resolveApiMemberInAnyRoot,
		handleApiIndexTask: async (payload?: unknown) => {
			try {
				return await handleApiIndexTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleApiSearchTask: async (payload?: unknown) => {
			try {
				return await handleApiSearchTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleEdaContextTask: async (payload?: unknown) => {
			try {
				return await handleEdaContextTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleApiInvokeTask: async (payload?: unknown) => {
			try {
				return await handleApiInvokeTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleSchematicReadTask: async (payload?: unknown) => {
			try {
				return await handleSchematicReadTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleSchematicReviewTask: async (payload?: unknown) => {
			try {
				return await handleSchematicReviewTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleTodoListTask: async (payload?: unknown) => {
			try {
				return await handleTodoListTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleComponentSelectTask: async (payload?: unknown) => {
			try {
				return await handleComponentSelectTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
		handleComponentPlaceTask: async (payload?: unknown) => {
			try {
				return await handleComponentPlaceTask(payload);
			}
			catch (error: unknown) {
				return { ok: false, error: toSafeErrorMessage(error) };
			}
		},
	};
}
