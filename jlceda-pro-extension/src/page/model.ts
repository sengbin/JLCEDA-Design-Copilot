// 文件说明：封装聊天页模型配置、模型选择读写与模型能力相关通用逻辑。
import { readApiFormatMapByPlatform, readFixedEndpointMapByPlatform, readImagePayloadModeMapByPlatform, readInitialModelMapByPlatform, readModelConfigMapByPlatform, readPlatformConfigs } from '../platform/platform';
/**
 * 聊天页模型配置常量。
 */
export const CHAT_MODEL_CONFIG_CONSTANTS: any = {
	storageKey: 'jlceda-design-copilot-ai-model-config',
	modelSelectPlaceholderText: '请选择平台',
	modelSelectionKey: 'jlceda-design-copilot-model-selection',
	imageAttachmentLimit: 5,
	modelConfigMap: readModelConfigMapByPlatform(),
	modelImagePayloadMode: readImagePayloadModeMapByPlatform(),
	modelApiFormatMap: readApiFormatMapByPlatform(),
} as const;
/**
 * 解析模型图片载荷模式。
 * @param modelValue - 模型标识。
 * @returns 图片载荷模式。
 */
export function resolveImagePayloadMode(modelValue: unknown): string {
	const normalizedValue: any = String(modelValue || '').trim();
	return CHAT_MODEL_CONFIG_CONSTANTS.modelImagePayloadMode[normalizedValue] || '';
}
/**
 * 判断模型是否支持图片上传。
 * @param modelValue - 模型标识。
 * @returns 是否支持。
 */
export function isImageUploadEnabled(modelValue: unknown): boolean {
	return !!resolveImagePayloadMode(modelValue);
}
/**
 * 解析模型 API 格式。
 * @param modelValue - 模型标识（平台 id）。
 * @returns API 格式字符串，如 'anthropic'，未配置时返回空字符串。
 */
export function resolveApiFormat(modelValue: unknown): string {
	const normalizedValue: any = String(modelValue || '').trim();
	return CHAT_MODEL_CONFIG_CONSTANTS.modelApiFormatMap[normalizedValue] || '';
}
/**
 * 读取本地模型选择。
 * @param modelSelectionKey - 本地存储键名。
 * @returns 模型标识。
 */
export function readModelSelectionFromStorage(modelSelectionKey: string): string {
	try {
		return String(localStorage.getItem(modelSelectionKey) || '').trim();
	}
	catch {
		return '';
	}
}
/**
 * 写入本地模型选择。
 * @param modelSelectionKey - 本地存储键名。
 * @param value - 模型标识。
 */
export function persistModelSelectionToStorage(modelSelectionKey: string, value: string): void {
	try {
		if (value) {
			localStorage.setItem(modelSelectionKey, value);
		}
		else {
			localStorage.removeItem(modelSelectionKey);
		}
	}
	catch { }
}
/**
 * 读取模型选择值。
 * @param modelSelectionKey - 本地存储键名。
 * @returns 模型标识。
 */
export function readModelSelection(modelSelectionKey: string): string {
	return readModelSelectionFromStorage(modelSelectionKey);
}
/**
 * 写入模型选择值。
 * @param modelSelectionKey - 本地存储键名。
 * @param value - 模型标识。
 */
export function persistModelSelection(modelSelectionKey: string, value: string): void {
	persistModelSelectionToStorage(modelSelectionKey, value);
}
/**
 * 规范化模型配置。
 * @param configObject - 原始配置对象。
 * @returns 规范化配置。
 */
export function normalizeModelConfig(configObject: unknown): Record<string, string> | null {
	if (!configObject || typeof configObject !== 'object') {
		return null;
	}
	const configObjectAny: any = configObject as any;
	const fixedEndpointMap: any = readFixedEndpointMapByPlatform();
	const initialModelMap: any = readInitialModelMapByPlatform();
	const platformList: any = readPlatformConfigs();
	const normalizedConfig: Record<string, string> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		normalizedConfig[platformItem.keyField] = String(configObjectAny[platformItem.keyField] || '').trim();
		normalizedConfig[platformItem.modelField] = String(configObjectAny[platformItem.modelField] || initialModelMap[platformItem.id] || '').trim();
		// 自定义平台的终结点由用户填写，不存在固定值，从已保存配置中读取。
		const fixedEndpoint: any = String(fixedEndpointMap[platformItem.id] || '').trim();
		normalizedConfig[platformItem.endpointField] = fixedEndpoint || String(configObjectAny[platformItem.endpointField] || '').trim();
	}
	return normalizedConfig;
}
/**
 * 读取本地模型配置。
 * @param storageKey - 本地存储键名。
 * @returns 模型配置。
 */
export function readModelConfig(storageKey: string): Record<string, string> | null {
	try {
		const raw: any = localStorage.getItem(storageKey);
		if (!raw) {
			return null;
		}
		const parsed: any = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}
		return normalizeModelConfig(parsed);
	}
	catch {
		return null;
	}
}
/**
 * 读取聊天页模型配置。
 * @param storageKey - 本地存储键名。
 * @returns 模型配置。
 */
export function readConfig(storageKey: string): Record<string, string> | null {
	return readModelConfig(storageKey);
}
/**
 * 解析模型值对应的平台配置。
 * @param modelConfigMap - 模型配置映射。
 * @param value - 模型值。
 * @returns 平台配置或 null。
 */
export function resolveModelConfig(modelConfigMap: Record<string, unknown>, value: unknown): Record<string, unknown> | null {
	const normalizedValue: any = String(value || '').trim();
	if (!normalizedValue) {
		return null;
	}
	const modelConfigMapAny: any = modelConfigMap as any;
	return modelConfigMap && typeof modelConfigMap === 'object'
		? (modelConfigMapAny[normalizedValue] || null)
		: null;
}
/**
 * 规范化模型服务地址。
 * @param url - 原始地址。
 * @returns 规范化地址。
 */
export function getNormalizedEndpoint(url: unknown): string {
	return String(url || '').trim();
}
