import { createOfflineApiDocSearcher } from './doc';
// 文件说明：提供 EDA 工具运行时构建、离线文档访问与工具执行辅助能力。
import { buildToolHandlers } from './llm/agent/agent-tools';
import { autoRepairToolArgumentsJson } from './tool-arguments-repair';
import { getEdaApiRoot, makeJsonSafe } from './utils';
// 判断是否为 EDA API 方法路径。
function isOfficialApiMethodPath(apiPath?: any) {
	const text: any = String(apiPath || '').trim();
	if (!text) {
		return false;
	}
	return /^[a-z]{3}_[A-Z]\w*\.[A-Z_]\w*$/i.test(text);
}
// 拆分 API 路径。
function splitApiPathSegments(pathText?: any) {
	return String(pathText || '')
		.split('.')
		.map((segment?: any) => String(segment || '').trim())
		.filter((segment?: any) => !!segment);
}
// 规范化原始工具参数文本。
function normalizeRawToolArgumentsText(rawArguments?: any) {
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
// 从参数文本中提取 apiPath。
function extractApiPathFromToolArguments(rawArguments?: any) {
	const sourceText: any = normalizeRawToolArgumentsText(rawArguments);
	if (!sourceText) {
		return '';
	}
	const quotedMatch: any = sourceText.match(/["']apiPath["']\s*:\s*["']([^"']+)["']/i);
	if (quotedMatch && quotedMatch[1]) {
		return String(quotedMatch[1] || '').trim();
	}
	const plainMatch: any = sourceText.match(/\bapiPath\s*:\s*([\w.$]+)/i);
	if (plainMatch && plainMatch[1]) {
		return String(plainMatch[1] || '').trim();
	}
	return '';
}
// 序列化运行时原始数据。
function serializeRuntimeRawValue(value?: any, depth?: any) {
	if (value === undefined) {
		return 'undefined';
	}
	if (value === null) {
		return null;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return makeJsonSafe(value, depth || 8);
}
// 序列化错误原始数据。
function serializeRuntimeRawError(errorValue?: any) {
	if (errorValue instanceof Error) {
		return serializeRuntimeRawValue({
			...errorValue,
			name: errorValue.name,
			message: errorValue.message,
			stack: errorValue.stack,
		}, 8);
	}
	return serializeRuntimeRawValue(errorValue, 8);
}
// 生成带前缀的 API 异常文本。
function formatPrefixedEdaApiError(errorValue?: any) {
	const serializedError: any = serializeRuntimeRawError(errorValue);
	if (typeof serializedError === 'string' || typeof serializedError === 'number' || typeof serializedError === 'boolean') {
		return `调用 EDA API 异常，返回值：${serializedError}`;
	}
	if (serializedError === null) {
		return '调用 EDA API 异常，返回值：null';
	}
	return `调用 EDA API 异常，返回值：${JSON.stringify(serializedError)}`;
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
	}
	catch {
		return {
			ok: false,
			error: '工具参数不是有效 JSON。',
			errorCode: 'INVALID_TOOL_ARGUMENTS_JSON',
			errorStage: 'parse-arguments',
			toolName: normalizedToolName,
			apiPath: extractApiPathFromToolArguments(rawArguments),
			expectedArgumentsFormat: normalizedToolName === 'jlceda_call_api'
				? '示例1：{"apiPath":"模块.方法","args":[]}；示例2：{"apiPath":"模块.方法","args":[{"参数1":"值1","参数2":"值2"}]}'
				: '{"参数1":"值1","参数2":"值2"}',
			rawArgumentsPreview: rawArgumentsText.slice(0, 500),
			argumentsRepairStatus,
			argumentsRepairOriginalPreview,
			argumentsRepairRepairedPreview,
			argumentsRepairAppliedRules,
			argumentsRepairError,
		};
	}
	const handler: any = buildToolHandlers({
		listJlcEdaApis: toolRuntime.listJlcEdaApis,
		normalizeApiPath: toolRuntime.normalizeApiPath,
		resolveApiMemberInAnyRoot: toolRuntime.resolveApiMemberInAnyRoot,
		formatApiRuntimeValue: toolRuntime.formatApiRuntimeValue,
		searchOfflineApiDoc: toolRuntime.searchOfflineApiDoc,
		executeJlcEdaApiCall: toolRuntime.executeJlcEdaApiCall,
	})[normalizedToolName];
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
	const executionPromise: any = Promise.resolve().then(() => {
		return executeTool(toolRuntime, toolName, rawArguments);
	}).catch((error) => {
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
	const offlineApiDocSearcher: any = createOfflineApiDocSearcher(runtimeWindow);
	// 在离线文档中检索 API。
	async function searchOfflineApiDoc(args?: any) {
		return await offlineApiDocSearcher.searchOfflineApiDoc(args);
	}
	// 标准化 API 调用参数。
	function normalizeApiCallArguments(rawArgs?: any) {
		if (typeof rawArgs === 'undefined' || rawArgs === null) {
			return [];
		}
		if (!Array.isArray(rawArgs)) {
			throw new TypeError('jlceda_call_api 的 args 必须为数组，格式为 {"apiPath":"模块.方法","args":[{"参数1":"值1","参数2":"值2",...}]}。');
		}
		return rawArgs;
	}
	// 在对象中按大小写容错解析路径段名。
	function resolveApiPathSegmentName(context?: any, expectedName?: any) {
		if (!context || (typeof context !== 'object' && typeof context !== 'function')) {
			return '';
		}
		const expected: any = String(expectedName || '').trim();
		if (!expected) {
			return '';
		}
		try {
			if (expected in context) {
				return expected;
			}
		}
		catch { }
		const expectedLower: any = expected.toLowerCase();
		const candidateNames: any = collectMemberNames(context, 2);
		for (let index: any = 0; index < candidateNames.length; index += 1) {
			const currentName: any = String(candidateNames[index] || '');
			if (!currentName) {
				continue;
			}
			if (currentName.toLowerCase() === expectedLower) {
				return currentName;
			}
		}
		return '';
	}
	// 严格解析 API 成员。
	function resolveApiMember(root?: any, apiPath?: any) {
		if (!root || (typeof root !== 'object' && typeof root !== 'function')) {
			return null;
		}
		const normalizedPath: any = normalizeApiPath(apiPath);
		if (!normalizedPath) {
			return null;
		}
		const segments: any = splitApiPathSegments(normalizedPath);
		if (segments.length < 1) {
			return null;
		}
		let context: any = root;
		const resolvedSegments: any = [];
		for (let index: any = 0; index < segments.length - 1; index += 1) {
			const key: any = segments[index];
			if (!context || (typeof context !== 'object' && typeof context !== 'function')) {
				return null;
			}
			const actualKey: any = resolveApiPathSegmentName(context, key);
			if (!actualKey) {
				return null;
			}
			context = context[actualKey];
			resolvedSegments.push(actualKey);
		}
		if (!context || (typeof context !== 'object' && typeof context !== 'function')) {
			return null;
		}
		const memberName: any = segments[segments.length - 1];
		const actualMemberName: any = resolveApiPathSegmentName(context, memberName);
		if (!actualMemberName) {
			return null;
		}
		return {
			context,
			memberName: actualMemberName,
			value: context[actualMemberName],
			resolvedApiPath: resolvedSegments.concat([actualMemberName]).join('.'),
		};
	}
	// 严格解析可调用 API 方法。
	function resolveStrictApiFunction(root?: any, apiPath?: any) {
		if (!root || (typeof root !== 'object' && typeof root !== 'function')) {
			return null;
		}
		const segments: any = splitApiPathSegments(apiPath);
		if (segments.length !== 2) {
			return null;
		}
		const moduleName: any = segments[0];
		const methodName: any = segments[1];
		const actualModuleName: any = resolveApiPathSegmentName(root, moduleName);
		if (!actualModuleName) {
			return null;
		}
		const context: any = root[actualModuleName];
		if (!context || (typeof context !== 'object' && typeof context !== 'function')) {
			return null;
		}
		const actualMethodName: any = resolveApiPathSegmentName(context, methodName);
		if (!actualMethodName) {
			return null;
		}
		const fn: any = context[actualMethodName];
		if (typeof fn !== 'function') {
			return null;
		}
		return {
			context,
			methodName: actualMethodName,
			fn,
			resolvedApiPath: `${actualModuleName}.${actualMethodName}`,
		};
	}
	// 收集对象及其原型链可访问成员名。
	function collectMemberNames(target?: any, maxPrototypeDepth?: any) {
		if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
			return [];
		}
		const depthLimit: any = Number.isFinite(Number(maxPrototypeDepth)) ? Math.max(0, Math.floor(Number(maxPrototypeDepth))) : 2;
		const nameSet: any = new Set();
		let current: any = target;
		for (let depth: any = 0; depth <= depthLimit; depth += 1) {
			if (!current) {
				break;
			}
			try {
				const keys: any = Object.keys(current);
				for (let index: any = 0; index < keys.length; index += 1) {
					nameSet.add(keys[index]);
				}
			}
			catch { }
			try {
				for (const key in current) {
					if (typeof key === 'string') {
						nameSet.add(key);
					}
				}
			}
			catch { }
			try {
				const ownNames: any = Object.getOwnPropertyNames(current);
				for (let index: any = 0; index < ownNames.length; index += 1) {
					if (ownNames[index] !== 'constructor') {
						nameSet.add(ownNames[index]);
					}
				}
			}
			catch { }
			try {
				const reflectKeys: any = Reflect.ownKeys(current);
				for (let index: any = 0; index < reflectKeys.length; index += 1) {
					const key: any = reflectKeys[index];
					if (typeof key === 'string' && key !== 'constructor') {
						nameSet.add(key);
					}
				}
			}
			catch { }
			let next: any = null;
			try {
				next = Object.getPrototypeOf(current);
			}
			catch {
				next = null;
			}
			if (!next || next === Object.prototype || next === Function.prototype) {
				break;
			}
			current = next;
		}
		return Array.from(nameSet);
	}
	// 安全读取对象属性值。
	function getReadableProperty(target?: any, key?: any) {
		try {
			return target[key];
		}
		catch {
			return undefined;
		}
	}
	// 收集枚举风格常量名。
	function collectEnumLikeNames() {
		const enumSet: any = new Set();
		// 从目标对象中提取枚举命名成员。
		function collectFromTarget(target?: any) {
			if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
				return;
			}
			const names: any = collectMemberNames(target, 1);
			for (let index: any = 0; index < names.length; index += 1) {
				const currentName: any = names[index];
				if (/^E[A-Z0-9]+_\w+$/.test(currentName)) {
					enumSet.add(currentName);
				}
			}
		}
		const root: any = getEdaApiRoot(runtimeWindow);
		collectFromTarget(root);
		return Array.from(enumSet).sort();
	}
	// 收集对象中的可调用函数名。
	function collectFunctionNames(target?: any) {
		const members: any = collectMemberNames(target, 2);
		const functionNames: any = [];
		for (let index: any = 0; index < members.length; index += 1) {
			const memberName: any = members[index];
			if (memberName === '__proto__' || memberName === 'prototype') {
				continue;
			}
			const value: any = getReadableProperty(target, memberName);
			if (typeof value === 'function') {
				functionNames.push(memberName);
			}
		}
		functionNames.sort();
		return functionNames;
	}
	// 判断是否为鼠标交互型 API（触发后无需等待用户点击完成）。
	function isMouseInteractiveApiPath(apiPath?: any) {
		const normalizedPath: any = String(normalizeApiPath(apiPath) || '').trim().toLowerCase();
		if (!normalizedPath) {
			return false;
		}
		return normalizedPath.includes('withmouse');
	}
	// 枚举当前可用的 EDA API 模块与方法。
	// args 参数允许指定 moduleKeyword（模块名关键字）与 limit（返回条数，最大 200）用于简易筛选。
	// 返回对象包含成功状态、匹配模块统计、枚举列表与模块详情，方便后续工具链执行。
	function listJlcEdaApis(args?: any) {
		const root: any = getEdaApiRoot(runtimeWindow);
		if (!root) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const inputArgs: any = args && typeof args === 'object' ? args : {};
		const keyword: any = String(inputArgs.moduleKeyword || '').trim().toLowerCase();
		const limitValue: any = Number(inputArgs.limit);
		const limit: any = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(200, Math.floor(limitValue)) : 200;
		const moduleNameSet: any = new Set();
		const discoveredNames: any = collectMemberNames(root, 2);
		for (let index: any = 0; index < discoveredNames.length; index += 1) {
			moduleNameSet.add(discoveredNames[index]);
		}
		const moduleNames: any = Array.from(moduleNameSet).filter((moduleName: any) => {
			if (keyword && !moduleName.toLowerCase().includes(keyword)) {
				return false;
			}
			const moduleValue = getReadableProperty(root, moduleName);
			return !!moduleValue;
		}).sort();
		const modules: any = [];
		for (let index: any = 0; index < moduleNames.length && modules.length < limit; index += 1) {
			const moduleName: any = moduleNames[index];
			const moduleObject: any = getReadableProperty(root, moduleName);
			if (!moduleObject || (typeof moduleObject !== 'object' && typeof moduleObject !== 'function')) {
				continue;
			}
			const methodNames: any = collectFunctionNames(moduleObject);
			if (methodNames.length === 0) {
				continue;
			}
			modules.push({
				module: moduleName,
				methodCount: methodNames.length,
				methods: methodNames,
			});
		}
		const enumNames: any = collectEnumLikeNames();
		return {
			ok: true,
			detectedCandidates: moduleNames.length,
			totalModules: modules.length,
			enumCount: enumNames.length,
			enums: enumNames.slice(0, 120),
			modules,
		};
	}
	// 规范化 API 路径文本。
	function normalizeApiPath(apiPath?: any) {
		return String(apiPath || '').trim();
	}
	// 在当前 EDA 根对象中解析成员。
	function resolveApiMemberInAnyRoot(apiPath?: any) {
		const normalizedPath: any = normalizeApiPath(apiPath);
		if (!normalizedPath) {
			return null;
		}
		const root: any = getEdaApiRoot(runtimeWindow);
		if (!root) {
			return null;
		}
		return resolveApiMember(root, normalizedPath);
	}
	// 将 API 返回值转换为可序列化结果。
	function formatApiRuntimeValue(value?: any) {
		return serializeRuntimeRawValue(value, 8);
	}
	// 执行单次 EDA API 调用。
	// rawApiPath 必须是模块.方法格式，rawArgs 要么省略要么是参数数组，返回调用结果或错误描述。
	async function executeJlcEdaApiCall(rawApiPath?: any, rawArgs?: any) {
		const apiPath: any = normalizeApiPath(rawApiPath);
		if (!apiPath) {
			return { ok: false, error: '缺少 apiPath 参数。' };
		}
		if (!isOfficialApiMethodPath(apiPath)) {
			return {
				ok: false,
				error: 'apiPath 格式错误。',
			};
		}
		const root: any = getEdaApiRoot(runtimeWindow);
		if (!root) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const resolved: any = resolveStrictApiFunction(root, apiPath);
		if (!resolved) {
			return {
				ok: false,
				error: `未找到可调用方法：${apiPath}。`,
			};
		}
		let callArgs: any = [];
		try {
			callArgs = normalizeApiCallArguments(rawArgs);
		}
		catch (error: any) {
			return {
				ok: false,
				apiPath,
				resolvedApiPath: resolved.resolvedApiPath,
				error: formatPrefixedEdaApiError(error),
			};
		}
		try {
			const resolvedApiPath: any = normalizeApiPath(resolved.resolvedApiPath || apiPath);
			const invokePromise: any = Promise.resolve().then(() => {
				return resolved.fn.apply(resolved.context, callArgs);
			});
			if (isMouseInteractiveApiPath(resolvedApiPath)) {
				invokePromise.catch(() => { });
				return {
					ok: true,
					apiPath,
					resolvedApiPath: resolved.resolvedApiPath,
					result: {
						pending: true,
						message: '鼠标交互型 API 已触发，立即返回。',
					},
				};
			}
			const callResult: any = await invokePromise;
			return {
				ok: true,
				apiPath,
				resolvedApiPath: resolved.resolvedApiPath,
				result: formatApiRuntimeValue(callResult),
			};
		}
		catch (error: any) {
			return {
				ok: false,
				apiPath,
				resolvedApiPath: resolved.resolvedApiPath,
				error: formatPrefixedEdaApiError(error),
			};
		}
	}
	return {
		listJlcEdaApis,
		normalizeApiPath,
		resolveApiMemberInAnyRoot,
		formatApiRuntimeValue,
		searchOfflineApiDoc,
		executeJlcEdaApiCall,
	};
}
