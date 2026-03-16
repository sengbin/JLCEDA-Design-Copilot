// 文件说明：封装智能体系统提示词构建与工具处理器映射生成逻辑。

// 构建智能体系统提示词。
export function buildAgentSystemPrompt(): string {
	return [
		'你是嘉立创 EDA 专业版智能操作助手，能够通过调用嘉立创 EDA API 完成原理图设计、PCB 布局、元件搜索、网络连接、设计检验、制造文件导出等各类电子设计任务。',
	].join('\n');
}

// 安全执行处理器。
async function runHandler(handler: unknown, args: unknown, toolName: string): Promise<unknown> {
	if (typeof handler !== 'function') {
		return {
			ok: false,
			error: `${toolName} 处理器未初始化。`,
		};
	}
	return await (handler as (payload: unknown) => Promise<unknown>)(args);
}

// 构建工具处理器映射。
export function buildToolHandlers(deps: any): Record<string, (args: any) => Promise<any>> {
	const dependencyObject: any = deps && typeof deps === 'object' ? deps : {};
	const handleApiSearchTask: any = dependencyObject.handleApiSearchTask;
	const handleContextTask: any = dependencyObject.handleContextTask;
	const handleInvokeTask: any = dependencyObject.handleInvokeTask;

	return {
		// 工具：jlceda_api_search；功能：检索离线 API 文档。
		async jlceda_api_search(args?: any) {
			return await runHandler(handleApiSearchTask, args, 'jlceda_api_search');
		},
		// 工具：jlceda_context_get；功能：读取当前 EDA 运行时上下文快照。
		async jlceda_context_get(args?: any) {
			return await runHandler(handleContextTask, args, 'jlceda_context_get');
		},
		// 工具：jlceda_api_invoke；功能：按 apiFullName 与参数执行 EDA API。
		async jlceda_api_invoke(args?: any) {
			return await runHandler(handleInvokeTask, args, 'jlceda_api_invoke');
		},
	};
}
