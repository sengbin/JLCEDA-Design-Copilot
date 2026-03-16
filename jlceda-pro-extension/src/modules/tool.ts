import { autoRepairToolArgumentsJson } from './tool-arguments-repair';
import { getEdaApiRoot, makeJsonSafe, readExtensionTextFileByCandidates } from './utils';

// 当前会话中有效的 blob URL 集合，页面关闭后自动失效，不会持久化。
export const activeBlobUrls: Set<string> = new Set();

interface ApiProjectionItem {
	id: number;
	name: string;
	fullName: string;
	kind: string;
	ownerFullName: string;
	summary: string;
	signatureText?: string;
	typeText?: string;
	returnType?: string;
	parameters?: unknown[];
}

interface ApiDocument {
	queryIndexes?: {
		symbolIdByKeyword?: Record<string, number[]>;
	};
	projections?: {
		callableApis?: ApiProjectionItem[];
		types?: ApiProjectionItem[];
	};
}

interface ApiCache {
	allItems: ApiProjectionItem[];
	callableItems: ApiProjectionItem[];
	typeItems: ApiProjectionItem[];
	itemById: Map<number, ApiProjectionItem>;
	keywordIndex: Map<string, number[]>;
}

const API_SEARCH_MAX_LIMIT = 50;
const API_DOCUMENT_URI_CANDIDATES = [
	'/iframe/jlceda-pro-api-doc.json',
	'iframe/jlceda-pro-api-doc.json',
	'./iframe/jlceda-pro-api-doc.json',
	'./jlceda-pro-api-doc.json',
	'jlceda-pro-api-doc.json',
] as const;

const FORBIDDEN_SEGMENT_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

// 判断输入是否为普通对象。
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 判断输入是否为可访问成员的对象。
function isObjectLikeRecord(value: unknown): value is Record<string, unknown> {
	return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

// 转换异常为安全文本。
function toSafeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}

// 解析带边界的整数参数。
function parseBoundedIntegerValue(value: unknown, defaultValue: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		return defaultValue;
	}
	if (value < min || value > max) {
		throw new Error(`整数参数超出范围，允许区间: ${min}-${max}。`);
	}
	return value;
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

// 判断是否为 Blob 或 File（使用 duck typing，避免跨 frame 的 instanceof 失效）。
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
async function toSerializableAsync(value: unknown, depth = 0, seen?: WeakSet<object>): Promise<unknown> {
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
async function safeCall(executor: () => unknown | Promise<unknown>): Promise<unknown> {
	try {
		return await Promise.resolve(executor());
	}
	catch {
		return undefined;
	}
}

// 拆分检索关键词。
function splitTerms(raw: string): string[] {
	const normalized: any = raw.trim().toLowerCase();
	if (!normalized) {
		return [];
	}
	return normalized
		.split(/[\s,，;；、|/\\:：._\-(){}]+/)
		.map((item: string) => item.trim())
		.filter((item: string) => item.length > 0);
}

// 构建关键词倒排索引。
function buildKeywordIndex(rawIndex: Record<string, number[]> | undefined): Map<string, number[]> {
	const output: Map<string, number[]> = new Map();
	if (!rawIndex) {
		return output;
	}
	for (const [keyword, ids] of Object.entries(rawIndex)) {
		if (!keyword.trim() || !Array.isArray(ids)) {
			continue;
		}
		output.set(keyword.toLowerCase(), ids.filter(id => Number.isInteger(id)));
	}
	return output;
}

// 读取检索范围候选集合。
function getScopedItems(cache: ApiCache, scope: string): ApiProjectionItem[] {
	if (scope === 'callable') {
		return cache.callableItems;
	}
	if (scope === 'type') {
		return cache.typeItems;
	}
	return cache.allItems;
}

// 索引不命中时的兜底评分。
function scoreFallback(item: ApiProjectionItem, queryLower: string, terms: string[]): number {
	const name: any = String(item.name ?? '').toLowerCase();
	const fullName: any = String(item.fullName ?? '').toLowerCase();
	const summary: any = String(item.summary ?? '').toLowerCase();

	let score = 0;
	if (fullName.includes(queryLower)) {
		score += 8;
	}
	if (name.includes(queryLower)) {
		score += 6;
	}

	for (const term of terms) {
		if (term.length < 2) {
			continue;
		}
		if (fullName.includes(term)) {
			score += 4;
		}
		if (name.includes(term)) {
			score += 3;
		}
		if (summary.includes(term)) {
			score += 1;
		}
	}

	return score;
}

// 在对象上解析段名，允许大小写容错匹配。
function resolveSegmentKey(target: Record<string, unknown>, segment: string): string {
	if (segment in target) {
		return segment;
	}
	const normalizedSegment: any = segment.toLowerCase();
	for (const key of Object.keys(target)) {
		if (key.toLowerCase() !== normalizedSegment) {
			continue;
		}
		return key;
	}
	throw new Error(`调用路径不存在: ${segment}`);
}

// 解析工具调用参数格式。
function normalizeInvokeArgs(rawArgs: unknown): unknown[] {
	if (!isPlainObjectRecord(rawArgs)) {
		return [];
	}
	if (Array.isArray(rawArgs.positionalArgs)) {
		return rawArgs.positionalArgs;
	}
	if (Array.isArray(rawArgs.args)) {
		return rawArgs.args;
	}
	if (isPlainObjectRecord(rawArgs.namedArgs)) {
		if (Array.isArray(rawArgs.parameterOrder)) {
			const ordered: unknown[] = [];
			for (const key of rawArgs.parameterOrder) {
				if (typeof key !== 'string' || !key.trim()) {
					continue;
				}
				ordered.push(rawArgs.namedArgs[key]);
			}
			return ordered;
		}
		return [rawArgs.namedArgs];
	}
	if (Object.keys(rawArgs).length === 0) {
		return [];
	}
	return [rawArgs];
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

// 将常见旧参数格式修复为当前三工具所需结构（重点覆盖 DeepSeek 常见返回格式）。
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
		return {
			changed,
			args: normalized,
			appliedRules,
			error: '',
		};
	}

	if (toolName !== 'jlceda_api_invoke') {
		return {
			changed,
			args: currentArgs,
			appliedRules,
			error: '',
		};
	}

	if (!isPlainObjectRecord(currentArgs)) {
		return {
			changed,
			args: currentArgs,
			appliedRules,
			error: '',
		};
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
		normalized.args = {
			positionalArgs: normalized.args,
		};
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
				return {
					changed,
					args: normalized,
					appliedRules,
					error: 'jlceda_api_invoke 的 args 字段不是有效 JSON，且自动修复失败。',
				};
			}
			if (Array.isArray(parsedArgsText)) {
				normalized.args = {
					positionalArgs: parsedArgsText,
				};
				changed = true;
				appliedRules.push('parseArgsStringToPositionalArgs');
			}
			else if (isPlainObjectRecord(parsedArgsText)) {
				normalized.args = parsedArgsText;
				changed = true;
				appliedRules.push('parseArgsStringToObject');
			}
			else {
				return {
					changed,
					args: normalized,
					appliedRules,
					error: 'jlceda_api_invoke 的 args 字段解析结果类型无效。',
				};
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
			normalized.args = {
				namedArgs: normalizedArgsObject,
			};
			changed = true;
			appliedRules.push('wrapArgsObjectAsNamedArgs');
		}
		else {
			normalized.args = normalizedArgsObject;
		}
	}

	return {
		changed,
		args: normalized,
		appliedRules,
		error: '',
	};
}

// 构建当前运行时的工具处理器映射。
function buildRuntimeToolHandlers(toolRuntime?: any): Record<string, (args?: unknown) => Promise<unknown>> {
	const runtimeObject: any = toolRuntime && typeof toolRuntime === 'object' ? toolRuntime : {};
	const handleApiSearchTask: any = runtimeObject.handleApiSearchTask;
	const handleContextTask: any = runtimeObject.handleContextTask;
	const handleInvokeTask: any = runtimeObject.handleInvokeTask;

	return {
		async jlceda_api_search(args?: unknown): Promise<unknown> {
			if (typeof handleApiSearchTask !== 'function') {
				return { ok: false, error: 'jlceda_api_search 处理器未初始化。' };
			}
			return await handleApiSearchTask(args);
		},
		async jlceda_context_get(args?: unknown): Promise<unknown> {
			if (typeof handleContextTask !== 'function') {
				return { ok: false, error: 'jlceda_context_get 处理器未初始化。' };
			}
			return await handleContextTask(args);
		},
		async jlceda_api_invoke(args?: unknown): Promise<unknown> {
			if (typeof handleInvokeTask !== 'function') {
				return { ok: false, error: 'jlceda_api_invoke 处理器未初始化。' };
			}
			return await handleInvokeTask(args);
		},
	};
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

	const handler: any = buildRuntimeToolHandlers(toolRuntime)[normalizedToolName];

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
		return {
			ok: false,
			error: serializeRuntimeRawError(error),
		};
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

// 创建工具运行时实现。
export function createAgentToolRuntime(runtimeWindow?: any) {
	let apiCache: ApiCache | null = null;

	// 读取并缓存离线 API 文档。
	async function loadApiCache(): Promise<ApiCache> {
		if (apiCache) {
			return apiCache;
		}

		const readResult: any = await readExtensionTextFileByCandidates(runtimeWindow, API_DOCUMENT_URI_CANDIDATES);
		if (!readResult || !readResult.ok) {
			throw new Error(`离线 API 文档读取失败: ${String(readResult && readResult.error ? readResult.error : 'unknown')}`);
		}

		const text: any = String(readResult.text || '');
		const parsed: any = JSON.parse(text || '{}');
		if (!isPlainObjectRecord(parsed)) {
			throw new Error('离线 API 文档格式非法：根节点必须是对象。');
		}

		const documentData: ApiDocument = parsed as ApiDocument;
		const callableItems: ApiProjectionItem[] = Array.isArray(documentData.projections?.callableApis)
			? documentData.projections.callableApis
			: [];
		const typeItems: ApiProjectionItem[] = Array.isArray(documentData.projections?.types)
			? documentData.projections.types
			: [];
		const allItems: ApiProjectionItem[] = [...callableItems, ...typeItems];
		const itemById: Map<number, ApiProjectionItem> = new Map();
		for (const item of allItems) {
			itemById.set(item.id, item);
		}

		apiCache = {
			allItems,
			callableItems,
			typeItems,
			itemById,
			keywordIndex: buildKeywordIndex(documentData.queryIndexes?.symbolIdByKeyword),
		};
		return apiCache;
	}

	// 解析任意 API 路径成员，供 UI 侧兼容逻辑使用。
	function resolveApiMemberInAnyRoot(apiPath?: any) {
		const normalizedPath: any = String(apiPath || '').trim();
		if (!normalizedPath) {
			return null;
		}
		const apiRoot: any = getEdaApiRoot(runtimeWindow);
		if (!isObjectLikeRecord(apiRoot)) {
			return null;
		}
		const segments: string[] = normalizedPath
			.split('.')
			.map((segment: string) => String(segment || '').trim())
			.filter((segment: string) => segment.length > 0);
		if (segments.length < 1) {
			return null;
		}

		let context: unknown = apiRoot;
		const resolvedSegments: string[] = [];
		for (let index = 0; index < segments.length - 1; index += 1) {
			if (!isObjectLikeRecord(context)) {
				return null;
			}
			const actualKey: string = resolveSegmentKey(context, segments[index]);
			resolvedSegments.push(actualKey);
			context = context[actualKey];
		}

		if (!isObjectLikeRecord(context)) {
			return null;
		}
		const memberName: string = resolveSegmentKey(context, segments[segments.length - 1]);
		return {
			context,
			memberName,
			value: context[memberName],
			resolvedApiPath: resolvedSegments.concat(memberName).join('.'),
		};
	}

	// 处理离线文档检索工具。
	async function handleApiSearchTask(payload: unknown): Promise<unknown> {
		if (!isPlainObjectRecord(payload)) {
			throw new Error('api/search 任务参数必须为对象。');
		}

		const query: any = String(payload.query ?? '').trim();
		if (!query) {
			throw new Error('jlceda_api_search 缺少 query 参数。');
		}

		const scope: any = String(payload.scope ?? 'all').trim().toLowerCase();
		if (!['all', 'callable', 'type'].includes(scope)) {
			throw new Error('scope 仅支持 all/callable/type。');
		}

		const ownerFilter: any = String(payload.owner ?? '').trim().toLowerCase();
		const limit: any = parseBoundedIntegerValue(payload.limit, 10, 1, API_SEARCH_MAX_LIMIT);
		const cache: ApiCache = await loadApiCache();
		const terms: string[] = splitTerms(query);
		const queryLower: string = query.toLowerCase();

		const scopedItems: ApiProjectionItem[] = getScopedItems(cache, scope);
		const allowIdSet: Set<number> = new Set(scopedItems.map(item => item.id));
		const scoreById: Map<number, number> = new Map();

		for (const term of terms) {
			const ids: number[] = cache.keywordIndex.get(term) ?? [];
			for (const id of ids) {
				if (!allowIdSet.has(id)) {
					continue;
				}
				scoreById.set(id, (scoreById.get(id) ?? 0) + 10);
			}
		}

		for (const id of scoreById.keys()) {
			const item: ApiProjectionItem | undefined = cache.itemById.get(id);
			if (!item) {
				continue;
			}
			const nameWords: string[] = String(item.name ?? '')
				.split(/(?=[A-Z])|_/)
				.map(word => word.toLowerCase())
				.filter(Boolean);
			let bonus = 0;
			for (const term of terms) {
				const wordIndex: number = nameWords.indexOf(term);
				if (wordIndex >= 0) {
					bonus += Math.max(0, 4 - wordIndex);
				}
			}
			if (bonus > 0) {
				scoreById.set(id, (scoreById.get(id) ?? 0) + bonus);
			}
		}

		if (scoreById.size === 0) {
			for (const item of scopedItems) {
				const score: number = scoreFallback(item, queryLower, terms);
				if (score > 0) {
					scoreById.set(item.id, score);
				}
			}
		}

		const filteredItems: Array<{
			id: number;
			name: string;
			fullName: string;
			kind: string;
			ownerFullName: string;
			summary: string;
			signatureText: string;
			typeText: string;
			returnType: string;
			parameters: unknown[];
			score: number;
		}> = [...scoreById.entries()]
			.map(([id, score]) => {
				const item: ApiProjectionItem | undefined = cache.itemById.get(id);
				if (!item) {
					return null;
				}
				if (ownerFilter && !String(item.ownerFullName ?? '').toLowerCase().includes(ownerFilter)) {
					return null;
				}
				return {
					id: item.id,
					name: item.name,
					fullName: item.fullName,
					kind: item.kind,
					ownerFullName: item.ownerFullName,
					summary: item.summary,
					signatureText: item.signatureText ?? '',
					typeText: item.typeText ?? '',
					returnType: item.returnType ?? '',
					parameters: Array.isArray(item.parameters) ? item.parameters : [],
					score,
				};
			})
			.filter((item): item is {
				id: number;
				name: string;
				fullName: string;
				kind: string;
				ownerFullName: string;
				summary: string;
				signatureText: string;
				typeText: string;
				returnType: string;
				parameters: unknown[];
				score: number;
			} => item !== null)
			.sort((left, right) => {
				if (right.score !== left.score) {
					return right.score - left.score;
				}
				return left.fullName.localeCompare(right.fullName);
			});

		const items: any[] = filteredItems.slice(0, limit);
		return {
			query,
			scope,
			owner: ownerFilter,
			totalCandidates: filteredItems.length,
			returnedCount: items.length,
			items,
		};
	}

	// 组装当前 EDA 运行时上下文。
	async function buildContextSnapshot(scope: string): Promise<Record<string, unknown>> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!isObjectLikeRecord(rootUnknown)) {
			throw new Error('当前环境未检测到 EDA API 对象。');
		}
		const root: any = rootUnknown;

		const currentDocumentInfo = await safeCall(() => root.dmt_SelectControl.getCurrentDocumentInfo());
		const currentProjectInfo = await safeCall(() => root.dmt_Project.getCurrentProjectInfo());
		const currentBoardInfo = await safeCall(() => root.dmt_Board.getCurrentBoardInfo());
		const currentSchematicInfo = await safeCall(() => root.dmt_Schematic.getCurrentSchematicInfo());
		const currentSchematicPageInfo = await safeCall(() => root.dmt_Schematic.getCurrentSchematicPageInfo());
		const currentPcbInfo = await safeCall(() => root.dmt_Pcb.getCurrentPcbInfo());
		const currentPanelInfo = await safeCall(() => root.dmt_Panel.getCurrentPanelInfo());
		const selectedPcbPrimitiveIds = await safeCall(() => root.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId()) ?? [];
		const selectedSchPrimitiveIds = await safeCall(() => root.sch_SelectControl.getAllSelectedPrimitives_PrimitiveId()) ?? [];

		return {
			scope,
			capturedAt: new Date().toISOString(),
			currentDocumentInfo: await toSerializableAsync(currentDocumentInfo),
			currentProjectInfo: await toSerializableAsync(currentProjectInfo),
			currentBoardInfo: await toSerializableAsync(currentBoardInfo),
			currentSchematicInfo: await toSerializableAsync(currentSchematicInfo),
			currentSchematicPageInfo: await toSerializableAsync(currentSchematicPageInfo),
			currentPcbInfo: await toSerializableAsync(currentPcbInfo),
			currentPanelInfo: await toSerializableAsync(currentPanelInfo),
			selectedPcbPrimitiveIds: await toSerializableAsync(selectedPcbPrimitiveIds),
			selectedSchPrimitiveIds: await toSerializableAsync(selectedSchPrimitiveIds),
		};
	}

	// 处理上下文查询工具。
	async function handleContextTask(payload: unknown): Promise<unknown> {
		const scope: any = isPlainObjectRecord(payload) ? String(payload.scope ?? '').trim() : '';
		return await buildContextSnapshot(scope);
	}

	// 解析 API 调用目标。
	function resolveApiCallable(apiFullName: string): { callable: (...args: unknown[]) => unknown; thisArg: unknown; resolvedPath: string } {
		const normalized: any = apiFullName.trim();
		if (!normalized) {
			throw new Error('缺少 apiFullName。');
		}

		const segments: string[] = normalized.split('.');
		if (segments.length < 3 || segments.some(item => !item)) {
			throw new Error(`apiFullName 格式非法: "${apiFullName}"。正确格式为 eda.模块名.方法名（以“.”分隔的至少三段路径）。`);
		}
		if (segments[0] !== 'eda') {
			throw new Error(`apiFullName 必须以 "eda." 开头，当前第一段为: "${segments[0]}"。`);
		}
		if (segments.some(segment => FORBIDDEN_SEGMENT_NAMES.has(segment))) {
			throw new Error('apiFullName 包含非法属性名。');
		}

		const root: any = getEdaApiRoot(runtimeWindow);
		if (!isObjectLikeRecord(root)) {
			throw new Error('当前环境未检测到 EDA API 对象。');
		}

		let current: unknown = root;
		for (let index = 1; index < segments.length - 1; index += 1) {
			if (!isObjectLikeRecord(current)) {
				throw new Error(`调用路径无效: ${normalized}`);
			}
			const segmentKey: string = resolveSegmentKey(current, segments[index]);
			current = current[segmentKey];
		}

		if (!isObjectLikeRecord(current)) {
			throw new Error(`调用目标无效: ${apiFullName}`);
		}

		const methodKey: string = resolveSegmentKey(current, segments[segments.length - 1]);
		const callable: unknown = current[methodKey];
		if (typeof callable !== 'function') {
			throw new TypeError(`目标不可调用: ${apiFullName}`);
		}

		return {
			callable: callable as (...args: unknown[]) => unknown,
			thisArg: current,
			resolvedPath: normalized,
		};
	}

	// 处理 API 调用工具。
	async function handleInvokeTask(payload: unknown): Promise<unknown> {
		if (!isPlainObjectRecord(payload)) {
			throw new Error('invoke 任务参数必须为对象。');
		}

		const apiFullName: any = String(payload.apiFullName ?? '').trim();
		const { callable, thisArg, resolvedPath } = resolveApiCallable(apiFullName);
		const invokeArgs: unknown[] = normalizeInvokeArgs(payload.args);
		const invokeResult: unknown = await Promise.resolve(callable.apply(thisArg, invokeArgs));

		return {
			apiFullName: resolvedPath,
			argsCount: invokeArgs.length,
			result: await toSerializableAsync(invokeResult),
		};
	}

	return {
		resolveApiMemberInAnyRoot,
		handleApiSearchTask: async (payload?: unknown) => {
			try {
				return await handleApiSearchTask(payload);
			}
			catch (error: unknown) {
				return {
					ok: false,
					error: toSafeErrorMessage(error),
				};
			}
		},
		handleContextTask: async (payload?: unknown) => {
			try {
				return await handleContextTask(payload);
			}
			catch (error: unknown) {
				return {
					ok: false,
					error: toSafeErrorMessage(error),
				};
			}
		},
		handleInvokeTask: async (payload?: unknown) => {
			try {
				return await handleInvokeTask(payload);
			}
			catch (error: unknown) {
				return {
					ok: false,
					error: toSafeErrorMessage(error),
				};
			}
		},
	};
}
