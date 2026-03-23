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
	`\tdisplay: block;`,
	`\twidth: 100%;`,
	`\toverflow-x: hidden;`,
	`\toverflow-y: auto;`,
	`\tmax-height: calc(8 * 33px);`,
	`\tborder: 1px solid var(--input-border, #d0d0d0);`,
	`\tborder-radius: 6px;`,
	`}`,
	`.component-select-table {`,
	`\ttable-layout: fixed;`,
	`\twidth: 100%;`,
	`\tborder-collapse: collapse;`,
	`\tfont-size: 11px;`,
	`}`,
	`.component-select-table th {`,
	`\tposition: sticky;`,
	`\ttop: 0;`,
	`\tz-index: 1;`,
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
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.component-select-col-link {`,
	`\tcolor: var(--chat-input-box-focus-border, #1890ff);`,
	`\ttext-decoration: none;`,
	`\tcursor: pointer;`,
	`}`,
	`.component-select-col-link:hover {`,
	`\ttext-decoration: underline;`,
	`}`,
	`.component-select-col-params {`,
	`\tmax-width: 200px;`,
	`\toverflow: hidden;`,
	`\ttext-overflow: ellipsis;`,
	`}`,
	`.component-select-col-monospace {`,
	`\tfont-family: monospace;`,
	`\tfont-size: 11px;`,
	`}`,
	`.component-select-table tr:last-child td {`,
	`\tborder-bottom: none;`,
	`}`,
	`.component-select-row {`,
	`\tcursor: pointer;`,
	`\ttransition: background 0.12s, box-shadow 0.12s;`,
	`}`,
	`/* 浅色主题：悬停 */`,
	`.component-select-row:hover {`,
	`\tbackground: #e8f0fe;`,
	`}`,
	`/* 浅色主题：选中 */`,
	`.component-select-row.selected {`,
	`\tbackground: #d0e4ff;`,
	`\tbox-shadow: inset 3px 0 0 #1890ff;`,
	`}`,
	`.component-select-row.selected td {`,
	`\tcolor: #0958d9;`,
	`\tfont-weight: 600;`,
	`}`,
	`/* 深色主题：悬停 */`,
	`@media (prefers-color-scheme: dark) {`,
	`\t.component-select-row:hover {`,
	`\t\tbackground: rgba(255, 255, 255, 0.10);`,
	`\t}`,
	`\t/* 深色主题：选中 */`,
	`\t.component-select-row.selected {`,
	`\t\tbackground: rgba(24, 144, 255, 0.22);`,
	`\t\tbox-shadow: inset 3px 0 0 #40a9ff;`,
	`\t}`,
	`\t.component-select-row.selected td {`,
	`\t\tcolor: #69c0ff;`,
	`\t\tfont-weight: 600;`,
	`\t}`,
	`}`,
	`.component-select-actions {`,
	`\tmargin-top: 4px;`,
	`\tdisplay: flex;`,
	`\tgap: 8px;`,
	`\tjustify-content: flex-end;`,
	`}`,
	`.component-select-button {`,
	`\theight: 26px;`,
	`\tpadding: 0 10px;`,
	`\tborder-radius: 5px;`,
	`\tborder: 1px solid #b4b4b4;`,
	`\tbackground: #ececec;`,
	`\tcolor: #3f3f3f;`,
	`\tfont-size: 12px;`,
	`\tfont-weight: 600;`,
	`\tcursor: pointer;`,
	`\ttransition: background 0.15s ease, border-color 0.15s ease;`,
	`}`,
	`.component-select-button:hover:not(:disabled) {`,
	`\tbackground: #e0e0e0;`,
	`}`,
	`.component-select-button:active:not(:disabled) {`,
	`\tbackground: #d3d3d3;`,
	`}`,
	`.component-select-button.confirm {`,
	`\tbackground: #3f7fb9;`,
	`\tcolor: #f6fbff;`,
	`\tborder-color: #3f7fb9;`,
	`}`,
	`.component-select-button.confirm:hover:not(:disabled) {`,
	`\tbackground: #3674ab;`,
	`\tborder-color: #3674ab;`,
	`}`,
	`.component-select-button.confirm:active:not(:disabled) {`,
	`\tbackground: #2f6698;`,
	`\tborder-color: #2f6698;`,
	`}`,
	`.component-select-button:disabled {`,
	`\topacity: 1;`,
	`\tborder-color: #c5c5c5;`,
	`\tbackground: #e6e6e6;`,
	`\tcolor: #8b8b8b;`,
	`\tcursor: default;`,
	`}`,
	`@media (prefers-color-scheme: dark) {`,
	`\t.component-select-button {`,
	`\t\tborder-color: #727272;`,
	`\t\tbackground: #555555;`,
	`\t\tcolor: #f5f7fa;`,
	`\t}`,
	`\t.component-select-button:hover:not(:disabled) {`,
	`\t\tbackground: #646464;`,
	`\t}`,
	`\t.component-select-button:active:not(:disabled) {`,
	`\t\tbackground: #4a4a4a;`,
	`\t}`,
	`\t.component-select-button:disabled {`,
	`\t\tborder-color: #5f5f5f;`,
	`\t\tbackground: #4b4b4b;`,
	`\t\tcolor: #9a9a9a;`,
	`\t}`,
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
		// 每列名称及宽度，使用百分比以适配任意容器宽度，table-layout:fixed 下按比例分配。
		const headers: Array<{ label: string; width: string }> = [
			{ label: '型号', width: '24%' },
			{ label: '封装', width: '22%' },
			{ label: '描述', width: '32%' },
			{ label: '品牌', width: '22%' },
		];
		for (let hi = 0; hi < headers.length; hi += 1) {
			const th: HTMLTableCellElement = document.createElement('th');
			th.textContent = headers[hi].label;
			th.style.width = headers[hi].width;
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

			// 型号列：manufacturerId 无值则显示"—"，不回退到 name。
			const manufacturerPartNumber: string = candidate.manufacturerId || '—';
			const supplierId: string = candidate.supplierId || '';
			const detailUrl: string = supplierId
				? `https://item.szlcsc.com/${supplierId.replace(/^C/i, '')}.html`
				: '';

			// 型号 td
			const tdPartNum: HTMLTableCellElement = document.createElement('td');
			tdPartNum.title = manufacturerPartNumber;
			if (detailUrl) {
				const linkEl: HTMLAnchorElement = document.createElement('a');
				linkEl.className = 'component-select-col-link';
				linkEl.textContent = manufacturerPartNumber;
				linkEl.href = detailUrl;
				linkEl.target = '_blank';
				linkEl.rel = 'noopener noreferrer';
				// 防止链接点击触发行选中逆转。
				linkEl.addEventListener('click', (e: MouseEvent) => {
					e.stopPropagation();
				});
				tdPartNum.appendChild(linkEl);
			}
			else {
				tdPartNum.textContent = manufacturerPartNumber;
			}
			row.appendChild(tdPartNum);

			// 其余固定列：封装 → 描述 → 品牌
			// 描述 tooltip：将分号/换行分隔的参数拆开，每条占一行。
			const rawDesc: string = candidate.description || '';
			const descTooltip: string | undefined = rawDesc
				? rawDesc.split(/[;；\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0).join('\n')
				: undefined;
			const restCells: Array<{ text: string; title?: string }> = [
				{ text: candidate.footprintName || '—' },
				{ text: rawDesc || '—', title: descTooltip },
				{ text: candidate.manufacturer || candidate.supplier || '—' },
			];
			for (let ci = 0; ci < restCells.length; ci += 1) {
				const td: HTMLTableCellElement = document.createElement('td');
				const cellDef = restCells[ci];
				td.textContent = cellDef.text;
				// 有显式 title 用 title，否则用单元格文本作为悬停提示。
				td.title = cellDef.title !== undefined ? cellDef.title : cellDef.text;
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

export interface ApplyComponentSelectOptions {
	toolResult: unknown;
	messageNode: HTMLElement;
	abortSignal?: AbortSignal | null;
	// 面板显示前回调，用于更新消息区显示内容。
	onBeforeShow?: () => void;
	// 面板挂载到 DOM 后回调，用于触发滚动等操作。
	onMounted?: () => void;
}

/**
 * 检测工具返回结果是否包含器件选型协议，若是则展示交互面板并返回最终结果。
 * @param options - 交互选项。
 * @returns 若不含选型协议返回 null；否则返回转换后的工具结果对象。
 */
export async function applyComponentSelectInteraction(options: ApplyComponentSelectOptions): Promise<unknown> {
	const selectRequest: ComponentSelectRequest | null = parseComponentSelectRequest(options.toolResult);
	if (!selectRequest) {
		return null;
	}
	if (options.onBeforeShow) {
		options.onBeforeShow();
	}
	const selectResult: RequestSelectPanelResult = await requestComponentSelectPanel({
		messageNode: options.messageNode,
		selectRequest,
		abortSignal: options.abortSignal,
		onMounted: options.onMounted,
	});
	if (options.abortSignal && options.abortSignal.aborted) {
		throw new DOMException('【诊断信息】用户已停止', 'AbortError');
	}
	if (!selectResult.confirmed || !selectResult.candidate) {
		return {
			ok: false,
			error: '用户取消器件选型，工具执行已终止。',
			errorCode: 'COMPONENT_SELECT_CANCELLED',
		};
	}
	return {
		ok: true,
		selectedCandidate: selectResult.candidate,
		message: `用户已选择器件：${String(selectResult.candidate.name || '')}`,
	};
}
