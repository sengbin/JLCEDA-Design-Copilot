/**
 * ------------------------------------------------------------------------
 * 名称：原理图连线执行工具
 * 说明：根据已确认的 planId 与连接方式执行导线或网络标签连线，完成后
 *       返回逐条结果、ERC 状态以及悬空引脚检查结果。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-30
 * 备注：仅执行已通过规划校验的连线任务。
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';
import { getWirePlan } from './schematic-wire-plan-store';

/** 依赖接口：由 executor 注入，避免循环引用。 */
export interface SchematicWireExecuteDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

// 单条连接的执行结果。
interface ConnectionResult {
	index: number;
	fromLabel: string;
	toLabel: string;
	netName: string;
	method: 'wire' | 'net-label';
	status: 'success' | 'failed';
	errorMessage?: string;
}

// 网络标签图元实例。
interface NetLabelPrimitive {
	delete: () => boolean;
}

// 判断输入是否为普通对象。
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 安全调用同步 getter 方法，获取指定类型的值。
function sg<T>(obj: unknown, method: string, fallback: T): T {
	try {
		const fn = (obj as Record<string, unknown>)?.[method];
		if (typeof fn === 'function') {
			const result: unknown = (fn as () => unknown).call(obj);
			return result != null ? result as T : fallback;
		}
	}
	catch { /* ignore */ }
	return fallback;
}

// 尝试通过实例方法删除属性图元（网络标签）。
function tryDeleteAttributePrimitive(primitive: unknown): void {
	if (!primitive || typeof (primitive as Record<string, unknown>).delete !== 'function') {
		return;
	}
	try {
		(primitive as NetLabelPrimitive).delete();
	}
	catch { /* ignore */ }
}

// 计算两点间的曼哈顿折线路径。
function buildManhattanPath(
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	_fromOrientationDeg: number,
	toOrientationDeg: number,
): number[] {
	if (fromX === toX || fromY === toY) {
		return [fromX, fromY, toX, toY];
	}

	const normalizedToOrientation: number = ((toOrientationDeg % 360) + 360) % 360;
	if (normalizedToOrientation === 0 || normalizedToOrientation === 180) {
		return [fromX, fromY, toX, fromY, toX, toY];
	}

	return [fromX, fromY, fromX, toY, toX, toY];
}

// 执行单条网络标签连接。
async function executeNetLabelConnection(
	root: any,
	safeCall: SchematicWireExecuteDeps['safeCall'],
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	netName: string,
): Promise<{ success: boolean; errorMessage?: string }> {
	const fromLabel: unknown = await safeCall(() => root.sch_PrimitiveAttribute.createNetLabel(fromX, fromY, netName));
	if (fromLabel === undefined || fromLabel === null) {
		return { success: false, errorMessage: `从端（${String(fromX)}, ${String(fromY)}）放置网络标签失败，API 返回 undefined。` };
	}

	const toLabel: unknown = await safeCall(() => root.sch_PrimitiveAttribute.createNetLabel(toX, toY, netName));
	if (toLabel === undefined || toLabel === null) {
		tryDeleteAttributePrimitive(fromLabel);
		return { success: false, errorMessage: `至端（${String(toX)}, ${String(toY)}）放置网络标签失败，API 返回 undefined；已回滚从端标签。` };
	}

	return { success: true };
}

// 执行单条导线连接。
async function executeWireConnection(
	root: any,
	safeCall: SchematicWireExecuteDeps['safeCall'],
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	netName: string,
	fromOrientationDeg: number,
	toOrientationDeg: number,
): Promise<{ success: boolean; errorMessage?: string }> {
	const path: number[] = buildManhattanPath(fromX, fromY, toX, toY, fromOrientationDeg, toOrientationDeg);
	const wireResult: unknown = await safeCall(() => root.sch_PrimitiveWire.create(path, netName));
	if (wireResult === undefined || wireResult === null) {
		return { success: false, errorMessage: `导线创建失败，sch_PrimitiveWire.create 返回 undefined。坐标：[${path.join(', ')}]。` };
	}
	return { success: true };
}

// 提取网表并建立 REF:PIN -> NET 的查找表。
async function buildNetMap(root: any, safeCall: SchematicWireExecuteDeps['safeCall']): Promise<Map<string, string>> {
	const netMap: Map<string, string> = new Map();
	const netlistFileRaw: unknown = await safeCall(() => root.sch_ManufactureData.getNetlistFile());
	if (!netlistFileRaw || typeof netlistFileRaw !== 'object' || typeof (netlistFileRaw as File).text !== 'function') {
		return netMap;
	}

	const netlistText: unknown = await safeCall(() => (netlistFileRaw as File).text());
	if (typeof netlistText !== 'string' || netlistText.trim().length === 0) {
		return netMap;
	}

	let parsedNetlist: unknown;
	try {
		parsedNetlist = JSON.parse(netlistText);
	}
	catch {
		return netMap;
	}

	if (!isPlainObjectRecord(parsedNetlist) || !isPlainObjectRecord(parsedNetlist.components)) {
		return netMap;
	}

	for (const [, componentValue] of Object.entries(parsedNetlist.components)) {
		if (!isPlainObjectRecord(componentValue) || !isPlainObjectRecord(componentValue.props)) {
			continue;
		}
		const designator: string = String(componentValue.props.Designator ?? '').trim();
		if (!designator || !isPlainObjectRecord(componentValue.pinInfoMap)) {
			continue;
		}
		for (const [pinNumber, pinInfo] of Object.entries(componentValue.pinInfoMap)) {
			const netName: string = isPlainObjectRecord(pinInfo) ? String(pinInfo.net ?? '').trim() : '';
			netMap.set(`${designator}:${pinNumber}`, netName);
		}
	}

	return netMap;
}

// 检查原理图中有封装的器件是否存在悬空引脚。
async function checkFloatingPins(root: any, safeCall: SchematicWireExecuteDeps['safeCall']): Promise<string[]> {
	const warnings: string[] = [];
	const netMap: Map<string, string> = await buildNetMap(root, safeCall);
	if (netMap.size === 0) {
		return warnings;
	}

	const componentListRaw: unknown = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	if (!Array.isArray(componentListRaw)) {
		return warnings;
	}

	for (const rawComponent of componentListRaw) {
		const designator: string = sg<string>(rawComponent, 'getState_Designator', '').trim();
		if (designator.length === 0) {
			continue;
		}

		const footprintRaw: unknown = await safeCall(() => (rawComponent as any).getState_Footprint());
		const footprintUuid: string = footprintRaw && typeof footprintRaw === 'object'
			? String((footprintRaw as { uuid?: unknown }).uuid ?? '')
			: '';
		if (footprintUuid.length === 0) {
			continue;
		}

		const primitiveId: string = sg<string>(rawComponent, 'getState_PrimitiveId', '');
		const pinsRaw: unknown = await safeCall(() => root.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId));
		if (!Array.isArray(pinsRaw)) {
			continue;
		}

		for (const rawPin of pinsRaw) {
			if (sg<boolean>(rawPin, 'getState_NoConnected', false)) {
				continue;
			}
			const pinPadNumber: string = sg<string>(rawPin, 'getState_PinNumber', '').trim();
			const pinSignalName: string = sg<string>(rawPin, 'getState_PinName', '').trim();
			const netName: string = netMap.get(`${designator}:${pinPadNumber}`) ?? '';
			if (netName.length > 0) {
				continue;
			}

			const pinLabel: string = pinSignalName.length > 0 && pinSignalName !== pinPadNumber
				? `${pinPadNumber}(${pinSignalName})`
				: pinPadNumber;
			warnings.push(`${designator} 引脚 ${pinLabel} 悬空，未连接任何网络。`);
		}
	}

	return warnings;
}

/**
 * 创建原理图连线执行处理器。
 * @param runtimeWindow 运行时窗口对象。
 * @param deps 注入的工具依赖。
 * @returns 原理图连线执行处理器。
 */
export function createSchematicWireExecuteHandler(runtimeWindow: Window, deps: SchematicWireExecuteDeps): {
	handleSchematicWireExecuteTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 执行已确认的连线规划。
	async function handleSchematicWireExecuteTask(payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		if (!isPlainObjectRecord(payload)) {
			return { ok: false, error: 'schematic_wire_execute 任务参数必须为对象。' };
		}

		const planId: string = String(payload.planId ?? '').trim();
		if (planId.length === 0) {
			return { ok: false, error: '缺少 planId 参数。' };
		}

		const connectionMethodRaw: string = String(payload.connectionMethod ?? '').trim().toLowerCase();
		if (connectionMethodRaw !== 'wire' && connectionMethodRaw !== 'net-label') {
			return { ok: false, error: `connectionMethod 必须为 "wire" 或 "net-label"，收到："${connectionMethodRaw}"。` };
		}
		const connectionMethod: 'wire' | 'net-label' = connectionMethodRaw as 'wire' | 'net-label';

		const plan = getWirePlan(planId);
		if (!plan) {
			return { ok: false, error: `未找到 planId 为 "${planId}" 的连线规划。该规划可能已过期（超过 30 分钟），请重新调用 schematic_wire_plan 生成规划。` };
		}

		const results: ConnectionResult[] = [];
		let successCount = 0;
		let failedCount = 0;

		for (let index = 0; index < plan.connections.length; index += 1) {
			const connection = plan.connections[index];
			const fromLabel: string = `${connection.fromRefDes} 引脚 ${connection.fromPin}`;
			const toLabel: string = `${connection.toRefDes} 引脚 ${connection.toPin}`;

			const executeResult = connectionMethod === 'net-label'
				? await executeNetLabelConnection(root, safeCall, connection.fromX_mil, connection.fromY_mil, connection.toX_mil, connection.toY_mil, connection.netName)
				: await executeWireConnection(root, safeCall, connection.fromX_mil, connection.fromY_mil, connection.toX_mil, connection.toY_mil, connection.netName, connection.fromOrientationDeg, connection.toOrientationDeg);

			if (executeResult.success) {
				successCount += 1;
				results.push({
					index,
					fromLabel,
					toLabel,
					netName: connection.netName,
					method: connectionMethod,
					status: 'success',
				});
			}
			else {
				failedCount += 1;
				results.push({
					index,
					fromLabel,
					toLabel,
					netName: connection.netName,
					method: connectionMethod,
					status: 'failed',
					errorMessage: executeResult.errorMessage,
				});
			}
		}

		const ercRaw: unknown = await safeCall(() => root.sch_Drc.check(false, false, true));
		const ercPassed: boolean = ercRaw === true;
		const floatingWarnings: string[] = await checkFloatingPins(root, safeCall);
		const baseMessage: string = failedCount === 0
			? `全部 ${String(plan.connections.length)} 条连线执行完成。ERC 状态：${ercPassed ? '通过' : '存在错误，请检查原理图'}.`
			: `${String(successCount)} / ${String(plan.connections.length)} 条连线成功，${String(failedCount)} 条失败。请检查失败原因后重新规划失败的连线。`;
		const warningText: string = floatingWarnings.length > 0
			? `\n\n⚠️ 检测到以下器件存在悬空引脚，连线可能不正确，请检查并重新规划：\n${floatingWarnings.map(item => `  • ${item}`).join('\n')}`
			: '';

		return {
			ok: true,
			planId,
			connectionMethod,
			totalConnections: plan.connections.length,
			successCount,
			failedCount,
			results,
			erc: { passed: ercPassed, rawResult: ercRaw },
			floatingPinWarnings: floatingWarnings,
			message: `${baseMessage}${warningText}`,
		};
	}

	return { handleSchematicWireExecuteTask };
}
