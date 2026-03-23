// ------------------------------------------------------------------------
// 名称：器件选型交互面板
// 说明：在聊天消息节点内渲染候选器件表格，支持行点击高亮选中，
//       底部提供确定/取消按钮，返回用户选择结果供 AI 继续执行。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-03-23
// 备注：工具处理器逻辑见 component-select.ts
// ------------------------------------------------------------------------
import type { ComponentSelectCandidate, ComponentSelectRequest } from './component-select';
import { COMPONENT_SELECT_PROTOCOL } from './component-select';

interface RequestSelectPanelOptions {
	messageNode: HTMLElement;
	selectRequest: ComponentSelectRequest;
	abortSignal?: AbortSignal | null;
	onMounted?: () => void;
}

interface RequestSelectPanelResult {
	confirmed: boolean;
	candidate?: ComponentSelectCandidate;
}

const COMPONENT_SELECT_STYLE_ID: string = 'jlceda-component-select-style';

const COMPONENT_SELECT_STYLE_TEXT: string = [
	`.component-select-panel {`,
	`\tmargin-top: 10px;`,
	`\tpadding: 12px;`,
	`\tborder: 1px solid var(--tool-border, #d2d2d2);`,
	`\tborder-radius: 8px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`}`,
	`.component-select-title {`,
	`\tfont-size: 13px;`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tmargin-bottom: 4px;`,
	`}`,
	`.component-select-desc {`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.5;`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`\tmargin-bottom: 8px;`,
	`}`,
	`.component-select-table-wrap {`,
	`\toverflow-x: auto;`,
	`\tborder: 1px solid var(--input-border, #d0d0d0);`,
	`\tborder-radius: 6px;`,
	`}`,
	`.component-select-table {`,
	`\twidth: 100%;`,
	`\tborder-collapse: collapse;`,
	`\tfont-size: 12px;`,
	`}`,
	`.component-select-table th {`,
	`\ttext-align: left;`,
	`\tpadding: 6px 10px;`,
	`\tbackground: var(--input-bg, #f5f5f5);`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`\tfont-weight: 600;`,
	`\twhite-space: nowrap;`,
	`\tborder-bottom: 1px solid var(--input-border, #d0d0d0);`,
	`}`,
	`.component-select-table td {`,
	`\tpadding: 6px 10px;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tborder-bottom: 1px solid var(--tool-border, #ebebeb);`,
	`\twhite-space: nowrap;`,
	`\tmax-width: 220px;`,
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.component-select-table tr:last-child td {`,
	`\tborder-bottom: none;`,
	`}`,
	`.component-select-row {`,
	`\tcursor: pointer;`,
	`\ttransition: background 0.1s;`,
	`}`,
	`.component-select-row:hover {`,
	`\tbackground: var(--item-hover-bg, #f0f4ff);`,
	`}`,
	`.component-select-row.selected {`,
	`\tbackground: var(--item-selected-bg, #e6f0ff);`,
	`}`,
	`.component-select-row.selected td {`,
	`\tcolor: var(--chat-input-box-focus-border, #1890ff);`,
	`\tfont-weight: 500;`,
	`}`,
	`.component-select-actions {`,
	`\tmargin-top: 8px;`,
	`\tdisplay: flex;`,
	`\tgap: 8px;`,
	`\tjustify-content: flex-end;`,
	`}`,
	`.component-select-button {`,
	`\theight: 30px;`,
	`\tpadding: 0 12px;`,
	`\tborder-radius: 6px;`,
	`\tborder: 1px solid var(--input-border, #d0d0d0);`,
	`\tfont-size: 12px;`,
	`\tcursor: pointer;`,
	`}`,
	`.component-select-button.confirm {`,
	`\tbackground: var(--button-primary-bg, #1890ff);`,
	`\tcolor: #ffffff;`,
	`\tborder-color: var(--button-primary-bg, #1890ff);`,
	`}`,
	`.component-select-button.confirm:hover:not(:disabled) {`,
	`\tbackground: var(--button-primary-hover-bg, #40a9ff);`,
	`\tborder-color: var(--button-primary-hover-bg, #40a9ff);`,
	`}`,
	`.component-select-button.cancel {`,
	`\tbackground: transparent;`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`}`,
	`.component-select-button:disabled {`,
	`\topacity: 0.6;`,
	`\tcursor: not-allowed;`,
	`}`,
].join('\n');

// 注入选型面板样式（只注一次）。
function ensureComponentSelectStyleMounted(): void {
	if (document.getElementById(COMPONENT_SELECT_STYLE_ID)) {
		return;
	}
	const styleElement: HTMLStyleElement = document.createElement('style');
	styleElement.id = COMPONENT_SELECT_STYLE_ID;
	styleElement.textContent = COMPONENT_SELECT_STYLE_TEXT;
	document.head.appendChild(styleElement);
}

// 判断值是否为普通对象。
function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 格式化库存/价格展示文本。
function formatInventoryText(inventory: number, price: number): string {
	if (inventory <= 0 && price <= 0) {
		return '—';
	}
	const parts: string[] = [];
	if (inventory > 0) {
		parts.push(`库存 ${String(inventory)}`);
	}
	if (price > 0) {
		parts.push(`¥${price.toFixed(4)}`);
	}
	return parts.join(' / ');
}

/**
 * 从工具返回结果中解析器件选型协议请求。
 * @param toolResult - 工具执行返回值。
 * @returns 解析成功返回请求对象，否则返回 null。
 */
export function parseComponentSelectRequest(toolResult?: unknown): ComponentSelectRequest | null {
	if (!isObjectRecord(toolResult)) {
		return null;
	}
	const selectionObject: unknown = toolResult.selection;
	if (!isObjectRecord(selectionObject)) {
		return null;
	}
	if (String(selectionObject.protocol ?? '').trim() !== COMPONENT_SELECT_PROTOCOL) {
		return null;
	}
	if (!Array.isArray(selectionObject.candidates) || selectionObject.candidates.length === 0) {
		return null;
	}

	const candidates: ComponentSelectCandidate[] = [];
	for (let i = 0; i < selectionObject.candidates.length; i += 1) {
		const raw: unknown = selectionObject.candidates[i];
		if (!isObjectRecord(raw)) {
			continue;
		}
		const uuid: string = String(raw.uuid ?? '').trim();
		const libraryUuid: string = String(raw.libraryUuid ?? '').trim();
		if (!uuid || !libraryUuid) {
			continue;
		}
		candidates.push({
			uuid,
			libraryUuid,
			name: String(raw.name ?? '').trim(),
			symbolName: String(raw.symbolName ?? '').trim(),
			footprintName: String(raw.footprintName ?? '').trim(),
			description: String(raw.description ?? '').trim(),
			manufacturer: String(raw.manufacturer ?? '').trim(),
			manufacturerId: String(raw.manufacturerId ?? '').trim(),
			supplier: String(raw.supplier ?? '').trim(),
			supplierId: String(raw.supplierId ?? '').trim(),
			lcscInventory: Number(raw.lcscInventory ?? 0),
			lcscPrice: Number(raw.lcscPrice ?? 0),
		});
	}

	if (candidates.length === 0) {
		return null;
	}

	return {
		protocol: COMPONENT_SELECT_PROTOCOL,
		title: String(selectionObject.title ?? '').trim() || '器件选型',
		description: String(selectionObject.description ?? '').trim() || '请从以下候选器件中选择一个：',
		candidates,
	};
}

/**
 * 在工具消息节点内渲染器件选型交互面板，等待用户选择并确认。
 * @param options - 面板选项。
 * @returns 用户选择结果。
 */
export async function requestComponentSelectPanel(options: RequestSelectPanelOptions): Promise<RequestSelectPanelResult> {
	ensureComponentSelectStyleMounted();

	const messageNode: HTMLElement = options.messageNode;
	const selectRequest: ComponentSelectRequest = options.selectRequest;
	const targetContainer: HTMLElement
		= (messageNode.querySelector('.fold-content') as HTMLElement | null) ?? messageNode;

	return await new Promise<RequestSelectPanelResult>((resolve) => {
		let resolved: boolean = false;
		let selectedIndex: number = 0;
		let rowElements: HTMLTableRowElement[] = [];

		// 创建面板根节点。
		const panelElement: HTMLDivElement = document.createElement('div');
		panelElement.className = 'component-select-panel';

		// 标题。
		const titleElement: HTMLDivElement = document.createElement('div');
		titleElement.className = 'component-select-title';
		titleElement.textContent = selectRequest.title;
		panelElement.appendChild(titleElement);

		// 描述。
		const descElement: HTMLDivElement = document.createElement('div');
		descElement.className = 'component-select-desc';
		descElement.textContent = selectRequest.description;
		panelElement.appendChild(descElement);

		// 表格容器。
		const tableWrap: HTMLDivElement = document.createElement('div');
		tableWrap.className = 'component-select-table-wrap';

		const table: HTMLTableElement = document.createElement('table');
		table.className = 'component-select-table';

		// 表头。
		const thead: HTMLTableSectionElement = document.createElement('thead');
		const headerRow: HTMLTableRowElement = document.createElement('tr');
		const headers: string[] = ['名称', '封装', '描述', '厂商', '立创库存/价格'];
		for (let hi = 0; hi < headers.length; hi += 1) {
			const th: HTMLTableCellElement = document.createElement('th');
			th.textContent = headers[hi];
			headerRow.appendChild(th);
		}
		thead.appendChild(headerRow);
		table.appendChild(thead);

		// 更新行高亮状态。
		function updateRowHighlight(newIndex: number): void {
			if (rowElements[selectedIndex]) {
				rowElements[selectedIndex].classList.remove('selected');
			}
			selectedIndex = newIndex;
			if (rowElements[selectedIndex]) {
				rowElements[selectedIndex].classList.add('selected');
			}
		}

		// 表体。
		const tbody: HTMLTableSectionElement = document.createElement('tbody');
		rowElements = [];
		for (let ri = 0; ri < selectRequest.candidates.length; ri += 1) {
			const candidate: ComponentSelectCandidate = selectRequest.candidates[ri];
			const row: HTMLTableRowElement = document.createElement('tr');
			row.className = 'component-select-row';
			if (ri === 0) {
				row.classList.add('selected');
			}
			rowElements.push(row);

			const cells: string[] = [
				candidate.name || '—',
				candidate.footprintName || '—',
				candidate.description || '—',
				candidate.manufacturer || (candidate.supplier || '—'),
				formatInventoryText(candidate.lcscInventory, candidate.lcscPrice),
			];
			for (let ci = 0; ci < cells.length; ci += 1) {
				const td: HTMLTableCellElement = document.createElement('td');
				td.textContent = cells[ci];
				if (ci === 2) {
					// 描述列允许自动换行，截断过长文本。
					td.title = cells[ci];
				}
				row.appendChild(td);
			}

			// 点击行更新选中状态。
			const capturedIndex: number = ri;
			row.addEventListener('click', () => {
				updateRowHighlight(capturedIndex);
			});

			tbody.appendChild(row);
		}
		table.appendChild(tbody);
		tableWrap.appendChild(table);
		panelElement.appendChild(tableWrap);

		// 操作按钮区。
		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'component-select-actions';

		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.className = 'component-select-button cancel';
		cancelButton.type = 'button';
		cancelButton.textContent = '取消';

		const confirmButton: HTMLButtonElement = document.createElement('button');
		confirmButton.className = 'component-select-button confirm';
		confirmButton.type = 'button';
		confirmButton.textContent = '确定';

		actionsElement.appendChild(cancelButton);
		actionsElement.appendChild(confirmButton);
		panelElement.appendChild(actionsElement);

		targetContainer.appendChild(panelElement);
		if (options.onMounted) {
			options.onMounted();
		}

		// 统一收尾：移除面板并 resolve。
		let onAbort: (() => void) | null = null;
		const finalize = (result: RequestSelectPanelResult): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			if (options.abortSignal && onAbort) {
				options.abortSignal.removeEventListener('abort', onAbort);
			}
			panelElement.remove();
			resolve(result);
		};

		onAbort = (): void => {
			finalize({ confirmed: false });
		};

		cancelButton.addEventListener('click', () => {
			finalize({ confirmed: false });
		});

		confirmButton.addEventListener('click', () => {
			const selected: ComponentSelectCandidate | undefined = selectRequest.candidates[selectedIndex];
			finalize({ confirmed: true, candidate: selected });
		});

		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				onAbort();
				return;
			}
			options.abortSignal.addEventListener('abort', onAbort, { once: true });
		}
	});
}
