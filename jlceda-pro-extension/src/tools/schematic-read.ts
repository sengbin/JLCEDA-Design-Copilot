/**
 * ------------------------------------------------------------------------
 * 名称：原理图语义读取工具
 * 说明：实时扫描当前原理图，输出以电路语义为核心的结构化 JSON。
 *       数据来源：sch_PrimitiveComponent（器件与引脚）、sch_PrimitiveWire（导线网络名）。
 *       完全基于 EDA 内存状态，无需生成网表文件，刚修改/刚放置的器件立即可见。
 *       输出侧重 AI 可直接理解的电路连接关系，去除所有几何坐标与方向字段。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-31
 * 备注：取代原有的 schematic-topology 与 schematic-netlist 两个工具。
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface SchematicReadDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

// 安全调用同步 getter 方法，获取指定类型的值。
function getSyncState<T>(obj: unknown, method: string, fallback: T): T {
	try {
		const fn = (obj as Record<string, unknown>)?.[method];
		if (typeof fn === 'function') {
			const result: unknown = (fn as () => unknown).call(obj);
			return result != null ? (result as T) : fallback;
		}
	}
	catch { /* ignore */ }
	return fallback;
}

// 将多段线坐标展开为一组坐标点字符串集合，用于构建坐标→网络名映射。
// getState_Line 返回 [x1, y1, x2, y2, ...] 或 [[x1,y1],[x2,y2],...] 两种形态。
function extractWirePointKeys(lineData: unknown): string[] {
	if (!Array.isArray(lineData) || lineData.length === 0) {
		return [];
	}
	const keys: string[] = [];
	if (Array.isArray(lineData[0])) {
		// [[x1, y1], [x2, y2], ...] 形态
		for (const point of lineData) {
			if (Array.isArray(point) && point.length >= 2) {
				keys.push(`${point[0]}_${point[1]}`);
			}
		}
	}
	else {
		// [x1, y1, x2, y2, ...] 平铺形态
		for (let i = 0; i + 1 < lineData.length; i += 2) {
			keys.push(`${lineData[i]}_${lineData[i + 1]}`);
		}
	}
	return keys;
}

// 引脚连接点的坐标键，用于在坐标→网络名映射中查找。
function buildPinCoordinateKey(x: number, y: number): string {
	return `${x}_${y}`;
}

/**
 * 扫描原理图并输出电路语义 JSON 字符串。
 */
async function readSchematicCircuit(
	root: any,
	safeCall: SchematicReadDeps['safeCall'],
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
	// ── 第一步：获取所有器件实例 ──────────────────────────────────────────
	const componentListRaw = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	if (!Array.isArray(componentListRaw)) {
		return { ok: false, error: '器件列表获取失败，sch_PrimitiveComponent.getAll 未返回数组。' };
	}

	// ── 第二步：构建坐标→网络名映射（来源：导线 + 网络标志器件） ──────────
	// 先收集网络标志器件（VCC/GND 等 Power Flag）的坐标。
	// net flag 的坐标直接作为连接点，net name = getState_Net()。
	const coordinateToNetworkNameMap: Map<string, string> = new Map();

	for (const rawComponent of componentListRaw) {
		const netFlagNetworkName = getSyncState<string>(rawComponent, 'getState_Net', '');
		if (netFlagNetworkName.length > 0) {
			const x = getSyncState<number>(rawComponent, 'getState_X', 0);
			const y = getSyncState<number>(rawComponent, 'getState_Y', 0);
			const key = buildPinCoordinateKey(x, y);
			coordinateToNetworkNameMap.set(key, netFlagNetworkName);
		}
	}

	// 再收集所有导线的坐标及其所属网络名。
	const wireListRaw = await safeCall(() => root.sch_PrimitiveWire.getAll());
	if (Array.isArray(wireListRaw)) {
		for (const rawWire of wireListRaw) {
			const wireName = getSyncState<string>(rawWire, 'getState_Net', '');
			if (wireName.length === 0) {
				continue;
			}
			const lineData: unknown = getSyncState<unknown>(rawWire, 'getState_Line', null);
			for (const key of extractWirePointKeys(lineData)) {
				coordinateToNetworkNameMap.set(key, wireName);
			}
		}
	}

	// ── 第三步：遍历器件，组装语义输出结构 ──────────────────────────────────
	interface PinSemanticInfo {
		pinNumber: string;
		pinSignalName: string;
		pinElectricalType: string;
		connectedNetworkName: string;
		hasNoConnectMark: boolean;
	}

	interface ComponentSemanticInfo {
		componentInstanceId: string;
		componentDesignator: string;
		componentSymbolName: string;
		schematicSubPartName: string;
		pins: PinSemanticInfo[];
	}

	// networkName → Set<pinRef>，pinRef 格式为 "designator.pinNumber"
	const networkToPinRefSetMap: Map<string, Set<string>> = new Map();

	const components: ComponentSemanticInfo[] = [];

	for (const rawComponent of componentListRaw) {
		const componentDesignator = getSyncState<string>(rawComponent, 'getState_Designator', '');
		const netFlagNetworkName = getSyncState<string>(rawComponent, 'getState_Net', '');

		if (componentDesignator.length === 0 && netFlagNetworkName.length === 0) {
			// 既无位号也无网络名，跳过无效图元。
			continue;
		}

		if (netFlagNetworkName.length > 0) {
			// 网络标志器件（VCC/GND 等）：以网络名作为位号，并展示为单引脚语义条目。
			const primitiveId = getSyncState<string>(rawComponent, 'getState_PrimitiveId', '');
			const pinRef = `${netFlagNetworkName}.1`;
			let networkPinSet = networkToPinRefSetMap.get(netFlagNetworkName);
			if (!networkPinSet) {
				networkPinSet = new Set();
				networkToPinRefSetMap.set(netFlagNetworkName, networkPinSet);
			}
			networkPinSet.add(pinRef);
			components.push({
				componentInstanceId: primitiveId,
				componentDesignator: netFlagNetworkName,
				componentSymbolName: netFlagNetworkName,
				schematicSubPartName: '',
				pins: [{
					pinNumber: '1',
					pinSignalName: netFlagNetworkName,
					pinElectricalType: 'power',
					connectedNetworkName: netFlagNetworkName,
					hasNoConnectMark: false,
				}],
			});
			continue;
		}

		// 普通器件：获取所有引脚并查找连接网络名。
		const primitiveId = getSyncState<string>(rawComponent, 'getState_PrimitiveId', '');
		const pinsRaw = await safeCall(() => root.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId));
		if (pinsRaw !== undefined && !Array.isArray(pinsRaw)) {
			return { ok: false, error: `器件 ${componentDesignator} 的引脚列表格式异常。` };
		}

		const pins: PinSemanticInfo[] = [];
		for (const rawPin of Array.isArray(pinsRaw) ? pinsRaw : []) {
			const pinNumber = getSyncState<string>(rawPin, 'getState_PinNumber', '');
			const pinSignalName = getSyncState<string>(rawPin, 'getState_PinName', '');
			const pinElectricalType = getSyncState<string>(rawPin, 'getState_PinType', '');
			const pinConnectionX = getSyncState<number>(rawPin, 'getState_X', 0);
			const pinConnectionY = getSyncState<number>(rawPin, 'getState_Y', 0);
			const hasNoConnectMark = getSyncState<boolean>(rawPin, 'getState_NoConnected', false);

			// 用引脚连接点坐标在导线坐标映射中查找所属网络名。
			const coordinateKey = buildPinCoordinateKey(pinConnectionX, pinConnectionY);
			const connectedNetworkName = coordinateToNetworkNameMap.get(coordinateKey) ?? '';

			// 将引脚引用（如 R1.1）注册到对应网络。
			if (connectedNetworkName.length > 0) {
				const pinRef = `${componentDesignator}.${pinNumber || pinSignalName}`;
				let networkPinSet = networkToPinRefSetMap.get(connectedNetworkName);
				if (!networkPinSet) {
					networkPinSet = new Set();
					networkToPinRefSetMap.set(connectedNetworkName, networkPinSet);
				}
				networkPinSet.add(pinRef);
			}

			pins.push({
				pinNumber,
				pinSignalName,
				pinElectricalType,
				connectedNetworkName,
				hasNoConnectMark,
			});
		}

		components.push({
			componentInstanceId: primitiveId,
			componentDesignator,
			componentSymbolName: getSyncState<string>(rawComponent, 'getState_Name', ''),
			schematicSubPartName: getSyncState<string>(rawComponent, 'getState_SubPartName', ''),
			pins,
		});
	}

	// ── 第四步：将 networkToPinRefSetMap 转为按网络名排序的数组 ────────────
	interface NetworkSemanticInfo {
		networkName: string;
		connectedPinRefs: string[];
	}

	const networks: NetworkSemanticInfo[] = [];
	for (const [networkName, pinRefSet] of networkToPinRefSetMap) {
		networks.push({
			networkName,
			connectedPinRefs: Array.from(pinRefSet).sort(),
		});
	}
	networks.sort((a, b) => a.networkName.localeCompare(b.networkName));

	// ── 第五步：执行 ERC 检查 ────────────────────────────────────────────────
	const ercRawResult = await safeCall(() => root.sch_Drc.check(false, false, true));
	const ercCheckPassed = ercRawResult === true;

	const output = {
		ercCheckPassed,
		componentCount: components.length,
		networkCount: networks.length,
		components,
		networks,
	};

	return { ok: true, data: JSON.stringify(output) };
}

/**
 * 创建原理图语义读取处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 注入的工具依赖。
 * @returns 原理图语义读取处理器。
 */
export function createSchematicReadHandler(runtimeWindow: Window, deps: SchematicReadDeps): {
	handleSchematicReadTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 读取当前原理图的完整电路语义快照。
	async function handleSchematicReadTask(_payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		const result = await readSchematicCircuit(root, safeCall);
		if (!result.ok) {
			return { ok: false, error: result.error };
		}

		return {
			ok: true,
			schematicCircuitSnapshot: result.data,
		};
	}

	return { handleSchematicReadTask };
}
