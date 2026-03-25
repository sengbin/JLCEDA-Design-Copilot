// 文件说明：EDA API 调用工具 —— 按 apiFullName 路径解析并执行 EDA API 方法。
import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface ApiInvokeDeps {
	toSerializableAsync: (value: unknown, depth?: number, seen?: WeakSet<object>) => Promise<unknown>;
	activeBlobUrls: Set<string>;
}

const FORBIDDEN_SEGMENT_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

// 判断输入是否为普通对象。
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 判断输入是否为可访问成员的对象。
function isObjectLikeRecord(value: unknown): value is Record<string, unknown> {
	return (typeof value === 'object' || typeof value === 'function') && value !== null;
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

// 解析 API 调用目标。
function resolveApiCallable(runtimeWindow: Window, apiFullName: string): {
	callable: (...args: unknown[]) => unknown;
	thisArg: unknown;
	resolvedPath: string;
} {
	const normalized: any = apiFullName.trim();
	if (!normalized) {
		throw new Error('缺少 apiFullName。');
	}
	const segments: string[] = normalized.split('.');
	if (segments.length < 3 || segments.some(item => !item)) {
		throw new Error(`apiFullName 格式非法: "${apiFullName}"。正确格式为 eda.模块名.方法名（以"."分隔的至少三段路径）。`);
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

/**
 * 创建 EDA API 调用处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 注入的序列化工具依赖。
 * @returns API 调用处理器与路径解析工具。
 */
export function createApiInvokeHandler(runtimeWindow: Window, deps: ApiInvokeDeps): {
	handleApiInvokeTask: (payload: unknown) => Promise<unknown>;
	resolveApiMemberInAnyRoot: (apiPath: string) => { context?: unknown; value?: unknown } | null;
} {
	const { toSerializableAsync } = deps;

	// 解析任意 API 路径成员，供页面侧兼容逻辑使用。
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

	// 处理 API 调用工具。
	async function handleApiInvokeTask(payload: unknown): Promise<unknown> {
		if (!isPlainObjectRecord(payload)) {
			throw new Error('invoke 任务参数必须为对象。');
		}
		const apiFullName: any = String(payload.apiFullName ?? '').trim();
		const { callable, thisArg, resolvedPath } = resolveApiCallable(runtimeWindow, apiFullName);
		const argsJsonText: any = typeof payload.args === 'string' ? payload.args.trim() : '';
		const parsed: unknown = argsJsonText ? JSON.parse(argsJsonText) : [];
		const invokeArgs: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
		const invokeResult: unknown = await Promise.resolve(callable.apply(thisArg, invokeArgs));
		return {
			apiFullName: resolvedPath,
			argsCount: invokeArgs.length,
			result: await toSerializableAsync(invokeResult),
		};
	}

	return { handleApiInvokeTask, resolveApiMemberInAnyRoot };
}
