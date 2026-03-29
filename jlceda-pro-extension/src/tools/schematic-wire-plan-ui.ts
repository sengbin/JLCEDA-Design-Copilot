/**
 * ------------------------------------------------------------------------
 * 名称：原理图连线规划交互面板
 * 说明：在聊天页面中承接自动连线的等待与确认交互，先引导用户放置缺失的
 *       电源/地符号，再确认连线方式，最终返回可供模型继续执行的结果。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-30
 * 备注：任务协议生成逻辑见 schematic-wire-plan.ts
 * ------------------------------------------------------------------------
 */

import type { SchematicWirePlanConnectionRow, SchematicWirePlanRequest } from './schematic-wire-plan';
import { SCHEMATIC_WIRE_PLAN_PROTOCOL } from './schematic-wire-plan';

interface WaitPanelResult {
	reason: 'confirmed' | 'cancelled' | 'aborted';
}

interface ConfirmPanelResult {
	reason: 'confirmed' | 'cancelled' | 'aborted';
	connectionMethod: 'wire' | 'net-label';
}

export interface ApplySchematicWirePlanInteractionOptions {
	toolResult: unknown;
	messageNode: HTMLElement;
	abortSignal?: AbortSignal | null;
	onBeforeShow?: () => void;
	onMounted?: () => void;
}

const SCHEMATIC_WIRE_PLAN_STYLE_ID: string = 'jlceda-schematic-wire-plan-style';

const SCHEMATIC_WIRE_PLAN_STYLE_TEXT: string = [
	`.schematic-wire-plan-overlay {`,
	`\tposition: fixed;`,
	`\tinset: 0;`,
	`\tz-index: 9000;`,
	`\tdisplay: flex;`,
	`\talign-items: center;`,
	`\tjustify-content: center;`,
	`\tpadding: 24px;`,
	`\tbackground: rgba(15, 23, 42, 0.22);`,
	`\tbox-sizing: border-box;`,
	`}`,
	`.schematic-wire-plan-panel {`,
	`\twidth: min(760px, calc(100vw - 48px));`,
	`\tmax-width: 100%;`,
	`\tpadding: 14px;`,
	`\tborder: 1px solid var(--tool-border, #d2d2d2);`,
	`\tborder-radius: 8px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`\tbox-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);`,
	`\tbox-sizing: border-box;`,
	`}`,
	`.schematic-wire-plan-title {`,
	`\tfont-size: 13px;`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tmargin-bottom: 4px;`,
	`}`,
	`.schematic-wire-plan-desc {`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.5;`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`\tmargin-bottom: 10px;`,
	`}`,
	`.schematic-wire-plan-list {`,
	`\tdisplay: flex;`,
	`\tflex-direction: column;`,
	`\tgap: 4px;`,
	`\tmax-height: min(340px, 50vh);`,
	`\toverflow: auto;`,
	`\tpadding-right: 2px;`,
	`\tmargin-bottom: 10px;`,
	`}`,
	`.schematic-wire-plan-row {`,
	`\tdisplay: flex;`,
	`\talign-items: center;`,
	`\tgap: 8px;`,
	`\tpadding: 6px 8px;`,
	`\tborder-radius: 6px;`,
	`\tbackground: var(--input-bg, #f6f7fb);`,
	`}`,
	`.schematic-wire-plan-index {`,
	`\tflex: 0 0 24px;`,
	`\ttext-align: right;`,
	`\tfont-size: 11px;`,
	`\tcolor: var(--text-secondary, #666666);`,
	`}`,
	`.schematic-wire-plan-endpoints {`,
	`\tflex: 1;`,
	`\tmin-width: 0;`,
	`\tfont-size: 12px;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\twhite-space: nowrap;`,
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.schematic-wire-plan-net {`,
	`\tflex: 0 0 auto;`,
	`\tpadding: 1px 6px;`,
	`\tborder-radius: 999px;`,
	`\tbackground: rgba(24, 144, 255, 0.12);`,
	`\tcolor: #1163c2;`,
	`\tfont-size: 11px;`,
	`}`,
	`.schematic-wire-plan-method {`,
	`\tdisplay: flex;`,
	`\talign-items: center;`,
	`\tgap: 12px;`,
	`\tmargin-bottom: 12px;`,
	`\tfont-size: 12px;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`}`,
	`.schematic-wire-plan-method label {`,
	`\tdisplay: inline-flex;`,
	`\talign-items: center;`,
	`\tgap: 4px;`,
	`\tcursor: pointer;`,
	`}`,
	`.schematic-wire-plan-warning-list {`,
	`\tmargin: 0 0 12px;`,
	`\tpadding-left: 18px;`,
	`}`,
	`.schematic-wire-plan-warning-list li {`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.6;`,
	`\tcolor: #c45500;`,
	`}`,
	`.schematic-wire-plan-actions {`,
	`\tdisplay: flex;`,
	`\tjustify-content: flex-end;`,
	`\tgap: 8px;`,
	`}`,
	`.schematic-wire-plan-button {`,
	`\theight: 28px;`,
	`\tpadding: 0 12px;`,
	`\tborder-radius: 5px;`,
	`\tborder: 1px solid #a0a0a0;`,
	`\tbackground: #e8e8e8;`,
	`\tcolor: #1a1a1a;`,
	`\tfont-size: 12px;`,
	`\tfont-weight: 600;`,
	`\tcursor: pointer;`,
	`}`,
	`.schematic-wire-plan-button.primary {`,
	`\tbackground: #2d6faa;`,
	`\tborder-color: #2d6faa;`,
	`\tcolor: #ffffff;`,
	`}`,
	`.schematic-wire-plan-button:disabled {`,
	`\topacity: 0.6;`,
	`\tcursor: default;`,
	`}`,
	`@media (prefers-color-scheme: dark) {`,
	`\t.schematic-wire-plan-panel {`,
	`\t\tbackground: #1e1e1e;`,
	`\t\tborder-color: #3c3c3c;`,
	`\t}`,
	`\t.schematic-wire-plan-title {`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.schematic-wire-plan-desc,`,
	`\t.schematic-wire-plan-endpoints,`,
	`\t.schematic-wire-plan-method {`,
	`\t\tcolor: #d0d0d0;`,
	`\t}`,
	`\t.schematic-wire-plan-row {`,
	`\t\tbackground: #2a2a2a;`,
	`\t}`,
	`\t.schematic-wire-plan-net {`,
	`\t\tbackground: rgba(24, 144, 255, 0.22);`,
	`\t\tcolor: #69c0ff;`,
	`\t}`,
	`\t.schematic-wire-plan-button {`,
	`\t\tborder-color: #5a5a5a;`,
	`\t\tbackground: #3a3a3a;`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.schematic-wire-plan-button.primary {`,
	`\t\tbackground: #2d6faa;`,
	`\t\tborder-color: #4a8fc8;`,
	`\t}`,
	`}`,
].join('\n');

// 判断值是否为普通对象。
function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 注入面板样式，只注入一次。
function ensureSchematicWirePlanStyleMounted(): void {
	if (document.getElementById(SCHEMATIC_WIRE_PLAN_STYLE_ID)) {
		return;
	}
	const styleElement: HTMLStyleElement = document.createElement('style');
	styleElement.id = SCHEMATIC_WIRE_PLAN_STYLE_ID;
	styleElement.textContent = SCHEMATIC_WIRE_PLAN_STYLE_TEXT;
	document.head.appendChild(styleElement);
}

/**
 * 从工具返回结果中解析连线规划交互协议。
 * @param toolResult 工具执行返回值。
 * @returns 解析成功返回请求对象，否则返回 null。
 */
export function parseSchematicWirePlanRequest(toolResult?: unknown): SchematicWirePlanRequest | null {
	if (!isObjectRecord(toolResult)) {
		return null;
	}
	const wirePlanObject: unknown = toolResult.wirePlan;
	if (!isObjectRecord(wirePlanObject)) {
		return null;
	}
	if (String(wirePlanObject.protocol ?? '').trim() !== SCHEMATIC_WIRE_PLAN_PROTOCOL) {
		return null;
	}

	const stage: string = String(wirePlanObject.stage ?? '').trim();
	if (stage !== 'wait-net-flags' && stage !== 'confirm-plan') {
		return null;
	}

	if (stage === 'wait-net-flags') {
		if (!Array.isArray(wirePlanObject.missingSymbols) || wirePlanObject.missingSymbols.length === 0) {
			return null;
		}
	}
	if (stage === 'confirm-plan') {
		if (!String(wirePlanObject.planId ?? '').trim()) {
			return null;
		}
		if (!Array.isArray(wirePlanObject.connections) || wirePlanObject.connections.length === 0) {
			return null;
		}
	}

	return wirePlanObject as unknown as SchematicWirePlanRequest;
}

// 创建通用面板骨架。
function createPanelSkeleton(request: SchematicWirePlanRequest): {
	overlayElement: HTMLDivElement;
	panelElement: HTMLDivElement;
} {
	ensureSchematicWirePlanStyleMounted();
	const overlayElement: HTMLDivElement = document.createElement('div');
	overlayElement.className = 'schematic-wire-plan-overlay';

	const panelElement: HTMLDivElement = document.createElement('div');
	panelElement.className = 'schematic-wire-plan-panel';
	overlayElement.appendChild(panelElement);

	const titleElement: HTMLDivElement = document.createElement('div');
	titleElement.className = 'schematic-wire-plan-title';
	titleElement.textContent = request.title;
	panelElement.appendChild(titleElement);

	const descElement: HTMLDivElement = document.createElement('div');
	descElement.className = 'schematic-wire-plan-desc';
	descElement.textContent = request.description;
	panelElement.appendChild(descElement);

	return { overlayElement, panelElement };
}

// 请求显示电源/地符号等待面板。
function requestNetFlagWaitPanel(options: {
	request: SchematicWirePlanRequest;
	abortSignal?: AbortSignal | null;
	onMounted?: () => void;
}): Promise<WaitPanelResult> {
	return new Promise<WaitPanelResult>((resolve) => {
		const { overlayElement, panelElement } = createPanelSkeleton(options.request);
		const warningList: HTMLUListElement = document.createElement('ul');
		warningList.className = 'schematic-wire-plan-warning-list';
		for (const symbol of options.request.missingSymbols || []) {
			const itemElement: HTMLLIElement = document.createElement('li');
			itemElement.textContent = `缺少 ${String(symbol)} 符号`;
			warningList.appendChild(itemElement);
		}
		panelElement.appendChild(warningList);

		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'schematic-wire-plan-actions';
		panelElement.appendChild(actionsElement);

		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.className = 'schematic-wire-plan-button';
		cancelButton.textContent = '取消';
		actionsElement.appendChild(cancelButton);

		const confirmButton: HTMLButtonElement = document.createElement('button');
		confirmButton.type = 'button';
		confirmButton.className = 'schematic-wire-plan-button primary';
		confirmButton.textContent = '已放置，继续';
		actionsElement.appendChild(confirmButton);

		let resolved = false;
		let onAbort: (() => void) | null = null;
		const finalize = (result: WaitPanelResult): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			if (options.abortSignal && onAbort) {
				options.abortSignal.removeEventListener('abort', onAbort);
			}
			overlayElement.remove();
			resolve(result);
		};

		cancelButton.addEventListener('click', () => finalize({ reason: 'cancelled' }));
		confirmButton.addEventListener('click', () => finalize({ reason: 'confirmed' }));

		onAbort = (): void => finalize({ reason: 'aborted' });
		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				onAbort();
				return;
			}
			options.abortSignal.addEventListener('abort', onAbort, { once: true });
		}

		document.body.appendChild(overlayElement);
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

// 渲染单条连接摘要。
function appendConnectionRows(parentElement: HTMLElement, connections: SchematicWirePlanConnectionRow[]): void {
	const listElement: HTMLDivElement = document.createElement('div');
	listElement.className = 'schematic-wire-plan-list';
	for (const connection of connections) {
		const rowElement: HTMLDivElement = document.createElement('div');
		rowElement.className = 'schematic-wire-plan-row';

		const indexElement: HTMLSpanElement = document.createElement('span');
		indexElement.className = 'schematic-wire-plan-index';
		indexElement.textContent = `${String(connection.index + 1)}.`;
		rowElement.appendChild(indexElement);

		const endpointsElement: HTMLSpanElement = document.createElement('span');
		endpointsElement.className = 'schematic-wire-plan-endpoints';
		endpointsElement.textContent = `${connection.fromLabel}  →  ${connection.toLabel}`;
		rowElement.appendChild(endpointsElement);

		const netElement: HTMLSpanElement = document.createElement('span');
		netElement.className = 'schematic-wire-plan-net';
		netElement.textContent = connection.netName;
		rowElement.appendChild(netElement);

		listElement.appendChild(rowElement);
	}
	parentElement.appendChild(listElement);
}

// 请求显示连线确认面板。
function requestWirePlanConfirmPanel(options: {
	request: SchematicWirePlanRequest;
	abortSignal?: AbortSignal | null;
	onMounted?: () => void;
}): Promise<ConfirmPanelResult> {
	return new Promise<ConfirmPanelResult>((resolve) => {
		const { overlayElement, panelElement } = createPanelSkeleton(options.request);
		appendConnectionRows(panelElement, options.request.connections || []);

		let selectedMethod: 'wire' | 'net-label' = options.request.connectionMethod === 'wire' ? 'wire' : 'net-label';
		const methodElement: HTMLDivElement = document.createElement('div');
		methodElement.className = 'schematic-wire-plan-method';
		methodElement.appendChild(document.createTextNode('连接方式：'));

		const wireLabel: HTMLLabelElement = document.createElement('label');
		const wireRadio: HTMLInputElement = document.createElement('input');
		wireRadio.type = 'radio';
		wireRadio.name = 'schematicWirePlanMethod';
		wireRadio.value = 'wire';
		wireRadio.checked = selectedMethod === 'wire';
		wireRadio.addEventListener('change', () => {
			selectedMethod = 'wire';
		});
		wireLabel.appendChild(wireRadio);
		wireLabel.appendChild(document.createTextNode('导线'));
		methodElement.appendChild(wireLabel);

		const netLabel: HTMLLabelElement = document.createElement('label');
		const netLabelRadio: HTMLInputElement = document.createElement('input');
		netLabelRadio.type = 'radio';
		netLabelRadio.name = 'schematicWirePlanMethod';
		netLabelRadio.value = 'net-label';
		netLabelRadio.checked = selectedMethod === 'net-label';
		netLabelRadio.addEventListener('change', () => {
			selectedMethod = 'net-label';
		});
		netLabel.appendChild(netLabelRadio);
		netLabel.appendChild(document.createTextNode('网络标签'));
		methodElement.appendChild(netLabel);

		panelElement.appendChild(methodElement);

		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'schematic-wire-plan-actions';
		panelElement.appendChild(actionsElement);

		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.className = 'schematic-wire-plan-button';
		cancelButton.textContent = '取消';
		actionsElement.appendChild(cancelButton);

		const confirmButton: HTMLButtonElement = document.createElement('button');
		confirmButton.type = 'button';
		confirmButton.className = 'schematic-wire-plan-button primary';
		confirmButton.textContent = '确认执行';
		actionsElement.appendChild(confirmButton);

		let resolved = false;
		let onAbort: (() => void) | null = null;
		const finalize = (result: ConfirmPanelResult): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			if (options.abortSignal && onAbort) {
				options.abortSignal.removeEventListener('abort', onAbort);
			}
			overlayElement.remove();
			resolve(result);
		};

		cancelButton.addEventListener('click', () => finalize({ reason: 'cancelled', connectionMethod: selectedMethod }));
		confirmButton.addEventListener('click', () => finalize({ reason: 'confirmed', connectionMethod: selectedMethod }));

		onAbort = (): void => finalize({ reason: 'aborted', connectionMethod: selectedMethod });
		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				onAbort();
				return;
			}
			options.abortSignal.addEventListener('abort', onAbort, { once: true });
		}

		document.body.appendChild(overlayElement);
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
 * 检测工具返回结果是否包含连线规划协议，若是则展示聊天页交互面板并返回最终结果。
 * @param options 交互选项。
 * @returns 若不含连线规划协议返回 null；否则返回转换后的工具结果对象。
 */
export async function applySchematicWirePlanInteraction(options: ApplySchematicWirePlanInteractionOptions): Promise<unknown> {
	let currentResult: unknown = options.toolResult;
	let request: SchematicWirePlanRequest | null = parseSchematicWirePlanRequest(currentResult);
	if (!request) {
		return null;
	}

	while (request) {
		if (options.onBeforeShow) {
			options.onBeforeShow();
		}

		if (request.stage === 'wait-net-flags') {
			const waitResult: WaitPanelResult = await requestNetFlagWaitPanel({
				request,
				abortSignal: options.abortSignal,
				onMounted: options.onMounted,
			});
			if (options.abortSignal && options.abortSignal.aborted) {
				throw new DOMException('【诊断信息】用户已停止', 'AbortError');
			}
			if (waitResult.reason === 'aborted') {
				throw new DOMException('【诊断信息】用户已停止', 'AbortError');
			}
			if (waitResult.reason === 'cancelled') {
				return {
					ok: false,
					cancelled: true,
					message: '用户取消了电源/地符号放置，连线规划已终止，请勿重试，直接告知用户已取消并停止。',
				};
			}

			const continueCallback: unknown = isObjectRecord(currentResult)
				? (currentResult as Record<string, unknown>)._continueAfterNetFlagPlaced
				: undefined;
			if (typeof continueCallback !== 'function') {
				return {
					ok: false,
					error: '连线规划等待流程缺少继续执行回调。',
					errorCode: 'SCHEMATIC_WIRE_PLAN_CONTINUATION_MISSING',
				};
			}

			currentResult = await (continueCallback as () => Promise<unknown>)();
			request = parseSchematicWirePlanRequest(currentResult);
			if (!request) {
				return currentResult;
			}
			continue;
		}

		const confirmResult: ConfirmPanelResult = await requestWirePlanConfirmPanel({
			request,
			abortSignal: options.abortSignal,
			onMounted: options.onMounted,
		});
		if (options.abortSignal && options.abortSignal.aborted) {
			throw new DOMException('【诊断信息】用户已停止', 'AbortError');
		}
		if (confirmResult.reason === 'aborted') {
			throw new DOMException('【诊断信息】用户已停止', 'AbortError');
		}
		if (confirmResult.reason === 'cancelled') {
			return {
				ok: false,
				cancelled: true,
				message: '用户取消了连线规划，请勿重试，直接告知用户已取消并停止。',
			};
		}

		return {
			ok: true,
			planId: request.planId,
			connectionMethod: confirmResult.connectionMethod,
			connectionCount: (request.connections || []).length,
			connections: request.connections,
			message: `连线规划已确认，共 ${String((request.connections || []).length)} 条，连接方式：${confirmResult.connectionMethod === 'net-label' ? '网络标签' : '导线'}。请立即调用 schematic_wire_execute 执行连线，传入 planId 和 connectionMethod。`,
		};
	}

	return null;
}
