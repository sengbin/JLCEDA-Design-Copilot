// ------------------------------------------------------------------------
// 名称：器件选型工具处理器
// 说明：接收 AI 描述的器件关键词，调用 EDA 系统库 API 搜索候选器件，
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
	async function handleComponentSelectTask(payload?: unknown): Promise<unknown> {
		const args = (payload !== null && typeof payload === 'object' && !Array.isArray(payload)
			? payload
			: {}) as Record<string, unknown>;

		const keyword: string = String(args.keyword ?? '').trim();
		if (!keyword) {
			return { ok: false, error: '缺少器件搜索关键词，请提供 keyword 参数。' };
		}

		// 限制最大返回数量，最少 2 个，最多 20 个，默认 8 个。
		const limitRaw: number = Number(args.limit);
		const limit: number = Number.isFinite(limitRaw) && limitRaw > 0
			? Math.min(Math.max(Math.round(limitRaw), 2), 20)
			: 8;

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

		let rawResults: unknown[];
		try {
			// 调用系统库搜索：key=关键词, itemsOfPage=最大返回数, page=1
			rawResults = await libDevice.search(keyword, undefined, undefined, undefined, limit, 1);
		}
		catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : String(error ?? '');
			return { ok: false, error: `器件搜索失败：${message}` };
		}

		if (!Array.isArray(rawResults) || rawResults.length === 0) {
			return {
				ok: false,
				error: `未在系统库中找到匹配"${keyword}"的器件，请尝试修改关键词重新搜索。`,
			};
		}

		const candidates: ComponentSelectCandidate[] = rawResults
			.slice(0, limit)
			.map(mapDeviceSearchItem)
			.filter(item => Boolean(item.uuid) && Boolean(item.libraryUuid));

		if (candidates.length === 0) {
			return {
				ok: false,
				error: `搜索结果数据异常，候选器件均缺少必要的 uuid/libraryUuid 字段，无法继续选型。`,
			};
		}

		// 返回选型交互协议，前端检测到此协议后渲染交互面板。
		return {
			ok: true,
			selection: {
				protocol: COMPONENT_SELECT_PROTOCOL,
				title: `器件选型：${keyword}`,
				description: `以下是在系统库中搜索到的 ${String(candidates.length)} 个候选器件，请选择合适的一个：`,
				candidates,
			} satisfies ComponentSelectRequest,
		};
	}

	return { handleComponentSelectTask };
}
