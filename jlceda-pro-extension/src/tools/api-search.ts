// 文件说明：API 文档检索工具 —— 从离线 API 文档 JSON 中按关键词、范围、命名空间检索 API 条目。

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
const API_DOCUMENT_URI = '/iframe/jlceda-pro-api-doc.json';

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

/**
 * 创建 API 文档检索处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 检索处理器。
 */
export function createApiSearchHandler(runtimeWindow: Window): {
	handleApiSearchTask: (payload: unknown) => Promise<unknown>;
} {
	let apiCache: ApiCache | null = null;

	// 读取并缓存离线 API 文档。
	async function loadApiCache(): Promise<ApiCache> {
		if (apiCache) {
			return apiCache;
		}
		const apiRoot: any = runtimeWindow && (runtimeWindow as any).eda ? (runtimeWindow as any).eda : null;
		const extensionFileSystem: any = apiRoot && apiRoot.sys_FileSystem ? apiRoot.sys_FileSystem : null;
		if (!extensionFileSystem || typeof extensionFileSystem.getExtensionFile !== 'function') {
			throw new Error('离线 API 文档读取失败: 当前环境未检测到可用的扩展文件系统。');
		}
		const extensionFile: any = await extensionFileSystem.getExtensionFile(API_DOCUMENT_URI);
		if (!extensionFile || typeof extensionFile.text !== 'function') {
			throw new Error(`离线 API 文档读取失败: 未找到离线 API 文档文件: ${API_DOCUMENT_URI}`);
		}
		const text: any = String((await extensionFile.text()) || '');
		const parsed: any = JSON.parse(text || '{}');
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
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

	// 处理离线文档检索工具。
	async function handleApiSearchTask(payload: unknown): Promise<unknown> {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
			throw new Error('api/search 任务参数必须为对象。');
		}
		const payloadObject: any = payload as any;
		const query: any = String(payloadObject.query ?? '').trim();
		if (!query) {
			throw new Error('api_search 缺少 query 参数。');
		}
		const scope: any = String(payloadObject.scope ?? 'all').trim().toLowerCase();
		if (!['all', 'callable', 'type'].includes(scope)) {
			throw new Error('scope 仅支持 all/callable/type。');
		}
		const ownerFilter: any = String(payloadObject.owner ?? '').trim().toLowerCase();
		const limit: any = parseBoundedIntegerValue(payloadObject.limit, 10, 1, API_SEARCH_MAX_LIMIT);
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

		const filteredItems = [...scoreById.entries()]
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
			.filter((item): item is NonNullable<typeof item> => item !== null)
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

	return { handleApiSearchTask };
}
