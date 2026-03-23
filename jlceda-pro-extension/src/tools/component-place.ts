// ------------------------------------------------------------------------
// 名称：器件交互放置工具处理器
// 说明：接收已选定的器件列表，生成原理图交互式放置任务协议，
//       由独立 UI 模块逐个引导用户在原理图中完成器件放置。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-03-24
// 备注：放置面板渲染与执行逻辑见 component-place-ui.ts
// ------------------------------------------------------------------------

/** 器件交互放置协议标识。 */
export const COMPONENT_PLACE_PROTOCOL: string = 'component-place/v1';

/** 单个待放置器件信息。 */
export interface ComponentPlaceItem {
	uuid: string;
	libraryUuid: string;
	name: string;
	footprintName: string;
	subPartName: string;
}

/** 器件放置请求结构（嵌入工具返回值的 placement 字段）。 */
export interface ComponentPlaceRequest {
	protocol: string;
	title: string;
	description: string;
	components: ComponentPlaceItem[];
	timeoutSeconds: number;
	retryCount: number;
}

// 判断输入是否为普通对象。
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 规范化单个待放置器件参数。
function normalizeComponentPlaceItem(raw: unknown, index: number): ComponentPlaceItem {
	if (!isPlainObjectRecord(raw)) {
		throw new Error(`components[${String(index)}] 必须为对象。`);
	}
	const uuid: string = String(raw.uuid ?? '').trim();
	const libraryUuid: string = String(raw.libraryUuid ?? '').trim();
	if (!uuid) {
		throw new Error(`components[${String(index)}].uuid 不能为空。`);
	}
	if (!libraryUuid) {
		throw new Error(`components[${String(index)}].libraryUuid 不能为空。`);
	}
	return {
		uuid,
		libraryUuid,
		name: String(raw.name ?? '').trim(),
		footprintName: String(raw.footprintName ?? '').trim(),
		subPartName: String(raw.subPartName ?? '').trim(),
	};
}

// 解析超时参数，未提供时使用默认值。
function resolveTimeoutSeconds(rawValue: unknown): number {
	if (rawValue === undefined || rawValue === null || rawValue === '') {
		return 60;
	}
	const timeoutSeconds: number = Number(rawValue);
	if (!Number.isFinite(timeoutSeconds)) {
		throw new TypeError('timeoutSeconds 必须为数字。');
	}
	if (!Number.isInteger(timeoutSeconds)) {
		throw new TypeError('timeoutSeconds 必须为整数。');
	}
	if (timeoutSeconds < 30 || timeoutSeconds > 180) {
		throw new Error('timeoutSeconds 超出允许范围，必须在 30 到 180 秒之间。');
	}
	return timeoutSeconds;
}

/**
 * 创建器件交互放置工具处理器。
 * @returns 器件交互放置处理器。
 */
export function createComponentPlaceHandler() {
	async function handleComponentPlaceTask(payload?: unknown): Promise<unknown> {
		if (!isPlainObjectRecord(payload)) {
			return { ok: false, error: 'component_place 任务参数必须为对象。' };
		}

		const rawComponents: unknown = payload.components;
		if (!Array.isArray(rawComponents)) {
			return { ok: false, error: '缺少 components 参数，且其必须为数组。' };
		}
		if (rawComponents.length < 1) {
			return { ok: false, error: 'components 不能为空，至少需要提供一个待放置器件。' };
		}
		if (rawComponents.length > 50) {
			return { ok: false, error: 'components 数量过多，单次最多允许 50 个器件。' };
		}

		let timeoutSeconds: number;
		try {
			timeoutSeconds = resolveTimeoutSeconds(payload.timeoutSeconds);
		}
		catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : String(error ?? '');
			return { ok: false, error: message || 'timeoutSeconds 参数无效。' };
		}

		let components: ComponentPlaceItem[];
		try {
			components = rawComponents.map((item: unknown, index: number): ComponentPlaceItem => {
				return normalizeComponentPlaceItem(item, index);
			});
		}
		catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : String(error ?? '');
			return { ok: false, error: message || 'components 参数无效。' };
		}

		const placement: ComponentPlaceRequest = {
			protocol: COMPONENT_PLACE_PROTOCOL,
			title: '原理图器件放置',
			description: `请按顺序在原理图中放置以下 ${String(components.length)} 个器件。单个器件超时后，工具会在当前尝试结束后自动重试 1 次。`,
			components,
			timeoutSeconds,
			retryCount: 1,
		};

		return {
			ok: true,
			placement,
			message: `已创建 ${String(components.length)} 个器件的交互放置任务。`,
		};
	}

	return { handleComponentPlaceTask };
}
