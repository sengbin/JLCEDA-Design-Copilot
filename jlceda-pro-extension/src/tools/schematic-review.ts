/**
 * ------------------------------------------------------------------------
 * 名称：全工程原理图审查工具
 * 说明：调用 sch_ManufactureData.getNetlistFile 获取全工程（所有原理图页面）的网表文件，
 *       将网表文本直接输出供 AI 分析，覆盖多页原理图的所有器件与网络连接关系。
 *       适合全局电路审查、BOM 核查、跨页信号追踪，不适合放置器件后的实时验证。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-31
 * 备注：与 schematic-read 互补：schematic-read 仅覆盖当前页且实时，本工具覆盖全工程页面但有延迟。
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface SchematicReviewDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

/**
 * 创建全工程原理图审查处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 依赖接口。
 * @returns 处理器对象。
 */
export function createSchematicReviewHandler(runtimeWindow: Window, deps: SchematicReviewDeps): {
	handleSchematicReviewTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 读取全工程网表文本。
	async function handleSchematicReviewTask(_payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		// ── 第一步：执行 DRC 检查 ────────────────────────────────────────────────
		const drcRawResult = await safeCall(() => root.sch_Drc.check(false, false, true));
		const drcCheckPassed = drcRawResult === true;

		// ── 第二步：获取全工程网表 ───────────────────────────────────────────────
		const netlistFile: unknown = await safeCall(() => root.sch_ManufactureData.getNetlistFile());
		if (!netlistFile) {
			return {
				ok: false,
				error: '网表文件获取失败，sch_ManufactureData.getNetlistFile 返回空。',
			};
		}

		const netlistFileObj = netlistFile as { text?: () => Promise<string> };
		if (typeof netlistFileObj.text !== 'function') {
			return { ok: false, error: '网表文件对象格式异常，无法读取文本内容。' };
		}

		const netlistText: string = await netlistFileObj.text();
		if (!netlistText || netlistText.trim().length === 0) {
			return { ok: false, error: '网表文件内容为空，请确认原理图不为空。' };
		}

		return {
			ok: true,
			drcCheckPassed,
			netlistText,
		};
	}

	return { handleSchematicReviewTask };
}
