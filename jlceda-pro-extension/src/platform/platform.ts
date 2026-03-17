import platformConfigJson from './platform.json';
// 文件说明：封装平台配置 JSON 的读取与结构化转换。
/**
 * 平台配置项类型。
 */
export interface PlatformConfigItem {
	id: string;
	label: string;
	entryUrl: string;
	endpoint: string;
	keyField: string;
	endpointField: string;
	modelField: string;
	model: string;
	imagePayloadMode: string;
	isCustomEndpoint: boolean;
	apiFormat: string;
	modelHint: string;
}
/**
 * 读取平台配置列表。
 * @returns 平台配置列表。
 */
export function readPlatformConfigs(): PlatformConfigItem[] {
	const sourcePlatforms: any = Array.isArray(platformConfigJson && platformConfigJson.platforms)
		? platformConfigJson.platforms
		: [];
	const platformList: PlatformConfigItem[] = [];
	for (let index: any = 0; index < sourcePlatforms.length; index += 1) {
		const sourceItem: any = sourcePlatforms[index] && typeof sourcePlatforms[index] === 'object'
			? sourcePlatforms[index]
			: {};
		const id: any = String(sourceItem.id || '').trim();
		const label: any = String(sourceItem.label || '').trim();
		const entryUrl: any = String(sourceItem.entryUrl || '').trim();
		const endpoint: any = String(sourceItem.endpoint || '').trim();
		const keyField: any = String(sourceItem.keyField || '').trim();
		const endpointField: any = String(sourceItem.endpointField || '').trim();
		const modelField: any = String(sourceItem.modelField || '').trim();
		const model: any = String(sourceItem.model || '').trim();
		const imagePayloadMode: any = String(sourceItem.imagePayloadMode || '').trim();
		const isCustomEndpoint: boolean = Boolean(sourceItem.isCustomEndpoint);
		const apiFormat: any = String(sourceItem.apiFormat || '').trim();
		const modelHint: any = String(sourceItem.modelHint || '').trim();
		if (!id || !label || !keyField || !endpointField || !modelField) {
			continue;
		}
		if (!isCustomEndpoint && (!entryUrl || !endpoint || !model)) {
			continue;
		}
		platformList.push({
			id,
			label,
			entryUrl,
			endpoint,
			keyField,
			endpointField,
			modelField,
			model,
			imagePayloadMode,
			isCustomEndpoint,
			apiFormat,
			modelHint,
		});
	}
	return platformList;
}
/**
 * 读取初始平台标识。
 * @returns 初始平台标识。
 */
export function readInitialPlatformId(): string {
	const platformList: any = readPlatformConfigs();
	if (platformList.length === 0) {
		return '';
	}
	return String(platformList[0].id || '').trim();
}
/**
 * 构建聊天页模型配置映射。
 * @returns 模型配置映射。
 */
export function readModelConfigMapByPlatform(): Record<string, {
	keyField: string;
	endpointField: string;
	modelField: string;
	platformLabel: string;
}> {
	const platformList: any = readPlatformConfigs();
	const configMap: Record<string, {
		keyField: string;
		endpointField: string;
		modelField: string;
		platformLabel: string;
	}> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		configMap[platformItem.id] = {
			keyField: platformItem.keyField,
			endpointField: platformItem.endpointField,
			modelField: platformItem.modelField,
			platformLabel: platformItem.label,
		};
	}
	return configMap;
}
/**
 * 构建模型图片载荷模式映射。
 * @returns 模式映射。
 */
export function readImagePayloadModeMapByPlatform(): Record<string, string> {
	const platformList: any = readPlatformConfigs();
	const payloadModeMap: Record<string, string> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		payloadModeMap[platformItem.id] = platformItem.imagePayloadMode;
	}
	return payloadModeMap;
}
/**
 * 构建终结点固定值映射。
 * @returns 终结点映射。
 */
export function readFixedEndpointMapByPlatform(): Record<string, string> {
	const platformList: any = readPlatformConfigs();
	const endpointMap: Record<string, string> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		endpointMap[platformItem.id] = platformItem.endpoint;
	}
	return endpointMap;
}
/**
 * 构建模型初始值映射。
 * @returns 模型初始值映射。
 */
export function readInitialModelMapByPlatform(): Record<string, string> {
	const platformList: any = readPlatformConfigs();
	const modelMap: Record<string, string> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		modelMap[platformItem.id] = platformItem.model;
	}
	return modelMap;
}
/**
 * 按平台标识读取单个平台配置。
 * @param platformId - 平台标识。
 * @returns 平台配置或 null。
 */
/**
 * 构建模型 API 格式映射。
 * @returns API 格式映射。
 */
export function readApiFormatMapByPlatform(): Record<string, string> {
	const platformList: any = readPlatformConfigs();
	const apiFormatMap: Record<string, string> = {};
	for (let index: any = 0; index < platformList.length; index += 1) {
		const platformItem: any = platformList[index];
		apiFormatMap[platformItem.id] = platformItem.apiFormat;
	}
	return apiFormatMap;
}
/**
 * 按平台标识读取单个平台配置。
 * @param platformId - 平台标识。
 * @returns 平台配置或 null。
 */
export function readPlatformConfigById(platformId: string): PlatformConfigItem | null {
	const normalizedId: any = String(platformId || '').trim();
	if (!normalizedId) {
		return null;
	}
	const platformList: any = readPlatformConfigs();
	for (let index: any = 0; index < platformList.length; index += 1) {
		if (platformList[index].id === normalizedId) {
			return platformList[index];
		}
	}
	return null;
}
