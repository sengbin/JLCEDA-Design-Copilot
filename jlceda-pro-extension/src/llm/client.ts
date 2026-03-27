// 文件说明：模型调用配置校验。
/**
 * 校验模型调用配置。
 * @param config - 模型配置。
 * @param normalizeEndpoint - 地址规范化函数。
 * @returns 规范化后的调用参数。
 */
export function validateModelRequestConfig(config: Record<string, unknown>, normalizeEndpoint: (url: unknown) => string): {
endpoint: string;
modelName: string;
apiKey: string;
} {
const endpoint: any = normalizeEndpoint(config.apiUrl);
if (!endpoint) {
throw new Error('API URL 无效，请先在"设置"中设置。');
}
const apiKey: any = String(config.apiKey || '').trim();
if (!apiKey) {
throw new Error('API Key 为空，请先在"设置"中设置。');
}
const modelName: any = String(config.model || '').trim();
if (!modelName) {
throw new Error('模型名称为空，请先在"设置"中配置。');
}
return { endpoint, modelName, apiKey };
}