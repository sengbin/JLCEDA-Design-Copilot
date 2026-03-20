// 文件说明：提供 EDA API 根对象访问与序列化辅助函数。
/**
 * 获取当前窗口可用的 EDA API 根对象。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns EDA API 根对象，不可用时返回 null。
 */
export function getEdaApiRoot(runtimeWindow?: any) {
	if (!runtimeWindow || (typeof runtimeWindow !== 'object' && typeof runtimeWindow !== 'function')) {
		return null;
	}
	if (!runtimeWindow.eda) {
		return null;
	}
	if (typeof runtimeWindow.eda !== 'object' && typeof runtimeWindow.eda !== 'function') {
		return null;
	}
	return runtimeWindow.eda;
}
// 解析 EDA 提示消息 API。
function resolveEdaToastMessageApi(runtimeWindow?: any) {
	const apiRoot: any = getEdaApiRoot(runtimeWindow);
	const messageModule: any = apiRoot && apiRoot.sys_Message ? apiRoot.sys_Message : null;
	const toastMethod: any = messageModule && typeof messageModule.showToastMessage === 'function'
		? messageModule.showToastMessage
		: null;
	if (!toastMethod) {
		throw new Error('【诊断信息】未找到 sys_Message.showToastMessage。');
	}
	return {
		context: messageModule,
		method: toastMethod,
	};
}
/**
 * EDA 提示消息类型枚举。
 */
export const messageType: {
	/** 警告提示：用于非阻断类风险提醒。 */
	readonly warning: 'warn';
	/** 错误提示：用于失败或阻断场景提醒。 */
	readonly error: 'error';
	/** 信息提示：用于一般状态说明。 */
	readonly info: 'info';
} = Object.freeze({
	warning: 'warn',
	error: 'error',
	info: 'info',
});
/**
 * EDA 提示消息类型。
 */
export type EdaToastMessageType = (typeof messageType)[keyof typeof messageType];
// 使用指定类型显示 EDA 提示消息。
function showEdaToastMessageByType(runtimeWindow: any, messageText: any, messageType: EdaToastMessageType) {
	const toastApi: any = resolveEdaToastMessageApi(runtimeWindow);
	toastApi.method.call(toastApi.context, String(messageText || '').trim(), messageType);
}
/**
 * 显示 EDA 提示信息。
 * @param runtimeWindow - 运行时窗口对象。
 * @param messageText - 提示文本。
 * @param type - 提示类型，使用 messageType.warning、messageType.error 或 messageType.info。
 */
export function showEdaToastMessage(runtimeWindow: any, messageText: any, type: EdaToastMessageType) {
	if (type !== messageType.warning && type !== messageType.error && type !== messageType.info) {
		throw new Error('【诊断信息】提示类型无效，请使用 messageType.warning、messageType.error 或 messageType.info。');
	}
	showEdaToastMessageByType(runtimeWindow, messageText, type);
}
/**
 * 读取类文件对象并转换为文本。
 * @param fileLikeObject - 类文件对象。
 * @returns 文本内容，失败时返回空字符串。
 */
export async function readFileLikeText(fileLikeObject?: any) {
	if (!fileLikeObject) {
		return '';
	}
	if (typeof fileLikeObject.text === 'function') {
		try {
			return String(await fileLikeObject.text() || '');
		}
		catch {
			return '';
		}
	}
	if (typeof fileLikeObject.arrayBuffer === 'function') {
		try {
			const buffer: any = await fileLikeObject.arrayBuffer();
			const decoder: any = new TextDecoder('utf-8');
			return decoder.decode(buffer);
		}
		catch {
			return '';
		}
	}
	if (typeof fileLikeObject === 'string') {
		return fileLikeObject;
	}
	return '';
}
/**
 * 使用 EDA 扩展文件系统按候选路径读取文本文件。
 * @param runtimeWindow - 运行时窗口对象。
 * @param candidates - 候选路径列表。
 * @returns 读取结果。
 */
export async function readExtensionTextFileByCandidates(runtimeWindow?: any, candidates?: any) {
	const apiRoot: any = getEdaApiRoot(runtimeWindow);
	const extensionFileSystem: any = apiRoot && apiRoot.sys_FileSystem ? apiRoot.sys_FileSystem : null;
	if (!extensionFileSystem || typeof extensionFileSystem.getExtensionFile !== 'function') {
		return {
			ok: false,
			error: '当前环境未检测到可用的扩展文件系统。',
		};
	}
	const pathCandidates: any = Array.isArray(candidates)
		? candidates.map(candidate => String(candidate || '').trim()).filter(candidate => !!candidate)
		: [];
	if (pathCandidates.length < 1) {
		return {
			ok: false,
			error: '缺少扩展文件候选路径。',
		};
	}
	for (let index: any = 0; index < pathCandidates.length; index += 1) {
		const candidate: any = pathCandidates[index];
		try {
			const extensionFile: any = await extensionFileSystem.getExtensionFile(candidate);
			if (!extensionFile) {
				continue;
			}
			const text: any = await readFileLikeText(extensionFile);
			return {
				ok: true,
				text: String(text || ''),
				source: candidate,
			};
		}
		catch { }
	}
	return {
		ok: false,
		error: '未找到可读取的扩展文件。',
	};
}
/**
 * 将任意值转换为可 JSON 序列化的安全结构。
 * @param value - 待转换值。
 * @param depth - 递归深度上限。
 * @returns 可安全序列化的值。
 */
export function makeJsonSafe(value?: any, depth?: any): any {
	const maxDepth: any = typeof depth === 'number' ? depth : 4;
	if (maxDepth <= 0) {
		return '[max-depth]';
	}
	if (value === null || value === undefined) {
		return value === undefined ? null : value;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return value.slice(0, 200).map((item: any): any => {
			return makeJsonSafe(item, maxDepth - 1);
		});
	}
	if (typeof value === 'function') {
		return '[function]';
	}
	if (typeof value === 'object') {
		const output: any = {};
		const keys: any = Object.keys(value).slice(0, 80);
		// 限制键数量，避免上下文被超大对象占满。
		for (let index: any = 0; index < keys.length; index += 1) {
			const key: any = keys[index];
			try {
				output[key] = makeJsonSafe(value[key], maxDepth - 1);
			}
			catch {
				output[key] = '[unreadable]';
			}
		}
		return output;
	}
	return String(value);
}
/**
 * 安全序列化 JSON。
 * @param value - 待序列化值。
 * @returns JSON 字符串。
 */
export function safeJsonStringify(value?: any) {
	try {
		return JSON.stringify(value);
	}
	catch {
		return JSON.stringify(makeJsonSafe(value, 4));
	}
}
/**
 * 隐藏页面初始加载遮罩，过渡结束后从 DOM 中移除节点。
 */
export function hidePageLoadingMask() {
	const pageLoadingMask: any = document.querySelector('.page-loading-mask');
	if (document.body) {
		document.body.classList.remove('page-loading');
	}
	if (!pageLoadingMask || !(pageLoadingMask instanceof HTMLElement)) {
		return;
	}
	pageLoadingMask.classList.add('is-hidden');
	window.setTimeout(() => {
		if (pageLoadingMask.parentNode) {
			pageLoadingMask.parentNode.removeChild(pageLoadingMask);
		}
	}, 220);
}
