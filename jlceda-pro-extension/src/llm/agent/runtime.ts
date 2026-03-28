// 文件说明：定义智能体运行时参数与中止检查等执行控制逻辑。
/**
 * 智能体运行时配置。
 */
export const AI_AGENT_RUNTIME: any = {
	// 单次会话允许的最大智能体步骤数，超过后终止以避免无限循环。
	maxAgentSteps: 1000,
	// 单次工具调用超时时间（秒）。
	toolCallTimeoutSeconds: 10,
	// 模型单次输出允许的最大 token 数。
	modelMaxOutputTokens: 8192,
	// 模型总上下文窗口上限（token）。
	modelContextLimitTokens: 128 * 1024,
	// 为系统指令与额外元数据预留的安全余量（token）。
	modelContextSafeMarginTokens: 4096,
};
/**
 * 检查智能体是否已被中止。
 * @param abortSignal - 中止信号。
 */
export function throwIfAgentAborted(abortSignal?: AbortSignal | null): void {
	if (abortSignal && abortSignal.aborted) {
		throw new DOMException('【诊断信息】用户已停止', 'AbortError');
	}
}
