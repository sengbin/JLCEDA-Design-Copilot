import type { LlmAdapter } from './types';
// 文件说明：LLM 适配器简单工厂 —— 按端点、模型名称和 API 格式分发到对应适配器。
import { createAnthropicAdapter } from './anthropic';
import { createDeepSeekAdapter } from './deepseek';
import { createOpenAIChatAdapter } from './openai-chat';
import { createOpenAIResponsesAdapter } from './openai-responses';

/**
 * 根据请求配置创建对应的 LLM 适配器（策略模式）。
 *
 * 分发优先级：
 * 1. apiFormat === 'anthropic'             → Anthropic Messages API
 * 2. endpoint 以 /responses 结尾           → OpenAI v1/responses
 * 3. modelName 以 deepseek- 开头（不区分大小写）→ DeepSeek
 * 4. 默认                                  → OpenAI chat/completions
 *
 * @param params - 适配器选择参数。
 * @param params.endpoint - 请求端点 URL。
 * @param params.modelName - 模型名称。
 * @param params.apiFormat - API 格式标识（如 'anthropic'）。
 * @returns 对应的 LLM 适配器实例。
 */
export function createLlmAdapter(params: { endpoint: string; modelName: string; apiFormat: string }): LlmAdapter {
	if (params.apiFormat === 'anthropic') {
		return createAnthropicAdapter();
	}
	if (params.endpoint.endsWith('/responses')) {
		return createOpenAIResponsesAdapter();
	}
	if (String(params.modelName || '').trim().toLowerCase().startsWith('deepseek')) {
		return createDeepSeekAdapter();
	}
	return createOpenAIChatAdapter();
}
