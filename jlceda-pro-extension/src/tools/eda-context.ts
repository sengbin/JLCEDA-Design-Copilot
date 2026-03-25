// 文件说明：EDA 上下文查询工具 —— 读取当前 EDA 运行时状态快照（项目、图页、PCB、选中元素等）。
import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface EdaContextDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
	toSerializableAsync: (value: unknown, depth?: number, seen?: WeakSet<object>) => Promise<unknown>;
}

/**
 * 创建 EDA 上下文查询处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 注入的序列化工具依赖。
 * @returns 上下文查询处理器。
 */
export function createEdaContextHandler(runtimeWindow: Window, deps: EdaContextDeps): {
	handleEdaContextTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall, toSerializableAsync } = deps;

	// 组装当前 EDA 运行时上下文快照。
	async function buildContextSnapshot(scope: string): Promise<Record<string, unknown>> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			throw new Error('当前环境未检测到 EDA API 对象。');
		}
		const root: any = rootUnknown;

		const currentDocumentInfo = await safeCall(() => root.dmt_SelectControl.getCurrentDocumentInfo());
		const currentProjectInfo = await safeCall(() => root.dmt_Project.getCurrentProjectInfo());
		const currentBoardInfo = await safeCall(() => root.dmt_Board.getCurrentBoardInfo());
		const currentSchematicInfo = await safeCall(() => root.dmt_Schematic.getCurrentSchematicInfo());
		const currentSchematicPageInfo = await safeCall(() => root.dmt_Schematic.getCurrentSchematicPageInfo());
		const currentPcbInfo = await safeCall(() => root.dmt_Pcb.getCurrentPcbInfo());
		const currentPanelInfo = await safeCall(() => root.dmt_Panel.getCurrentPanelInfo());
		const selectedPcbPrimitiveIds = await safeCall(() => root.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId()) ?? [];
		const selectedSchPrimitiveIds = await safeCall(() => root.sch_SelectControl.getAllSelectedPrimitives_PrimitiveId()) ?? [];

		return {
			scope,
			capturedAt: new Date().toISOString(),
			currentDocumentInfo: await toSerializableAsync(currentDocumentInfo),
			currentProjectInfo: await toSerializableAsync(currentProjectInfo),
			currentBoardInfo: await toSerializableAsync(currentBoardInfo),
			currentSchematicInfo: await toSerializableAsync(currentSchematicInfo),
			currentSchematicPageInfo: await toSerializableAsync(currentSchematicPageInfo),
			currentPcbInfo: await toSerializableAsync(currentPcbInfo),
			currentPanelInfo: await toSerializableAsync(currentPanelInfo),
			selectedPcbPrimitiveIds: await toSerializableAsync(selectedPcbPrimitiveIds),
			selectedSchPrimitiveIds: await toSerializableAsync(selectedSchPrimitiveIds),
		};
	}

	// 处理上下文查询工具。
	async function handleEdaContextTask(payload: unknown): Promise<unknown> {
		const scope: any = payload && typeof payload === 'object' && !Array.isArray(payload)
			? String((payload as any).scope ?? '').trim()
			: '';
		return await buildContextSnapshot(scope);
	}

	return { handleEdaContextTask };
}
