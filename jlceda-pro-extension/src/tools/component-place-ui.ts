// ------------------------------------------------------------------------
// 名称：器件交互放置面板
// 说明：在聊天消息节点内渲染放置队列面板，逐个调用原理图交互式放置 API，
//       引导用户完成全部器件放置，并在单个器件超时后自动重试一次。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-03-24
// 备注：任务协议生成逻辑见 component-place.ts
// ------------------------------------------------------------------------
import type { ComponentPlaceItem, ComponentPlaceRequest } from './component-place';
import { getEdaApiRoot, messageType, showEdaToastMessage } from '../utils';
import { COMPONENT_PLACE_PROTOCOL } from './component-place';

interface RequestPlacePanelOptions {
	runtimeWindow?: Window;
	messageNode: HTMLElement;
	placeRequest: ComponentPlaceRequest;
	abortSignal?: AbortSignal | null;
	onMounted?: () => void;
}

interface ApplyComponentPlaceOptions {
	runtimeWindow?: Window;
	toolResult: unknown;
	messageNode: HTMLElement;
	abortSignal?: AbortSignal | null;
	onBeforeShow?: () => void;
	onMounted?: () => void;
}

interface InteractivePlaceAttemptResult {
	placed: boolean;
	timedOut: boolean;
	userCancelled: boolean;
	error: string;
}

interface InteractivePlacePanelResult {
	ok: boolean;
	error?: string;
	errorCode?: string;
	placedCount?: number;
	skippedCount?: number;
	totalCount: number;
	placedComponents?: ComponentPlaceItem[];
	skippedComponents?: ComponentPlaceItem[];
	failedIndex?: number;
	failedComponent?: ComponentPlaceItem;
	message?: string;
}

interface PlaceComponentApi {
	context: unknown;
	method: (component: { libraryUuid: string; uuid: string }, subPartName?: string) => Promise<boolean>;
	getAllPrimitiveId: () => Promise<string[]>;
}

interface FollowMouseTipApi {
	context: unknown;
	show: (tip: string, msTimeout?: number) => Promise<void>;
	remove: (tip?: string) => Promise<void>;
}

interface PlaceRowBinding {
	root: HTMLDivElement;
	status: HTMLSpanElement;
	meta: HTMLDivElement;
}

const COMPONENT_PLACE_STYLE_ID: string = 'jlceda-component-place-style';

const COMPONENT_PLACE_STYLE_TEXT: string = [
	`.component-place-overlay {`,
	`	position: fixed;`,
	`	inset: 0;`,
	`	z-index: 9000;`,
	`	display: flex;`,
	`	align-items: center;`,
	`	justify-content: center;`,
	`	padding: 24px;`,
	`	box-sizing: border-box;`,
	`	overflow: auto;`,
	`	background: rgba(15, 23, 42, 0.22);`,
	`}`,
	`.component-place-panel {`,
	`	margin: 0;`,
	`	width: min(640px, calc(100vw - 48px));`,
	`	max-width: 100%;`,
	`\tpadding: 12px;`,
	`\tborder: 1px solid var(--tool-border, #d2d2d2);`,
	`\tborder-radius: 8px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`	box-sizing: border-box;`,
	`	box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);`,
	`}`,
	`.component-place-title {`,
	`\tfont-size: 13px;`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #1a1a1a);`,
	`\tmargin-bottom: 4px;`,
	`}`,
	`.component-place-desc {`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.6;`,
	`\tcolor: var(--text-secondary, #3a3a3a);`,
	`\tmargin-bottom: 8px;`,
	`}`,
	`.component-place-summary {`,
	`\tdisplay: flex;`,
	`\tjustify-content: space-between;`,
	`\tgap: 10px;`,
	`\tpadding: 8px 10px;`,
	`\tborder-radius: 6px;`,
	`\tbackground: var(--input-bg, #f0f0f0);`,
	`\tfont-size: 12px;`,
	`\tmargin-bottom: 8px;`,
	`}`,
	`.component-place-progress {`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #1a1a1a);`,
	`}`,
	`.component-place-status-text {`,
	`\tcolor: var(--text-secondary, #3a3a3a);`,
	`\ttext-align: right;`,
	`}`,
	`.component-place-list {`,
	`\tmax-height: 280px;`,
	`\toverflow: auto;`,
	`\tborder: 1px solid var(--input-border, #c8c8c8);`,
	`\tborder-radius: 6px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`}`,
	`.component-place-row {`,
	`\tdisplay: flex;`,
	`\tjustify-content: space-between;`,
	`\talign-items: center;`,
	`\tgap: 12px;`,
	`\tpadding: 9px 10px;`,
	`\tborder-bottom: 1px solid var(--tool-border, #e0e0e0);`,
	`}`,
	`.component-place-row:last-child {`,
	`\tborder-bottom: none;`,
	`}`,
	`.component-place-row.is-active {`,
	`\tbackground: #ddeeff;`,
	`}`,
	`.component-place-row.is-success {`,
	`\tbackground: #ddf5e8;`,
	`}`,
	`.component-place-row.is-timeout {`,
	`\tbackground: #fff3cc;`,
	`}`,
	`.component-place-row.is-error {`,
	`\tbackground: #ffe8e8;`,
	`}`,
	`.component-place-row-main {`,
	`\tmin-width: 0;`,
	`\tflex: 1;`,
	`}`,
	`.component-place-row-title {`,
	`\tfont-size: 12px;`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #1a1a1a);`,
	`\twhite-space: nowrap;`,
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.component-place-row-meta {`,
	`\tmargin-top: 2px;`,
	`\tfont-size: 11px;`,
	`\tcolor: var(--text-secondary, #505050);`,
	`\twhite-space: nowrap;`,
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.component-place-row-status {`,
	`\tflex-shrink: 0;`,
	`\tfont-size: 11px;`,
	`\tfont-weight: 600;`,
	`\tcolor: #505050;`,
	`}`,
	`.component-place-row.is-active .component-place-row-status {`,
	`\tcolor: #0958d9;`,
	`}`,
	`.component-place-row.is-success .component-place-row-status {`,
	`\tcolor: #237804;`,
	`}`,
	`.component-place-row.is-timeout .component-place-row-status {`,
	`\tcolor: #ad6800;`,
	`}`,
	`.component-place-row.is-error .component-place-row-status {`,
	`\tcolor: #cf1322;`,
	`}`,
	`.component-place-actions {`,
	`\tdisplay: flex;`,
	`\tjustify-content: flex-end;`,
	`\tgap: 8px;`,
	`\tmargin-top: 10px;`,
	`}`,
	`.component-place-button {`,
	`\theight: 26px;`,
	`\tpadding: 0 10px;`,
	`\tborder-radius: 5px;`,
	`\tborder: 1px solid #a0a0a0;`,
	`\tbackground: #e8e8e8;`,
	`\tcolor: #1a1a1a;`,
	`\tfont-size: 12px;`,
	`\tfont-weight: 600;`,
	`\tcursor: pointer;`,
	`\ttransition: background 0.15s ease, border-color 0.15s ease;`,
	`}`,
	`.component-place-button:hover:not(:disabled) {`,
	`\tbackground: #dcdcdc;`,
	`\tborder-color: #888888;`,
	`}`,
	`.component-place-button:active:not(:disabled) {`,
	`\tbackground: #cfcfcf;`,
	`\tborder-color: #787878;`,
	`}`,
	`.component-place-button.primary {`,
	`\tbackground: #2d6faa;`,
	`\tcolor: #ffffff;`,
	`\tborder-color: #2d6faa;`,
	`}`,
	`.component-place-button.primary:hover:not(:disabled) {`,
	`\tbackground: #2663a0;`,
	`\tborder-color: #2663a0;`,
	`}`,
	`.component-place-button.primary:active:not(:disabled) {`,
	`\tbackground: #205588;`,
	`\tborder-color: #205588;`,
	`}`,
	`.component-place-button:disabled {`,
	`\tborder-color: #c0c0c0;`,
	`\tbackground: #e0e0e0;`,
	`\tcolor: #909090;`,
	`\tcursor: default;`,
	`}`,
	`@media (prefers-color-scheme: dark) {`,
	`\t.component-place-panel {`,
	`\t\tbackground: #1e1e1e;`,
	`\t\tborder-color: #3c3c3c;`,
	`\t}`,
	`\t.component-place-title {`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-place-desc {`,
	`\t\tcolor: #b0b0b0;`,
	`\t}`,
	`\t.component-place-summary {`,
	`\t\tbackground: #2a2a2a;`,
	`\t}`,
	`\t.component-place-progress {`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-place-status-text {`,
	`\t\tcolor: #b0b0b0;`,
	`\t}`,
	`\t.component-place-list {`,
	`\t\tbackground: #1e1e1e;`,
	`\t\tborder-color: #3c3c3c;`,
	`\t}`,
	`\t.component-place-row {`,
	`\t\tborder-bottom-color: #3c3c3c;`,
	`\t}`,
	`\t.component-place-row-title {`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-place-row-meta {`,
	`\t\tcolor: #909090;`,
	`\t}`,
	`\t.component-place-row.is-active {`,
	`\t\tbackground: #1a2e45;`,
	`\t}`,
	`\t.component-place-row.is-success {`,
	`\t\tbackground: #142b1e;`,
	`\t}`,
	`\t.component-place-row.is-timeout {`,
	`\t\tbackground: #2e2200;`,
	`\t}`,
	`\t.component-place-row.is-error {`,
	`\t\tbackground: #2e1212;`,
	`\t}`,
	`\t.component-place-row.is-active .component-place-row-status {`,
	`\t\tcolor: #6ab0f5;`,
	`\t}`,
	`\t.component-place-row.is-success .component-place-row-status {`,
	`\t\tcolor: #5dba7b;`,
	`\t}`,
	`\t.component-place-row.is-timeout .component-place-row-status {`,
	`\t\tcolor: #e8a32a;`,
	`\t}`,
	`\t.component-place-row.is-error .component-place-row-status {`,
	`\t\tcolor: #f07070;`,
	`\t}`,
	`\t.component-place-row-status {`,
	`\t\tcolor: #b0b0b0;`,
	`\t}`,
	`\t.component-place-button {`,
	`\t\tborder-color: #5a5a5a;`,
	`\t\tbackground: #3a3a3a;`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-place-button:hover:not(:disabled) {`,
	`\t\tbackground: #484848;`,
	`\t\tborder-color: #727272;`,
	`\t}`,
	`\t.component-place-button:active:not(:disabled) {`,
	`\t\tbackground: #2f2f2f;`,
	`\t\tborder-color: #5a5a5a;`,
	`\t}`,
	`\t.component-place-button.primary {`,
	`\t\tbackground: #2d6faa;`,
	`\t\tcolor: #ffffff;`,
	`\t\tborder-color: #4a8fc8;`,
	`\t}`,
	`\t.component-place-button.primary:hover:not(:disabled) {`,
	`\t\tbackground: #2663a0;`,
	`\t\tborder-color: #4087c0;`,
	`\t}`,
	`\t.component-place-button.primary:active:not(:disabled) {`,
	`\t\tbackground: #205588;`,
	`\t\tborder-color: #357ab0;`,
	`\t}`,
	`\t.component-place-button:disabled {`,
	`\t\tborder-color: #444444;`,
	`\t\tbackground: #2a2a2a;`,
	`\t\tcolor: #666666;`,
	`\t}`,
	`}`,
].join('\n');

// 判断值是否为普通对象。
function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 确保样式节点只注入一次。
function ensureComponentPlaceStyleMounted(): void {
	if (document.getElementById(COMPONENT_PLACE_STYLE_ID)) {
		return;
	}
	const styleElement: HTMLStyleElement = document.createElement('style');
	styleElement.id = COMPONENT_PLACE_STYLE_ID;
	styleElement.textContent = COMPONENT_PLACE_STYLE_TEXT;
	document.head.appendChild(styleElement);
}

// 解析放置 API。
function resolvePlaceComponentApi(runtimeWindow: Window): PlaceComponentApi {
	const root: unknown = getEdaApiRoot(runtimeWindow);
	if (!isObjectRecord(root)) {
		throw new Error('当前环境未检测到 EDA API 对象。');
	}
	const componentModule: unknown = root.sch_PrimitiveComponent;
	if (!isObjectRecord(componentModule) || typeof componentModule.placeComponentWithMouse !== 'function' || typeof componentModule.getAllPrimitiveId !== 'function') {
		throw new Error('未找到 eda.sch_PrimitiveComponent.placeComponentWithMouse API。');
	}
	return {
		context: componentModule,
		method: componentModule.placeComponentWithMouse as (component: { libraryUuid: string; uuid: string }, subPartName?: string) => Promise<boolean>,
		getAllPrimitiveId: componentModule.getAllPrimitiveId as () => Promise<string[]>,
	};
}

// 解析跟随鼠标提示 API，不存在时返回 null。
function resolveFollowMouseTipApi(runtimeWindow: Window): FollowMouseTipApi | null {
	const root: unknown = getEdaApiRoot(runtimeWindow);
	if (!isObjectRecord(root)) {
		return null;
	}
	const messageModule: unknown = root.sys_Message;
	if (!isObjectRecord(messageModule)) {
		return null;
	}
	if (typeof messageModule.showFollowMouseTip !== 'function' || typeof messageModule.removeFollowMouseTip !== 'function') {
		return null;
	}
	return {
		context: messageModule,
		show: messageModule.showFollowMouseTip as (tip: string, msTimeout?: number) => Promise<void>,
		remove: messageModule.removeFollowMouseTip as (tip?: string) => Promise<void>,
	};
}

// 转换异常为文本。
function toSafeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}

// 计算器件显示标题。
function formatComponentTitle(component: ComponentPlaceItem): string {
	if (component.name) {
		return component.name;
	}
	return `${component.libraryUuid}/${component.uuid}`;
}

// 计算器件显示副标题。
function formatComponentMeta(component: ComponentPlaceItem): string {
	const metaParts: string[] = [];
	if (component.footprintName) {
		metaParts.push(`封装：${component.footprintName}`);
	}
	if (component.subPartName) {
		metaParts.push(`子部件：${component.subPartName}`);
	}
	if (metaParts.length < 1) {
		metaParts.push(`UUID：${component.uuid}`);
	}
	return metaParts.join('  ');
}

/**
 * 从工具返回结果中解析器件放置协议请求。
 * @param toolResult - 工具执行返回值。
 * @returns 解析成功返回请求对象，否则返回 null。
 */
export function parseComponentPlaceRequest(toolResult?: unknown): ComponentPlaceRequest | null {
	if (!isObjectRecord(toolResult)) {
		return null;
	}
	const placementObject: unknown = toolResult.placement;
	if (!isObjectRecord(placementObject)) {
		return null;
	}
	if (String(placementObject.protocol ?? '').trim() !== COMPONENT_PLACE_PROTOCOL) {
		return null;
	}
	if (!Array.isArray(placementObject.components) || placementObject.components.length < 1) {
		return null;
	}

	const components: ComponentPlaceItem[] = [];
	for (let index = 0; index < placementObject.components.length; index += 1) {
		const rawComponent: unknown = placementObject.components[index];
		if (!isObjectRecord(rawComponent)) {
			return null;
		}
		const uuid: string = String(rawComponent.uuid ?? '').trim();
		const libraryUuid: string = String(rawComponent.libraryUuid ?? '').trim();
		if (!uuid || !libraryUuid) {
			return null;
		}
		components.push({
			uuid,
			libraryUuid,
			name: String(rawComponent.name ?? '').trim(),
			footprintName: String(rawComponent.footprintName ?? '').trim(),
			subPartName: String(rawComponent.subPartName ?? '').trim(),
		});
	}

	const timeoutSeconds: number = Number(placementObject.timeoutSeconds ?? 0);
	const retryCount: number = Number(placementObject.retryCount ?? 0);
	if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
		return null;
	}
	if (!Number.isFinite(retryCount) || retryCount < 0) {
		return null;
	}

	return {
		protocol: COMPONENT_PLACE_PROTOCOL,
		title: String(placementObject.title ?? '').trim() || '原理图器件放置',
		description: String(placementObject.description ?? '').trim() || `请按顺序在原理图中放置以下 ${String(components.length)} 个器件。`,
		components,
		timeoutSeconds,
		retryCount,
	};
}

// 更新行状态样式与文本。
function setRowState(bindings: PlaceRowBinding[], index: number, stateClass: string, statusText: string, metaText?: string): void {
	const rowBinding: PlaceRowBinding | undefined = bindings[index];
	if (!rowBinding) {
		return;
	}
	rowBinding.root.classList.remove('is-active', 'is-success', 'is-timeout', 'is-error');
	if (stateClass) {
		rowBinding.root.classList.add(stateClass);
	}
	rowBinding.status.textContent = statusText;
	if (metaText !== undefined) {
		rowBinding.meta.textContent = metaText;
	}
}

// 执行单次器件交互放置尝试。
async function executePlaceAttempt(runtimeWindow: Window, placeApi: PlaceComponentApi, followMouseTipApi: FollowMouseTipApi | null, component: ComponentPlaceItem, timeoutSeconds: number, onTimeout: () => void): Promise<InteractivePlaceAttemptResult> {
	const timeoutMs: number = Math.max(1, Math.round(timeoutSeconds * 1000));
	const tipText: string = `请在原理图中放置器件：${formatComponentTitle(component)}`;

	if (followMouseTipApi) {
		void Promise.resolve(followMouseTipApi.show.call(followMouseTipApi.context, tipText, timeoutMs)).catch(() => undefined);
	}

	try {
		// 启动交互式放置会话。placeComponentWithMouse 会话启动成功后立即返回 true，
		// 器件开始跟随鼠标，此时尚未完成放置。
		let started: boolean;
		try {
			started = Boolean(await Promise.resolve(placeApi.method.call(
				placeApi.context,
				{ uuid: component.uuid, libraryUuid: component.libraryUuid },
				component.subPartName || undefined,
			)));
		}
		catch (error: unknown) {
			return {
				placed: false,
				timedOut: false,
				userCancelled: false,
				error: toSafeErrorMessage(error),
			};
		}

		if (!started) {
			return {
				placed: false,
				timedOut: false,
				userCancelled: false,
				error: 'placeComponentWithMouse 返回 false，交互放置会话未能启动。',
			};
		}

		// 等待 EDA 完成浮动图元创建（器件跟随鼠标的状态），再取快照作为轮询基线。
		// 基线之后出现的新图元，才是用户点击放置的结果。
		await new Promise<void>((resolveDelay) => {
			window.setTimeout(resolveDelay, 500);
		});

		const referenceIdSet: Set<string> = new Set<string>();
		try {
			const referenceIds: string[] = await Promise.resolve(placeApi.getAllPrimitiveId.call(placeApi.context));
			for (let i: number = 0; i < referenceIds.length; i++) {
				const id: string = String(referenceIds[i] || '').trim();
				if (id) {
					referenceIdSet.add(id);
				}
			}
		}
		catch {
			// 快照失败时 referenceIdSet 保持为空，轮询时任何 ID 都视为新增。
		}

		// 以 400ms 间隔轮询，等待用户点击放置后出现超出基线的新图元。
		// 同时通过 mousedown 捕获阶段监听右键，作为立即取消的第一信号。
		const remainMs: number = Math.max(1, timeoutMs - 500);
		let rightClickCancelled: boolean = false;
		const onRightMouseDown = (event: Event): void => {
			if ((event as MouseEvent).button === 2) {
				rightClickCancelled = true;
			}
		};
		runtimeWindow.document.addEventListener('mousedown', onRightMouseDown as EventListener, { capture: true });
		try {
		return await new Promise<InteractivePlaceAttemptResult>((resolve) => {
			let active: boolean = true;
			const timerId: number = window.setTimeout(() => {
				active = false;
				onTimeout();
				resolve({
					placed: false,
					timedOut: true,
					userCancelled: false,
					error: '',
				});
			}, remainMs);

			async function checkForPlacement(): Promise<void> {
				if (!active) {
					return;
				}
				// 右键取消信号优先于图元 ID 检测。
				if (rightClickCancelled) {
					active = false;
					window.clearTimeout(timerId);
					resolve({
						placed: false,
						timedOut: false,
						userCancelled: true,
						error: '',
					});
					return;
				}
				try {
					const currentIds: string[] = await Promise.resolve(placeApi.getAllPrimitiveId.call(placeApi.context));
					if (!active) {
						return;
					}
					// 检查是否有新图元出现（用户左键放置）。
					for (let i: number = 0; i < currentIds.length; i++) {
						const id: string = String(currentIds[i] || '').trim();
						if (id && !referenceIdSet.has(id)) {
							active = false;
							window.clearTimeout(timerId);
							resolve({
								placed: true,
								timedOut: false,
								userCancelled: false,
								error: '',
							});
							return;
						}
					}
					// 检查基线图元是否消失（备用信号：浮动图元被移除）。
					if (referenceIdSet.size > 0) {
						const currentIdSet: Set<string> = new Set<string>(currentIds.map((id: string) => String(id || '').trim()).filter(Boolean));
						for (const refId of referenceIdSet) {
							if (!currentIdSet.has(refId)) {
								active = false;
								window.clearTimeout(timerId);
								resolve({
									placed: false,
									timedOut: false,
									userCancelled: true,
									error: '',
								});
								return;
							}
						}
					}
				}
				catch {
					// 单次轮询异常时跳过，下次继续轮询。
				}
				if (active) {
					window.setTimeout(() => {
						void checkForPlacement();
					}, 400);
				}
			}

			void checkForPlacement();
		});
		}
		finally {
			runtimeWindow.document.removeEventListener('mousedown', onRightMouseDown as EventListener, { capture: true });
		}
	}
	finally {
		if (followMouseTipApi) {
			void Promise.resolve(followMouseTipApi.remove.call(followMouseTipApi.context, tipText)).catch(() => undefined);
		}
	}
}

/**
 * 在工具消息节点内渲染器件放置交互面板，并执行整批器件放置流程。
 * @param options - 面板选项。
 * @returns 最终工具结果对象。
 */
export async function requestComponentPlacePanel(options: RequestPlacePanelOptions): Promise<InteractivePlacePanelResult> {
	ensureComponentPlaceStyleMounted();
	const runtimeWindow: Window = options.runtimeWindow || window;
	const placeApi: PlaceComponentApi = resolvePlaceComponentApi(runtimeWindow);
	const followMouseTipApi: FollowMouseTipApi | null = resolveFollowMouseTipApi(runtimeWindow);
	const placeRequest: ComponentPlaceRequest = options.placeRequest;

	return await new Promise<InteractivePlacePanelResult>((resolve) => {
		let resolved: boolean = false;
		let started: boolean = false;
		let running: boolean = false;
		let cancelRequested: boolean = false;
		const placedComponents: ComponentPlaceItem[] = [];
		const overlayElement: HTMLDivElement = document.createElement('div');
		overlayElement.className = 'component-place-overlay';

		const panelElement: HTMLDivElement = document.createElement('div');
		panelElement.className = 'component-place-panel';
		overlayElement.appendChild(panelElement);

		const titleElement: HTMLDivElement = document.createElement('div');
		titleElement.className = 'component-place-title';
		titleElement.textContent = placeRequest.title;
		panelElement.appendChild(titleElement);

		const descElement: HTMLDivElement = document.createElement('div');
		descElement.className = 'component-place-desc';
		descElement.textContent = placeRequest.description;
		panelElement.appendChild(descElement);

		const summaryElement: HTMLDivElement = document.createElement('div');
		summaryElement.className = 'component-place-summary';
		const progressElement: HTMLDivElement = document.createElement('div');
		progressElement.className = 'component-place-progress';
		progressElement.textContent = `进度：0 / ${String(placeRequest.components.length)}`;
		const statusTextElement: HTMLDivElement = document.createElement('div');
		statusTextElement.className = 'component-place-status-text';
		statusTextElement.textContent = '等待开始';
		summaryElement.appendChild(progressElement);
		summaryElement.appendChild(statusTextElement);
		panelElement.appendChild(summaryElement);

		const listElement: HTMLDivElement = document.createElement('div');
		listElement.className = 'component-place-list';
		const rowBindings: PlaceRowBinding[] = [];
		for (let index = 0; index < placeRequest.components.length; index += 1) {
			const component: ComponentPlaceItem = placeRequest.components[index];
			const rowElement: HTMLDivElement = document.createElement('div');
			rowElement.className = 'component-place-row';

			const rowMain: HTMLDivElement = document.createElement('div');
			rowMain.className = 'component-place-row-main';
			const rowTitle: HTMLDivElement = document.createElement('div');
			rowTitle.className = 'component-place-row-title';
			rowTitle.textContent = `${String(index + 1)}. ${formatComponentTitle(component)}`;
			const rowMeta: HTMLDivElement = document.createElement('div');
			rowMeta.className = 'component-place-row-meta';
			rowMeta.textContent = formatComponentMeta(component);
			rowMain.appendChild(rowTitle);
			rowMain.appendChild(rowMeta);

			const rowStatus: HTMLSpanElement = document.createElement('span');
			rowStatus.className = 'component-place-row-status';
			rowStatus.textContent = '待开始';

			rowElement.appendChild(rowMain);
			rowElement.appendChild(rowStatus);
			listElement.appendChild(rowElement);
			rowBindings.push({ root: rowElement, status: rowStatus, meta: rowMeta });
		}
		panelElement.appendChild(listElement);

		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'component-place-actions';
		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.className = 'component-place-button';
		cancelButton.type = 'button';
		cancelButton.textContent = '取消任务';
		const startButton: HTMLButtonElement = document.createElement('button');
		startButton.className = 'component-place-button primary';
		startButton.type = 'button';
		startButton.textContent = '开始放置';
		actionsElement.appendChild(cancelButton);
		actionsElement.appendChild(startButton);
		panelElement.appendChild(actionsElement);
		document.body.appendChild(overlayElement);

		let onAbort: (() => void) | undefined;

		function finalize(result: InteractivePlacePanelResult): void {
			if (resolved) {
				return;
			}
			resolved = true;
			if (options.abortSignal && onAbort) {
				options.abortSignal.removeEventListener('abort', onAbort);
			}
			overlayElement.remove();
			resolve(result);
		}

		function updateProgress(placedCount: number, currentText: string): void {
			progressElement.textContent = `进度：${String(placedCount)} / ${String(placeRequest.components.length)}`;
			statusTextElement.textContent = currentText;
		}

		async function runPlacementQueue(): Promise<void> {
			started = true;
			running = true;
			startButton.disabled = true;
			cancelButton.disabled = false;
			const skippedComponents: ComponentPlaceItem[] = [];
			for (let index = 0; index < placeRequest.components.length; index += 1) {
				const component: ComponentPlaceItem = placeRequest.components[index];
				if (cancelRequested) {
					finalize({
						ok: false,
						error: '用户取消器件放置，工具执行已终止。',
						errorCode: 'COMPONENT_PLACE_CANCELLED',
						placedCount: placedComponents.length,
						totalCount: placeRequest.components.length,
						placedComponents,
					});
					return;
				}

				for (let attempt = 1; attempt <= placeRequest.retryCount + 1; attempt += 1) {
					const isRetry: boolean = attempt > 1;
					setRowState(
						rowBindings,
						index,
						'is-active',
						isRetry ? `重试第 ${String(attempt - 1)} 次` : '等待放置',
						formatComponentMeta(component),
					);
					updateProgress(placedComponents.length, `请在原理图中放置第 ${String(index + 1)} / ${String(placeRequest.components.length)} 个器件${isRetry ? '（重试）' : ''}`);

					const attemptResult: InteractivePlaceAttemptResult = await executePlaceAttempt(
						runtimeWindow,
						placeApi,
						followMouseTipApi,
						component,
						placeRequest.timeoutSeconds,
						() => {
							setRowState(rowBindings, index, 'is-timeout', '已超时', `${formatComponentMeta(component)}  当前尝试结束后将自动重试一次。`);
							updateProgress(placedComponents.length, `第 ${String(index + 1)} 个器件已超时，等待当前尝试结束。`);
							try {
								showEdaToastMessage(runtimeWindow, `器件“${formatComponentTitle(component)}”放置超时，当前尝试结束后将自动重试一次。`, messageType.warning);
							}
							catch { }
						},
					);

					if (attemptResult.placed) {
						placedComponents.push(component);
						setRowState(
							rowBindings,
							index,
							'is-success',
							attemptResult.timedOut ? '超时后完成' : '已完成',
							formatComponentMeta(component),
						);
						updateProgress(placedComponents.length, `已完成第 ${String(index + 1)} 个器件放置。`);
						break;
					}

					if (cancelRequested) {
						setRowState(rowBindings, index, 'is-error', '已取消', `${formatComponentMeta(component)}  用户要求终止。`);
						finalize({
							ok: false,
							error: '用户取消器件放置，工具执行已终止。',
							errorCode: 'COMPONENT_PLACE_CANCELLED',
							placedCount: placedComponents.length,
							totalCount: placeRequest.components.length,
							placedComponents,
							failedIndex: index + 1,
							failedComponent: component,
						});
						return;
					}

					// 用户在原理图中右键取消放置（浮动图元消失），跳过当前器件，继续放置下一个。
					if (attemptResult.userCancelled) {
						skippedComponents.push(component);
						setRowState(rowBindings, index, 'is-timeout', '已跳过', `${formatComponentMeta(component)}  用户已取消，跳过此器件。`);
						updateProgress(placedComponents.length, `第 ${String(index + 1)} 个器件已跳过。`);
						try {
							showEdaToastMessage(runtimeWindow, `器件"${formatComponentTitle(component)}"已跳过，继续放置下一个。`, messageType.warning);
						}
						catch { }
						break;
					}

					if (attemptResult.timedOut && attempt <= placeRequest.retryCount) {
						setRowState(rowBindings, index, 'is-timeout', '准备重试', `${formatComponentMeta(component)}  即将开始第 ${String(attempt)} 次重试。`);
						updateProgress(placedComponents.length, `第 ${String(index + 1)} 个器件超时，准备重试。`);
						continue;
					}

					if (attemptResult.timedOut) {
						setRowState(rowBindings, index, 'is-error', '超时失败', `${formatComponentMeta(component)}  ${attemptResult.error || '已达到最大重试次数。'}`.trim());
						finalize({
							ok: false,
							error: `第 ${String(index + 1)} 个器件放置超时，自动重试 1 次后仍未完成。`,
							errorCode: 'COMPONENT_PLACE_TIMEOUT',
							placedCount: placedComponents.length,
							totalCount: placeRequest.components.length,
							placedComponents,
							failedIndex: index + 1,
							failedComponent: component,
						});
						return;
					}

					if (attemptResult.error) {
						setRowState(rowBindings, index, 'is-error', '放置失败', `${formatComponentMeta(component)}  ${attemptResult.error}`);
						finalize({
							ok: false,
							error: `第 ${String(index + 1)} 个器件放置失败：${attemptResult.error}`,
							errorCode: 'COMPONENT_PLACE_API_ERROR',
							placedCount: placedComponents.length,
							totalCount: placeRequest.components.length,
							placedComponents,
							failedIndex: index + 1,
							failedComponent: component,
						});
						return;
					}

					setRowState(rowBindings, index, 'is-error', '用户取消', `${formatComponentMeta(component)}  当前器件未完成放置。`);
					finalize({
						ok: false,
						error: `第 ${String(index + 1)} 个器件未完成放置，用户已取消当前交互。`,
						errorCode: 'COMPONENT_PLACE_CANCELLED',
						placedCount: placedComponents.length,
						totalCount: placeRequest.components.length,
						placedComponents,
						failedIndex: index + 1,
						failedComponent: component,
					});
					return;
				}
			}

			running = false;
			cancelButton.disabled = true;
			const finalPlacedCount: number = placedComponents.length;
			const finalSkippedCount: number = skippedComponents.length;
			const finalMessage: string = finalSkippedCount > 0
				? `共 ${String(placeRequest.components.length)} 个器件：已放置 ${String(finalPlacedCount)} 个，用户跳过 ${String(finalSkippedCount)} 个。`
				: `已完成全部 ${String(placeRequest.components.length)} 个器件的交互放置。`;
			finalize({
				ok: true,
				placedCount: finalPlacedCount,
				skippedCount: finalSkippedCount,
				totalCount: placeRequest.components.length,
				placedComponents,
				skippedComponents,
				message: finalMessage,
			});
		}

		onAbort = (): void => {
			if (!started) {
				finalize({
					ok: false,
					error: '用户取消器件放置，工具执行已终止。',
					errorCode: 'COMPONENT_PLACE_CANCELLED',
					totalCount: placeRequest.components.length,
					placedCount: placedComponents.length,
					placedComponents,
				});
				return;
			}
			cancelRequested = true;
			cancelButton.disabled = true;
			statusTextElement.textContent = running ? '已请求停止，等待当前交互结束。' : '已取消';
		};

		cancelButton.addEventListener('click', () => {
			if (!started) {
				finalize({
					ok: false,
					error: '用户取消器件放置，工具执行已终止。',
					errorCode: 'COMPONENT_PLACE_CANCELLED',
					placedCount: 0,
					totalCount: placeRequest.components.length,
					placedComponents: [],
				});
				return;
			}
			cancelRequested = true;
			cancelButton.disabled = true;
			statusTextElement.textContent = '已请求停止，等待当前交互结束。';
		});

		startButton.addEventListener('click', () => {
			if (running || started) {
				return;
			}
			void runPlacementQueue();
		});

		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				onAbort();
				return;
			}
			options.abortSignal.addEventListener('abort', onAbort, { once: true });
		}

		if (options.onMounted) {
			options.onMounted();
			window.setTimeout(() => {
				if (options.onMounted) {
					options.onMounted();
				}
			}, 50);
		}
	});
}

/**
 * 检测工具返回结果是否包含器件放置协议，若是则展示交互面板并返回最终结果。
 * @param options - 交互选项。
 * @returns 若不含放置协议返回 null；否则返回转换后的工具结果对象。
 */
export async function applyComponentPlaceInteraction(options: ApplyComponentPlaceOptions): Promise<unknown> {
	const placeRequest: ComponentPlaceRequest | null = parseComponentPlaceRequest(options.toolResult);
	if (!placeRequest) {
		return null;
	}
	if (options.onBeforeShow) {
		options.onBeforeShow();
	}
	const panelResult: InteractivePlacePanelResult = await requestComponentPlacePanel({
		runtimeWindow: options.runtimeWindow || window,
		messageNode: options.messageNode,
		placeRequest,
		abortSignal: options.abortSignal,
		onMounted: options.onMounted,
	});
	if (options.abortSignal && options.abortSignal.aborted && panelResult.ok) {
		throw new DOMException('【诊断信息】用户已停止', 'AbortError');
	}
	return panelResult;
}
