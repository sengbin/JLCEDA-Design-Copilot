// ------------------------------------------------------------------------
// 名称：器件选型工具处理器
// 说明：接收 AI 描述的器件关键词，调用 EDA 立创商城 API 搜索候选器件，
//       返回选型交互协议数据，供前端面板渲染交互选择。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-03-23
// 备注：交互面板渲染逻辑见 component-select-ui.ts
// ------------------------------------------------------------------------
import { getEdaApiRoot } from '../utils';

/** 器件选型交互协议标识。 */
export const COMPONENT_SELECT_PROTOCOL: string = 'component-select/v1';

/** 单个候选器件信息。 */
export interface ComponentSelectCandidate {
	uuid: string;
	libraryUuid: string;
	name: string;
	symbolName: string;
	footprintName: string;
	description: string;
	manufacturer: string;
	manufacturerId: string;
	supplier: string;
	supplierId: string;
	lcscInventory: number;
	lcscPrice: number;
}

/** 器件选型请求结构（嵌入工具返回值的 selection 字段）。 */
export interface ComponentSelectRequest {
	protocol: string;
	title: string;
	description: string;
	candidates: ComponentSelectCandidate[];
	pageSize: number;
	currentPage: number;
}

/** 缺少单位符号的歧义数值关键词模式，例如 1k、100n、10u。 */
const AMBIGUOUS_VALUE_TOKEN_PATTERN: RegExp = /^\d+(?:\.\d+)?[kmgunp]$/i;

/** 需要对数值参数强制单位的器件类型关键词。 */
const VALUE_UNIT_REQUIRED_COMPONENT_KEYWORDS: readonly string[] = [
	'电阻',
	'resistor',
	'电容',
	'capacitor',
	'cap',
	'电感',
	'inductor',
];

/** 禁止走器件选型流程的电源/地符号关键词。 */
const NET_FLAG_KEYWORDS: ReadonlySet<string> = new Set([
	'vcc',
	'gnd',
	'ground',
	'power',
	'vdd',
	'vss',
	'电源',
	'地',
	'电源符号',
	'地符号',
	'vcc符号',
	'gnd符号',
	'power symbol',
	'ground symbol',
]);

// 判断当前关键词是否属于电阻/电容/电感这类需要对阻值、容值、感值强制单位的器件。
function keywordRequiresValueUnit(keyword: string): boolean {
	const normalizedKeyword: string = keyword.toLowerCase();
	return VALUE_UNIT_REQUIRED_COMPONENT_KEYWORDS.some(componentKeyword => normalizedKeyword.includes(componentKeyword));
}

// 检查关键词中是否存在缺少单位符号的数值参数。
function findKeywordTokenMissingUnit(keyword: string): string | null {
	if (!keywordRequiresValueUnit(keyword)) {
		return null;
	}

	const keywordTokens: string[] = keyword.split(/\s+/).map(token => token.trim()).filter(Boolean);
	for (const keywordToken of keywordTokens) {
		const normalizedToken: string = keywordToken.replace(/^[,，;；]+|[,，;；]+$/g, '');
		if (!normalizedToken || !/\d/.test(normalizedToken)) {
			continue;
		}
		if (AMBIGUOUS_VALUE_TOKEN_PATTERN.test(normalizedToken)) {
			return normalizedToken;
		}
	}
	return null;
}

// 将 EDA lib_Device.search 原始返回项映射为候选器件结构。
function mapDeviceSearchItem(raw: unknown): ComponentSelectCandidate {
	const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		uuid: String(item.uuid ?? ''),
		libraryUuid: String(item.libraryUuid ?? item.libraryuuid ?? ''),
		name: String(item.name ?? ''),
		symbolName: String(item.symbolName ?? item.symbolname ?? ''),
		footprintName: String(item.footprintName ?? item.footprintname ?? ''),
		description: String(item.description ?? ''),
		manufacturer: String(item.manufacturer ?? ''),
		manufacturerId: String(item.manufacturerId ?? item.manufacturerid ?? ''),
		supplier: String(item.supplier ?? ''),
		supplierId: String(item.supplierId ?? item.supplierid ?? ''),
		lcscInventory: Number(item.lcscInventory ?? item.lcscinventory ?? 0),
		lcscPrice: Number(item.lcscPrice ?? item.lcscprice ?? 0),
	};
}

/**
 * 创建器件选型工具处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 器件选型处理器。
 */
export function createComponentSelectHandler(runtimeWindow: Window) {
	const skippedSelectKeywords: Set<string> = new Set();

	async function handleComponentSelectTask(payload?: unknown): Promise<unknown> {
		const args = (payload !== null && typeof payload === 'object' && !Array.isArray(payload)
			? payload
			: {}) as Record<string, unknown>;

		const keyword: string = String(args.keyword ?? '').trim();
		if (!keyword) {
			return { ok: false, error: '缺少器件搜索关键词，请提供 keyword 参数。' };
		}

		const normalizedKeyword: string = keyword.toLowerCase();
		if (NET_FLAG_KEYWORDS.has(normalizedKeyword)) {
			return {
				ok: false,
				errorCode: 'NET_FLAG_NOT_SELECTABLE',
				message: `电源/地符号（${keyword}）不需要选型，也不能通过 component_place 放置。电源/地符号需要用户在 EDA 中手动放置。`,
			};
		}

		if (skippedSelectKeywords.has(normalizedKeyword)) {
			return {
				ok: true,
				skipped: true,
				skipReason: 'user-already-skipped',
				message: `用户已跳过“${keyword}”的器件选型，禁止重试。请直接进行下一步。`,
			};
		}

		const keywordTokenMissingUnit: string | null = findKeywordTokenMissingUnit(keyword);
		if (keywordTokenMissingUnit) {
			return {
				ok: false,
				error: `电阻、电容、电感这类器件的阻值/容值/感值必须带单位符号，检测到“${keywordTokenMissingUnit}”缺少单位。请改为带单位的写法后重试，例如电阻使用 1kΩ，电容使用 100nF，电感使用 10uH。`,
			};
		}

		// 限制每页显示数量，最少 2 个，最多 20 个，默认 20 个。
		const limitRaw: number = Number(args.limit);
		const pageSize: number = Number.isFinite(limitRaw) && limitRaw > 0
			? Math.min(Math.max(Math.round(limitRaw), 2), 20)
			: 20;

		const root: unknown = getEdaApiRoot(runtimeWindow);
		if (root === null || typeof root !== 'object') {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}

		const libDevice = (root as Record<string, unknown>).lib_Device as
			| { search: (key: string, libraryUuid?: string, classification?: unknown, symbolType?: unknown, itemsOfPage?: number, page?: number) => Promise<unknown[]> }
			| undefined;

		if (!libDevice || typeof libDevice.search !== 'function') {
			return {
				ok: false,
				error: '未找到 eda.lib_Device.search API，请确认当前 EDA 版本支持器件库搜索。',
			};
		}

		// 调用 API 获取指定页数据。
		async function fetchApiPage(page: number): Promise<unknown[]> {
			return await libDevice!.search(keyword, undefined, undefined, undefined, pageSize, page);
		}

		let rawResults: unknown[];
		try {
			rawResults = await fetchApiPage(1);
		}
		catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : String(error ?? '');
			return { ok: false, error: `器件搜索失败：${message}` };
		}

		if (!Array.isArray(rawResults) || rawResults.length === 0) {
			return {
				ok: false,
				error: `未在立创商城中找到匹配"${keyword}"的器件，请尝试修改关键词重新搜索。`,
			};
		}

		const candidates: ComponentSelectCandidate[] = rawResults
			.map(mapDeviceSearchItem)
			.filter(item => Boolean(item.uuid) && Boolean(item.libraryUuid));

		if (candidates.length === 0) {
			return {
				ok: false,
				error: `搜索结果数据异常，候选器件均缺少必要的 uuid/libraryUuid 字段，无法继续选型。`,
			};
		}

		// 构建返回结果，附加翻页回调（运行时函数，不参与 JSON 序列化）。
		const resultObj: Record<string, unknown> = {
			ok: true,
			selection: {
				protocol: COMPONENT_SELECT_PROTOCOL,
				title: `器件选型：${keyword}`,
				description: `以下是系统库中"${keyword}"的搜索结果，每页 ${String(pageSize)} 个，请选择合适的一个：`,
				candidates,
				pageSize,
				currentPage: 1,
			} satisfies ComponentSelectRequest,
			_selectionKeyword: keyword,
		};
		resultObj._markKeywordSkipped = (): void => {
			skippedSelectKeywords.add(normalizedKeyword);
		};
		// 翻页回调：由 UI 层在用户点击上一页/下一页时调用，返回指定页候选器件列表。
		resultObj._fetchPage = async (page: number): Promise<ComponentSelectCandidate[]> => {
			const pageRaw: unknown[] = await fetchApiPage(page);
			return Array.isArray(pageRaw)
				? pageRaw.map(mapDeviceSearchItem).filter(item => Boolean(item.uuid) && Boolean(item.libraryUuid))
				: [];
		};
		return resultObj;
	}

	return { handleComponentSelectTask };
}
