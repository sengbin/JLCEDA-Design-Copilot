/**
 * ------------------------------------------------------------------------
 * 名称：原理图网表分析工具
 * 说明：执行 ERC 检查并提取完整网表，供 AI 进行功能性审查与电路分析。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-25
 * 备注：无
 * ------------------------------------------------------------------------
 */

import { getEdaApiRoot } from '../utils';

// 依赖接口：由 executor 注入，避免循环引用。
export interface SchematicNetlistAnalyzeDeps {
	safeCall: (executor: () => unknown | Promise<unknown>) => Promise<unknown>;
}

// 获取完整网表文本，供 AI 功能性分析使用。
async function extractNetlistText(root: any, safeCall: SchematicNetlistAnalyzeDeps['safeCall']): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
	const netlistFileRaw = await safeCall(() => root.sch_ManufactureData.getNetlistFile());
	if (!netlistFileRaw || typeof netlistFileRaw !== 'object') {
		return { ok: false, error: '网表文件获取失败，getNetlistFile 返回空值。' };
	}

	const netlistText = await safeCall(() => (netlistFileRaw as File).text());
	if (typeof netlistText !== 'string') {
		return { ok: false, error: '网表内容读取失败。' };
	}

	return { ok: true, data: netlistText };
}

/**
 * 创建原理图网表分析处理器。
 * @param runtimeWindow - 运行时窗口对象。
 * @param deps - 注入的工具依赖。
 * @returns 原理图网表分析处理器。
 */
export function createSchematicNetlistAnalyzeHandler(runtimeWindow: Window, deps: SchematicNetlistAnalyzeDeps): {
	handleSchematicNetlistAnalyzeTask: (payload: unknown) => Promise<unknown>;
} {
	const { safeCall } = deps;

	// 执行 ERC 检查并提取完整网表，供 AI 进行功能性分析。
	async function handleSchematicNetlistAnalyzeTask(_payload: unknown): Promise<unknown> {
		const rootUnknown: unknown = getEdaApiRoot(runtimeWindow);
		if (!rootUnknown || (typeof rootUnknown !== 'object' && typeof rootUnknown !== 'function')) {
			return { ok: false, error: '当前环境未检测到 EDA API 对象。' };
		}
		const root: any = rootUnknown;

		// 第一步：ERC 检查。
		const ercRaw = await safeCall(() => root.sch_Drc.check(false, false, true));
		const ercPassed = ercRaw === true;

		// 第二步：提取完整网表，供 AI 进行功能性分析。
		const extracted = await extractNetlistText(root, safeCall);
		if (!extracted.ok) {
			return {
				ok: false,
				error: extracted.error,
				erc: { passed: ercPassed, rawResult: ercRaw },
			};
		}

		return {
			ok: true,
			erc: { passed: ercPassed, rawResult: ercRaw },
			netlist: extracted.data,
		};
	}

	return { handleSchematicNetlistAnalyzeTask };
}
