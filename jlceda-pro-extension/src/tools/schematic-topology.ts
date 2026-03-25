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
export interface SchematicTopologyDeps {
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
async function extractSchematicTopology(root: any, safeCall: SchematicTopologyDeps['safeCall']): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
	const componentListRaw = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	if (!Array.isArray(componentListRaw)) {
		return { ok: false, error: '器件列表获取失败，sch_PrimitiveComponent.getAll 未返回数组。' };
	}

	const components: Array<{
		componentInstanceId: string; // 器件实例 ID，唯一标识当前原理图中的该器件实例
		designator: string; // 位号，如 R1、C1、U1
		symbolName: string; // 原理图符号名称
		centerX_mil: number; // 器件中心点 X 坐标，单位 mil，原理图坐标系
		centerY_mil: number; // 器件中心点 Y 坐标，单位 mil，原理图坐标系
		rotationDeg: number; // 旋转角度，单位：度，顺时针为正
		isMirroredHorizontally: boolean; // 是否水平镜像
		pcbFootprintUuid: string; // 对应 PCB 封装的 UUID
		schematicSubPartName: string; // 多子件器件中的当前子件名称，单子件器件为空
		pins: Array<{
			pinInstanceId: string; // 引脚实例 ID，唯一标识该引脚
			pinSignalName: string; // 引脚信号名称，如 VCC、GND、PA0
			pinPadNumber: string; // 引脚编号，与封装焊盘编号对应，如 1、2、A1
			pinElectricalType: string; // 引脚电气类型，如 input、output、power、passive 等
			wireConnectionX_mil: number; // 引脚导线连接点 X 坐标，单位 mil，用于连线分析
			wireConnectionY_mil: number; // 引脚导线连接点 Y 坐标，单位 mil，用于连线分析
			orientationDeg: number; // 引脚朝向角度，单位：度，表示引脚伸出方向
			pinLength_mil: number; // 引脚长度，单位 mil
			hasNoConnectMark: boolean; // 是否放置了 No Connect 标记（X），true 表示该引脚不参与任何连线
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
			pinInstanceId: string; // 引脚实例 ID，唯一标识该引脚
			pinSignalName: string; // 引脚信号名称，如 VCC、GND、PA0
			pinPadNumber: string; // 引脚编号，与封装焊盘编号对应，如 1、2、A1
			pinElectricalType: string; // 引脚电气类型，如 input、output、power、passive 等
			wireConnectionX_mil: number; // 引脚导线连接点 X 坐标，单位 mil，用于连线分析
			wireConnectionY_mil: number; // 引脚导线连接点 Y 坐标，单位 mil，用于连线分析
			orientationDeg: number; // 引脚朝向角度，单位：度，表示引脚伸出方向
			pinLength_mil: number; // 引脚长度，单位 mil
			hasNoConnectMark: boolean; // 是否放置了 No Connect 标记（X），true 表示该引脚不参与任何连线
		}> = [];
		for (const rawPin of Array.isArray(pinsRaw) ? pinsRaw : []) {
			pins.push({
				pinInstanceId: sg<string>(rawPin, 'getState_PrimitiveId', ''),
				pinSignalName: sg<string>(rawPin, 'getState_PinName', ''),
				pinPadNumber: sg<string>(rawPin, 'getState_PinNumber', ''),
				pinElectricalType: sg<string>(rawPin, 'getState_PinType', ''),
				wireConnectionX_mil: sg<number>(rawPin, 'getState_X', 0),
				wireConnectionY_mil: sg<number>(rawPin, 'getState_Y', 0),
				orientationDeg: sg<number>(rawPin, 'getState_Rotation', 0),
				pinLength_mil: sg<number>(rawPin, 'getState_PinLength', 0),
				hasNoConnectMark: sg<boolean>(rawPin, 'getState_NoConnected', false),
			});
		}

		components.push({
			componentInstanceId: primitiveId,
			designator: reference,
			symbolName: sg<string>(rawComponent, 'getState_Name', ''),
			centerX_mil: sg<number>(rawComponent, 'getState_X', 0),
			centerY_mil: sg<number>(rawComponent, 'getState_Y', 0),
			rotationDeg: sg<number>(rawComponent, 'getState_Rotation', 0),
			isMirroredHorizontally: sg<boolean>(rawComponent, 'getState_Mirror', false),
			pcbFootprintUuid: footprintUuid,
			schematicSubPartName: sg<string>(rawComponent, 'getState_SubPartName', ''),
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
export function createSchematicTopologyHandler(runtimeWindow: Window, deps: SchematicTopologyDeps): {
	handleSchematicTopologyTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 构建原理图拓扑快照，包含连线分析所需的器件与引脚信息。
	async function handleSchematicTopologyTask(_payload: unknown): Promise<unknown> {
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

	return { handleSchematicTopologyTask };
}
