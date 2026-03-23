/**
 * 入口文件
 *
 * 本文件为默认扩展入口文件，如果你想要配置其它文件作为入口文件，
 * 请修改 `extension.json` 中的 `entry` 字段；
 *
 * 请在此处使用 `export`  导出所有你希望在 `headerMenus` 中引用的方法，
 * 方法通过方法名与 `headerMenus` 关联。
 *
 * 如需了解更多开发细节，请阅读：
 * https://prodocs.lceda.cn/cn/api/guide/
 */
import * as extensionConfig from '../extension.json';

// eslint-disable-next-line unused-imports/no-unused-vars
export function activate(status?: 'onStartupFinished', arg?: string): void { }

export function about(): void {
	const aboutContent = eda.sys_I18n.text('EDA Design Copilot About Content', undefined, undefined, extensionConfig.version);
	eda.sys_Dialog.showInformationMessage(
		aboutContent,
		eda.sys_I18n.text('About'),
	);
}

/**
 * 打开聊天工具页面
 */
export async function openChatTool(): Promise<void> {
	await eda.sys_IFrame.openIFrame('/iframe/index.html', 550, 700, 'jlceda-design-copilot-chat-tool', {
		maximizeButton: false,
		minimizeButton: true,
	});
}

/**
 * 打开 AI 模型配置页面
 */
export async function openAiModelConfig(): Promise<void> {
	await eda.sys_IFrame.openIFrame('/iframe/model-config.html', 800, 560, 'jlceda-design-copilot-ai-model-config', {
		maximizeButton: false,
		minimizeButton: true,
	});
}
