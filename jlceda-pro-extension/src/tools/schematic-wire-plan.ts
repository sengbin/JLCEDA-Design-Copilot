/**
 * ------------------------------------------------------------------------
 * 名称：原理图连线规划工具
 * 说明：接收 AI 的逻辑连接声明，从原理图拓扑中自动解析精确坐标并执行
 *       前置安全校验，校验通过后在聊天页进入确认面板流程。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-30
 * 备注：AI 始终无法获取或修改坐标。
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';
import { createWirePlan } from './schematic-wire-plan-store';

/** 连线规划交互协议标识。 */
export const SCHEMATIC_WIRE_PLAN_PROTOCOL: string = 'schematic-wire-plan/v1';

/** 依赖接口：由 executor 注入，避免循环引用。 */
export interface SchematicWirePlanDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

/** 连线确认面板中的单行连接摘要。 */
export interface SchematicWirePlanConnectionRow {
	index: number;
	fromLabel: string;
	toLabel: string;
	netName: string;
}

/** 连线规划交互请求。 */
export interface SchematicWirePlanRequest {
	protocol: string;
	stage: 'wait-net-flags' | 'confirm-plan';
	title: string;
	description: string;
	noticeText: string;
	canConfirm: boolean;
	canCancel: boolean;
	missingSymbols?: string[];
	connections?: SchematicWirePlanConnectionRow[];
	connectionMethod?: 'wire' | 'net-label';
	planId?: string;
}

// WireConnection 仅用于类型注解，从 createWirePlan 参数类型派生，避免双导入冲突。
type WireConnection = Parameters<typeof createWirePlan>[0][number];

// 引脚信息内部结构。
interface InternalPinInfo {
	refDes: string;
	pinSignalName: string;
	pinPadNumber: string;
	electricalType: string;
	hasNoConnectMark: boolean;
	wireConnectionX_mil: number;
	wireConnectionY_mil: number;
	orientationDeg: number;
}

// AI 传入的单条连接声明。
interface ConnectionDeclaration {
	from: { refDes: string; pin: string };
	to: { refDes: string; pin: string };
	netName: string;
}

// 校验错误结构。
interface ValidationError {
	index: number;
	code: string;
	message: string;
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

// 构建等待电源/地符号放置的交互请求。
function buildNetFlagWaitRequest(missingSymbols: string[]): SchematicWirePlanRequest {
	return {
		protocol: SCHEMATIC_WIRE_PLAN_PROTOCOL,
		stage: 'wait-net-flags',
		title: '放置电源/地符号',
		description: '连线规划需要以下电源/地符号，请先在嘉立创 EDA 中手动放置后点击“已放置，继续”。',
		noticeText: '',
		missingSymbols,
		canConfirm: true,
		canCancel: true,
	};
}

// 构建连线确认交互请求。
function buildWirePlanConfirmRequest(planId: string, connections: SchematicWirePlanConnectionRow[]): SchematicWirePlanRequest {
	return {
		protocol: SCHEMATIC_WIRE_PLAN_PROTOCOL,
		stage: 'confirm-plan',
		title: '连线规划确认',
		description: `AI 规划了 ${String(connections.length)} 条连线，请选择连接方式并确认后执行。`,
		noticeText: '',
		connectionMethod: 'net-label',
		planId,
		connections,
		canConfirm: true,
		canCancel: true,
	};
}

// 收集原理图中已存在的 VCC/GND 等网络标识符号名称。
async function collectExistingNetFlagNames(root: any, safeCall: SchematicWirePlanDeps['safeCall']): Promise<Set<string>> {
	const componentListRaw: unknown = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	const names: Set<string> = new Set();
	if (!Array.isArray(componentListRaw)) {
		return names;
	}

	for (const rawComponent of componentListRaw) {
		const netFlagName: string = sg<string>(rawComponent, 'getState_Net', '').trim();
		if (netFlagName.length > 0) {
			names.add(netFlagName.toUpperCase());
		}
	}

	return names;
}

// 连线规划前按需检查：只检查本次 connections 实际引用的 VCC/GND 是否已放置。
async function checkMissingNetFlags(
	root: any,
	declarations: ConnectionDeclaration[],
	safeCall: SchematicWirePlanDeps['safeCall'],
): Promise<string[]> {
	const requiredNetFlags: readonly string[] = ['VCC', 'GND'];
	const referencedFlags: Set<string> = new Set();

	for (const declaration of declarations) {
		const fromRefDes: string = declaration.from.refDes.trim().toUpperCase();
		const toRefDes: string = declaration.to.refDes.trim().toUpperCase();
		const netName: string = declaration.netName.trim().toUpperCase();
		for (const candidate of [fromRefDes, toRefDes, netName]) {
			if (requiredNetFlags.includes(candidate)) {
				referencedFlags.add(candidate);
			}
		}
	}

	if (referencedFlags.size === 0) {
		return [];
	}

	const existingNames: Set<string> = await collectExistingNetFlagNames(root, safeCall);
	const missingSymbols: string[] = [];
	for (const requiredName of requiredNetFlags) {
		if (referencedFlags.has(requiredName) && !existingNames.has(requiredName)) {
			missingSymbols.push(requiredName);
		}
	}
	return missingSymbols;
}

// 构建引脚查找表：键为 REFDES:PINPAD 或 REFDES:PINSIGNAL（均小写）。
async function buildPinLookup(root: any, safeCall: SchematicWirePlanDeps['safeCall']): Promise<Map<string, InternalPinInfo> | { error: string }> {
	const componentListRaw: unknown = await safeCall(() => root.sch_PrimitiveComponent.getAll(undefined, true));
	if (!Array.isArray(componentListRaw)) {
		return { error: '器件列表获取失败，sch_PrimitiveComponent.getAll 未返回数组。' };
	}

	const lookup: Map<string, InternalPinInfo> = new Map();

	for (const rawComponent of componentListRaw) {
		const refDes: string = sg<string>(rawComponent, 'getState_Designator', '').trim();
		const netFlagName: string = sg<string>(rawComponent, 'getState_Net', '').trim();

		if (refDes.length > 0) {
			const primitiveId: string = sg<string>(rawComponent, 'getState_PrimitiveId', '');
			const pinsRaw: unknown = await safeCall(() => root.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId));
			if (!Array.isArray(pinsRaw)) {
				continue;
			}

			for (const rawPin of pinsRaw) {
				const pinSignalName: string = sg<string>(rawPin, 'getState_PinName', '').trim();
				const pinPadNumber: string = sg<string>(rawPin, 'getState_PinNumber', '').trim();
				const electricalType: string = sg<string>(rawPin, 'getState_PinType', '').trim();
				const info: InternalPinInfo = {
					refDes,
					pinSignalName,
					pinPadNumber,
					electricalType,
					hasNoConnectMark: sg<boolean>(rawPin, 'getState_NoConnected', false),
					wireConnectionX_mil: sg<number>(rawPin, 'getState_X', 0),
					wireConnectionY_mil: sg<number>(rawPin, 'getState_Y', 0),
					orientationDeg: sg<number>(rawPin, 'getState_Rotation', 0),
				};

				const refDesLower: string = refDes.toLowerCase();
				if (pinPadNumber.length > 0) {
					lookup.set(`${refDesLower}:${pinPadNumber.toLowerCase()}`, info);
				}
				if (pinSignalName.length > 0 && pinSignalName.toLowerCase() !== pinPadNumber.toLowerCase()) {
					lookup.set(`${refDesLower}:${pinSignalName.toLowerCase()}`, info);
				}
			}
		}
		else if (netFlagName.length > 0) {
			const netNameLower: string = netFlagName.toLowerCase();
			let powerOrientationDeg: number;
			if (/gnd|ground|earth|vss/.test(netNameLower)) {
				powerOrientationDeg = 90;
			}
			else if (/vcc|vdd|vbat|pwr|3v|5v|12v|1v/.test(netNameLower)) {
				powerOrientationDeg = 270;
			}
			else {
				powerOrientationDeg = 270;
			}

			const info: InternalPinInfo = {
				refDes: netFlagName,
				pinSignalName: netFlagName,
				pinPadNumber: '1',
				electricalType: 'power',
				hasNoConnectMark: false,
				wireConnectionX_mil: sg<number>(rawComponent, 'getState_X', 0),
				wireConnectionY_mil: sg<number>(rawComponent, 'getState_Y', 0),
				orientationDeg: powerOrientationDeg,
			};

			lookup.set(`${netNameLower}:1`, info);
			lookup.set(`${netNameLower}:${netNameLower}`, info);
		}
	}

	return lookup;
}

// 按 refDes + pin（信号名或编号）查找引脚信息。
function lookupPin(pinLookup: Map<string, InternalPinInfo>, refDes: string, pin: string): InternalPinInfo | undefined {
	return pinLookup.get(`${refDes.trim().toLowerCase()}:${pin.trim().toLowerCase()}`);
}

// 解析并校验单条连接声明中的端点字段。
function parseConnectionDeclaration(raw: unknown, index: number): ConnectionDeclaration | { error: string } {
	if (!isPlainObjectRecord(raw)) {
		return { error: `connections[${String(index)}] 必须为对象。` };
	}
	if (!isPlainObjectRecord(raw.from)) {
		return { error: `connections[${String(index)}].from 必须为对象。` };
	}
	if (!isPlainObjectRecord(raw.to)) {
		return { error: `connections[${String(index)}].to 必须为对象。` };
	}

	const fromRefDes: string = String(raw.from.refDes ?? '').trim();
	const fromPin: string = String(raw.from.pin ?? '').trim();
	const toRefDes: string = String(raw.to.refDes ?? '').trim();
	const toPin: string = String(raw.to.pin ?? '').trim();
	const netName: string = String(raw.netName ?? '').trim();

	if (fromRefDes.length === 0 || fromPin.length === 0) {
		return { error: `connections[${String(index)}].from.refDes / .pin 不能为空。` };
	}
	if (toRefDes.length === 0 || toPin.length === 0) {
		return { error: `connections[${String(index)}].to.refDes / .pin 不能为空。` };
	}
	if (netName.length === 0) {
		return { error: `connections[${String(index)}].netName 不能为空。` };
	}

	return {
		from: { refDes: fromRefDes, pin: fromPin },
		to: { refDes: toRefDes, pin: toPin },
		netName,
	};
}

// 执行完整校验并生成 planId。
async function resolveWirePlan(
	root: any,
	declarations: ConnectionDeclaration[],
	safeCall: SchematicWirePlanDeps['safeCall'],
): Promise<unknown> {
	const powerNetNames: Set<string> = new Set(['VCC', 'GND']);
	const powerEndpointErrors: string[] = [];
	for (let index = 0; index < declarations.length; index += 1) {
		const declaration: ConnectionDeclaration = declarations[index];
		const netName: string = declaration.netName.trim().toUpperCase();
		if (!powerNetNames.has(netName)) {
			continue;
		}

		const fromRefDes: string = declaration.from.refDes.trim().toUpperCase();
		const toRefDes: string = declaration.to.refDes.trim().toUpperCase();
		if (!powerNetNames.has(fromRefDes) && !powerNetNames.has(toRefDes)) {
			powerEndpointErrors.push(
				`connections[${String(index)}]：netName 为 "${netName}"，但 from.refDes="${declaration.from.refDes}" 和 to.refDes="${declaration.to.refDes}" 均不是 VCC/GND 符号端点。接电源/地时必须将 from 或 to 的 refDes 设为 "VCC" 或 "GND"，并将 pin 设为 "VCC" 或 "GND"。`,
			);
		}
	}
	if (powerEndpointErrors.length > 0) {
		return {
			ok: false,
			errorCode: 'POWER_ENDPOINT_MISSING',
			error: '连线规划被拒绝：以下连接的 netName 是电源/地网络，但没有指定 VCC/GND 符号作为端点。请修正后重新提交。',
			validationErrors: powerEndpointErrors,
		};
	}

	const lookupResult: Map<string, InternalPinInfo> | { error: string } = await buildPinLookup(root, safeCall);
	if ('error' in lookupResult) {
		return { ok: false, error: lookupResult.error };
	}
	const pinLookup: Map<string, InternalPinInfo> = lookupResult;

	const pinNetAssignment: Map<string, string> = new Map();
	const validationErrors: ValidationError[] = [];
	const resolvedConnections: WireConnection[] = [];

	for (let index = 0; index < declarations.length; index += 1) {
		const declaration: ConnectionDeclaration = declarations[index];
		const fromInfo: InternalPinInfo | undefined = lookupPin(pinLookup, declaration.from.refDes, declaration.from.pin);
		if (!fromInfo) {
			validationErrors.push({
				index,
				code: 'ENDPOINT_NOT_FOUND',
				message: `connections[${String(index)}].from：在原理图中未找到器件 "${declaration.from.refDes}" 的引脚 "${declaration.from.pin}"。请检查位号和引脚名/编号是否正确。`,
			});
			continue;
		}

		const toInfo: InternalPinInfo | undefined = lookupPin(pinLookup, declaration.to.refDes, declaration.to.pin);
		if (!toInfo) {
			validationErrors.push({
				index,
				code: 'ENDPOINT_NOT_FOUND',
				message: `connections[${String(index)}].to：在原理图中未找到器件 "${declaration.to.refDes}" 的引脚 "${declaration.to.pin}"。请检查位号和引脚名/编号是否正确。`,
			});
			continue;
		}

		if (fromInfo.hasNoConnectMark) {
			validationErrors.push({
				index,
				code: 'NO_CONNECT_PIN',
				message: `connections[${String(index)}].from：器件 "${declaration.from.refDes}" 的引脚 "${declaration.from.pin}" 已标记 No Connect，不可参与连线。`,
			});
		}
		if (toInfo.hasNoConnectMark) {
			validationErrors.push({
				index,
				code: 'NO_CONNECT_PIN',
				message: `connections[${String(index)}].to：器件 "${declaration.to.refDes}" 的引脚 "${declaration.to.pin}" 已标记 No Connect，不可参与连线。`,
			});
		}

		const fromPinKey: string = `${declaration.from.refDes.toLowerCase()}:${declaration.from.pin.toLowerCase()}`;
		const toPinKey: string = `${declaration.to.refDes.toLowerCase()}:${declaration.to.pin.toLowerCase()}`;
		const existingFromNet: string | undefined = pinNetAssignment.get(fromPinKey);
		if (existingFromNet !== undefined && existingFromNet !== declaration.netName) {
			validationErrors.push({
				index,
				code: 'PIN_IN_MULTIPLE_NETS',
				message: `connections[${String(index)}].from：引脚 "${declaration.from.refDes} ${declaration.from.pin}" 在本规划中已被分配到网络 "${existingFromNet}"，与当前网络 "${declaration.netName}" 冲突。`,
			});
		}
		const existingToNet: string | undefined = pinNetAssignment.get(toPinKey);
		if (existingToNet !== undefined && existingToNet !== declaration.netName) {
			validationErrors.push({
				index,
				code: 'PIN_IN_MULTIPLE_NETS',
				message: `connections[${String(index)}].to：引脚 "${declaration.to.refDes} ${declaration.to.pin}" 在本规划中已被分配到网络 "${existingToNet}"，与当前网络 "${declaration.netName}" 冲突。`,
			});
		}

		const fromPower: boolean = fromInfo.electricalType.toLowerCase() === 'power';
		const toPower: boolean = toInfo.electricalType.toLowerCase() === 'power';
		if (fromPower && toPower && fromInfo.pinSignalName.toLowerCase() !== toInfo.pinSignalName.toLowerCase()) {
			validationErrors.push({
				index,
				code: 'POWER_SHORT_CIRCUIT',
				message: `connections[${String(index)}]：不能将两个不同信号的电源类型引脚直接连线（"${fromInfo.pinSignalName}" 与 "${toInfo.pinSignalName}"），这会造成电源短路。请使用正确的电源网络。`,
			});
		}

		pinNetAssignment.set(fromPinKey, declaration.netName);
		pinNetAssignment.set(toPinKey, declaration.netName);

		if (!validationErrors.some(item => item.index === index)) {
			resolvedConnections.push({
				fromRefDes: fromInfo.refDes,
				fromPin: declaration.from.pin,
				toRefDes: toInfo.refDes,
				toPin: declaration.to.pin,
				netName: declaration.netName,
				fromX_mil: fromInfo.wireConnectionX_mil,
				fromY_mil: fromInfo.wireConnectionY_mil,
				toX_mil: toInfo.wireConnectionX_mil,
				toY_mil: toInfo.wireConnectionY_mil,
				fromOrientationDeg: fromInfo.orientationDeg,
				toOrientationDeg: toInfo.orientationDeg,
			});
		}
	}

	if (validationErrors.length > 0) {
		return {
			ok: false,
			error: `连线规划校验失败，发现 ${String(validationErrors.length)} 个错误，整个规划已拒绝。请修正后重新提交。`,
			validationErrors,
		};
	}

	const planId: string = createWirePlan(resolvedConnections);
	const connectionSummaries: SchematicWirePlanConnectionRow[] = declarations.map((declaration, index) => ({
		index,
		fromLabel: `${declaration.from.refDes} 引脚 ${declaration.from.pin}`,
		toLabel: `${declaration.to.refDes} 引脚 ${declaration.to.pin}`,
		netName: declaration.netName,
	}));

	return {
		ok: true,
		wirePlan: buildWirePlanConfirmRequest(planId, connectionSummaries),
	};
}

/**
 * 创建原理图连线规划处理器。
 * @param runtimeWindow 运行时窗口对象。
 * @param deps 注入的工具依赖。
 * @returns 原理图连线规划处理器。
 */
export function createSchematicWirePlanHandler(runtimeWindow: Window, deps: SchematicWirePlanDeps): {
	handleSchematicWirePlanTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 处理连线规划任务，并按需返回聊天页交互协议。
	async function handleSchematicWirePlanTask(payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		if (!isPlainObjectRecord(payload) || !Array.isArray(payload.connections)) {
			return { ok: false, error: 'schematic_wire_plan 任务缺少 connections 数组。' };
		}

		const declarations: ConnectionDeclaration[] = [];
		for (let index = 0; index < payload.connections.length; index += 1) {
			const parsed: ConnectionDeclaration | { error: string } = parseConnectionDeclaration(payload.connections[index], index);
			if ('error' in parsed) {
				return { ok: false, error: parsed.error };
			}
			declarations.push(parsed);
		}

		if (declarations.length === 0) {
			return { ok: false, error: 'connections 数组不能为空。' };
		}

		const missingNetFlags: string[] = await checkMissingNetFlags(root, declarations, safeCall);
		if (missingNetFlags.length > 0) {
			return {
				ok: true,
				wirePlan: buildNetFlagWaitRequest(missingNetFlags),
				_continueAfterNetFlagPlaced: async (): Promise<unknown> => {
					const stillMissingNetFlags: string[] = await checkMissingNetFlags(root, declarations, safeCall);
					if (stillMissingNetFlags.length > 0) {
						return {
							ok: false,
							message: `重新检查后仍缺少以下电源/地符号：${stillMissingNetFlags.join('、')}。连线规划已终止，请先在 EDA 中放置这些符号后重试。`,
						};
					}
					return await resolveWirePlan(root, declarations, safeCall);
				},
			};
		}

		return await resolveWirePlan(root, declarations, safeCall);
	}

	return { handleSchematicWirePlanTask };
}
