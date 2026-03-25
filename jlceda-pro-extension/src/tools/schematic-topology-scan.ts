/**
 * ------------------------------------------------------------------------
 * 名称：原理图拓扑扫描工具
 * 说明：提取当前原理图器件拓扑信息（含坐标、引脚详情），为自动连线分析提供数据基础。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-25
 * 备注：无
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface SchematicTopologyScanDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

// 安全调用同步 getter 方法，获取指定类型的值。
function sg<T>(obj: unknown, method: string, fallback: T): T {
	try {
		const fn = (obj as Record<string, unknown>)?.[method];
		if (typeof fn === 'function') {
			const result: unknown = (fn as () => unknown).call(obj);
			return result as T;
		}
	}
	catch { /* ignore */ }
	return fallback;
}

// 按当前原理图器件图元构建原理图拓扑快照，包含连线分析所需的器件、引脚与几何信息。
async function extractSchematicTopology(root: any, safeCall: SchematicTopologyScanDeps['safeCall']): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
	const componentListRaw = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	if (!Array.isArray(componentListRaw)) {
		return { ok: false, error: '器件列表获取失败，sch_PrimitiveComponent.getAll 未返回数组。' };
	}

	const components: Array<{
		primitiveId: string;
		reference: string;
		name: string;
		x: number;
		y: number;
		rotation: number;
		mirror: boolean;
		footprintUuid: string;
		subPartName: string;
		pins: Array<{
			primitiveId: string;
			pinName: string;
			pinNumber: string;
			pinType: string;
			x: number;
			y: number;
			rotation: number;
			pinLength: number;
			noConnected: boolean;
		}>;
	}> = [];

	for (const rawComponent of componentListRaw) {
		const reference = sg<string>(rawComponent, 'getState_Designator', '');
		// 跳过没有位号的虚拟器件。
		if (!reference)
			continue;

		const primitiveId = sg<string>(rawComponent, 'getState_PrimitiveId', '');
		const footprintRaw = await safeCall(() => (rawComponent as any).getState_Footprint());
		const footprintUuid = footprintRaw && typeof footprintRaw === 'object'
			? String((footprintRaw as { uuid?: unknown }).uuid ?? '')
			: '';

		const pinsRaw = await safeCall(() => root.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId));
		if (pinsRaw !== undefined && !Array.isArray(pinsRaw)) {
			return { ok: false, error: `器件 ${reference} 的引脚列表格式异常。` };
		}

		const pins: Array<{
			primitiveId: string;
			pinName: string;
			pinNumber: string;
			pinType: string;
			x: number;
			y: number;
			rotation: number;
			pinLength: number;
			noConnected: boolean;
		}> = [];
		for (const rawPin of Array.isArray(pinsRaw) ? pinsRaw : []) {
			pins.push({
				primitiveId: sg<string>(rawPin, 'getState_PrimitiveId', ''),
				pinName: sg<string>(rawPin, 'getState_PinName', ''),
				pinNumber: sg<string>(rawPin, 'getState_PinNumber', ''),
				pinType: sg<string>(rawPin, 'getState_PinType', ''),
				x: sg<number>(rawPin, 'getState_X', 0),
				y: sg<number>(rawPin, 'getState_Y', 0),
				rotation: sg<number>(rawPin, 'getState_Rotation', 0),
				pinLength: sg<number>(rawPin, 'getState_PinLength', 0),
				noConnected: sg<boolean>(rawPin, 'getState_NoConnected', false),
			});
		}

		components.push({
			primitiveId,
			reference,
			name: sg<string>(rawComponent, 'getState_Name', ''),
			x: sg<number>(rawComponent, 'getState_X', 0),
			y: sg<number>(rawComponent, 'getState_Y', 0),
			rotation: sg<number>(rawComponent, 'getState_Rotation', 0),
			mirror: sg<boolean>(rawComponent, 'getState_Mirror', false),
			footprintUuid,
			subPartName: sg<string>(rawComponent, 'getState_SubPartName', ''),
			pins,
		});
	}

	return { ok: true, data: JSON.stringify({ components }) };
}

/**
 * 创建原理图拓扑扫描处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 注入的工具依赖。
 * @returns 原理图拓扑扫描处理器。
 */
export function createSchematicTopologyScanHandler(runtimeWindow: Window, deps: SchematicTopologyScanDeps): {
	handleSchematicTopologyScanTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 构建原理图拓扑快照，包含连线分析所需的器件与引脚信息。
	async function handleSchematicTopologyScanTask(_payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		const extracted = await extractSchematicTopology(root, safeCall);
		if (!extracted.ok) {
			return { ok: false, error: extracted.error };
		}

		return {
			ok: true,
			schematicTopology: extracted.data,
		};
	}

	return { handleSchematicTopologyScanTask };
}
