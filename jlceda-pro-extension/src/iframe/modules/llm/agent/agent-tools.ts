// 文件说明：封装智能体系统提示词构建与工具处理器映射生成逻辑。
/**
 * 构建智能体系统提示词。
 * 输入工具定义列表，输出系统提示词。
 */
export function buildAgentSystemPrompt(): string {
	return [
		'你是嘉立创 EDA AI 设计助理。',
		'如果不确定要调用的API路径，就先检索离线文档。',
	].join('\n');
}
/**
 * 构建工具处理器映射。
 * 输入工具执行依赖，输出工具处理器对象。
 */
export function buildToolHandlers(deps: any): Record<string, (args: any) => Promise<any>> {
	const dependencyObject: any = deps && typeof deps === 'object' ? deps : {};
	const listJlcEdaApis: any = dependencyObject.listJlcEdaApis;
	const normalizeApiPath: any = dependencyObject.normalizeApiPath;
	const resolveApiMemberInAnyRoot: any = dependencyObject.resolveApiMemberInAnyRoot;
	const formatApiRuntimeValue: any = dependencyObject.formatApiRuntimeValue;
	const searchOfflineApiDoc: any = dependencyObject.searchOfflineApiDoc;
	const executeJlcEdaApiCall: any = dependencyObject.executeJlcEdaApiCall;
	return {
		// 工具：jlceda_list_apis；功能：列出当前环境可用的 EDA API 模块与方法。
		async jlceda_list_apis(args?: any) {
			return listJlcEdaApis(args);
		},
		// 工具：jlceda_get_api_member；功能：读取指定 API 路径对应成员信息。
		async jlceda_get_api_member(args?: any) {
			const apiPath: any = normalizeApiPath(args.apiPath);
			if (!apiPath) {
				return { ok: false, error: '缺少 apiPath 参数。' };
			}
			const resolved: any = resolveApiMemberInAnyRoot(apiPath);
			if (!resolved) {
				return { ok: false, error: `未找到 API 成员：${apiPath}。` };
			}
			return {
				ok: true,
				apiPath,
				resolvedApiPath: resolved.resolvedApiPath || apiPath,
				valueType: typeof resolved.value,
				value: formatApiRuntimeValue(resolved.value),
			};
		},
		// 工具：jlceda_search_offline_api_doc；功能：在离线 API 文档中检索关键字。
		async jlceda_search_offline_api_doc(args?: any) {
			return await searchOfflineApiDoc(args);
		},
		// 工具：jlceda_call_api；功能：执行一次指定的 EDA API 调用。
		async jlceda_call_api(args?: any) {
			return await executeJlcEdaApiCall(args.apiPath, args.args);
		},
	};
}
