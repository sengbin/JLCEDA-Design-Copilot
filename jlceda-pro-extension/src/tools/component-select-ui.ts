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
import { OverlayScrollbars } from 'overlayscrollbars';
import { COMPONENT_SELECT_PROTOCOL } from './component-select';

interface RequestSelectPanelOptions {
	messageNode: HTMLElement;
	selectRequest: ComponentSelectRequest;
	fetchPage?: (page: number) => Promise<ComponentSelectCandidate[]>;
	abortSignal?: AbortSignal | null;
	onMounted?: () => void;
}

interface RequestSelectPanelResult {
	reason: 'confirmed' | 'cancelled' | 'aborted';
	confirmed: boolean;
	candidate?: ComponentSelectCandidate;
}

const COMPONENT_SELECT_STYLE_ID: string = 'jlceda-component-select-style';

const COMPONENT_SELECT_STYLE_TEXT: string = [
	`.component-select-overlay {`,
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
	`.component-select-panel {`,
	`	margin: 0;`,
	`	width: min(820px, calc(100vw - 48px));`,
	`	max-width: 100%;`,
	`\tpadding: 12px;`,
	`\tborder: 1px solid var(--tool-border, #d2d2d2);`,
	`\tborder-radius: 8px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`	box-sizing: border-box;`,
	`	box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);`,
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

	`\twidth: 100%;`,
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
	`\tdisplay: flex;`,
	`\tgap: 8px;`,
	`\talign-items: center;`,
	`\tjustify-content: space-between;`,
	`\tpadding: 4px 0;`,
	`}`,
	`.component-select-button {`,
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
	`.component-select-button:hover:not(:disabled) {`,
	`\tbackground: #dcdcdc;`,
	`\tborder-color: #888888;`,
	`}`,
	`.component-select-button:active:not(:disabled) {`,
	`\tbackground: #cfcfcf;`,
	`\tborder-color: #787878;`,
	`}`,
	`.component-select-button.confirm {`,
	`\tbackground: #2d6faa;`,
	`\tcolor: #ffffff;`,
	`\tborder-color: #2d6faa;`,
	`}`,
	`.component-select-button.confirm:hover:not(:disabled) {`,
	`\tbackground: #2663a0;`,
	`\tborder-color: #2663a0;`,
	`}`,
	`.component-select-button.confirm:active:not(:disabled) {`,
	`\tbackground: #205588;`,
	`\tborder-color: #205588;`,
	`}`,
	`.component-select-button:disabled {`,
	`\topacity: 1;`,
	`\tborder-color: #c0c0c0;`,
	`\tbackground: #e0e0e0;`,
	`\tcolor: #909090;`,
	`\tcursor: default;`,
	`}`,
	`@media (prefers-color-scheme: dark) {`,
	`\t.component-select-panel {`,
	`\t\tbackground: #1e1e1e;`,
	`\t\tborder-color: #3c3c3c;`,
	`\t}`,
	`\t.component-select-title {`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-select-desc {`,
	`\t\tcolor: #b0b0b0;`,
	`\t}`,
	`\t.component-select-table-wrap {`,
	`\t\tborder-color: #3c3c3c;`,
	`\t}`,
	`\t.component-select-table th {`,
	`\t\tbackground: #2a2a2a;`,
	`\t\tcolor: #b0b0b0;`,
	`\t\tborder-bottom-color: #3c3c3c;`,
	`\t}`,
	`\t.component-select-table td {`,
	`\t\tcolor: #e8e8e8;`,
	`\t\tborder-bottom-color: #3c3c3c;`,
	`\t}`,
	`\t.component-select-button {`,
	`\t\tborder-color: #5a5a5a;`,
	`\t\tbackground: #3a3a3a;`,
	`\t\tcolor: #e8e8e8;`,
	`\t}`,
	`\t.component-select-button:hover:not(:disabled) {`,
	`\t\tbackground: #484848;`,
	`\t\tborder-color: #727272;`,
	`\t}`,
	`\t.component-select-button:active:not(:disabled) {`,
	`\t\tbackground: #2f2f2f;`,
	`\t\tborder-color: #5a5a5a;`,
	`\t}`,
	`\t.component-select-button.confirm {`,
	`\t\tbackground: #2d6faa;`,
	`\t\tcolor: #ffffff;`,
	`\t\tborder-color: #4a8fc8;`,
	`\t}`,
	`\t.component-select-button.confirm:hover:not(:disabled) {`,
	`\t\tbackground: #2663a0;`,
	`\t\tborder-color: #4087c0;`,
	`\t}`,
	`\t.component-select-button.confirm:active:not(:disabled) {`,
	`\t\tbackground: #205588;`,
	`\t\tborder-color: #357ab0;`,
	`\t}`,
	`\t.component-select-button:disabled {`,
	`\t\tborder-color: #444444;`,
	`\t\tbackground: #2a2a2a;`,
	`\t\tcolor: #666666;`,
	`\t}`,
	`}`,
	`.component-select-pagination-nav {`,
	`\tdisplay: flex;`,
	`\talign-items: baseline;`,
	`\tgap: 8px;`,
	`}`,
	`.component-select-page-link {`,
	`\tfont-size: 12px;`,
	`\tline-height: 22px;`,
	`\tcolor: var(--link-color, #0078d4);`,
	`\tcursor: pointer;`,
	`\ttext-decoration: none;`,
	`\tbackground: none;`,
	`\tborder: none;`,
	`\tpadding: 0;`,
	`\tuser-select: none;`,
	`}`,
	`.component-select-page-link:hover:not(:disabled) {`,
	`\ttext-decoration: underline;`,
	`}`,
	`.component-select-page-link:disabled {`,
	`\tcolor: var(--text-secondary, #9a9a9a);`,
	`\tcursor: default;`,
	`}`,
	`.component-select-page-dropdown {`,
	`\tposition: relative;`,
	`\tdisplay: inline-flex;`,
	`\talign-items: center;`,
	`}`,
	`.component-select-page-trigger {`,
	`\tdisplay: flex;`,
	`\talign-items: center;`,
	`\tgap: 4px;`,
	`\theight: 22px;`,
	`\tpadding: 0 4px;`,
	`\tbackground: transparent;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tfont-size: 12px;`,
	`\tline-height: 22px;`,
	`\tborder: none;`,
	`\tborder-radius: 4px;`,
	`\twhite-space: nowrap;`,
	`\toutline: none;`,
	`\tcursor: pointer;`,
	`}`,
	`.component-select-page-trigger:hover {`,
	`\tbackground: var(--control-hover-bg, rgba(0,0,0,0.06));`,
	`}`,
	`.component-select-page-trigger svg {`,
	`\twidth: 10px;`,
	`\theight: 10px;`,
	`\tflex-shrink: 0;`,
	`}`,
	`.component-select-page-chevron {`,
	`\ttransition: transform 0.2s ease;`,
	`}`,
	`.component-select-page-dropdown.open .component-select-page-chevron {`,
	`\ttransform: rotateX(180deg);`,
	`}`,
	`.component-select-page-spinner {`,
	`\tdisplay: none;`,
	`}`,
	`.component-select-page-dropdown.loading .component-select-page-chevron {`,
	`\tdisplay: none;`,
	`}`,
	`.component-select-page-dropdown.loading .component-select-page-spinner {`,
	`\tdisplay: block;`,
	`\tanimation: component-select-spin 0.9s linear infinite;`,
	`}`,
	`@keyframes component-select-spin {`,
	`\tfrom { transform: rotate(0deg); }`,
	`\tto { transform: rotate(360deg); }`,
	`}`,
	`.component-select-page-menu {`,
	`\tdisplay: none;`,
	`\tposition: absolute;`,
	`\tleft: 0;`,
	`\tbottom: calc(100% + 4px);`,
	`\tz-index: 20;`,
	`\tmin-width: 100%;`,
	`\tmax-height: 180px;`,
	`\toverflow-y: auto;`,
	`\tpadding: 4px 0;`,
	`\tbackground: var(--model-dropdown-bg, #f2f2f2);`,
	`\tborder: 1px solid var(--model-dropdown-border, #c5c5c5);`,
	`\tborder-radius: 6px;`,
	`}`,
	`.component-select-page-dropdown.open .component-select-page-menu {`,
	`\tdisplay: block;`,
	`}`,
	`.component-select-page-option {`,
	`\tdisplay: block;`,
	`\twidth: calc(100% - 12px);`,
	`\tpadding: 4px 12px;`,
	`\tborder: none;`,
	`\tbackground: transparent;`,
	`\tcolor: var(--model-dropdown-text, var(--text-primary, #2f2f2f));`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.4;`,
	`\twhite-space: nowrap;`,
	`\tborder-radius: 4px;`,
	`\tmargin: 1px 6px;`,
	`\ttext-align: left;`,
	`\tcursor: pointer;`,
	`}`,
	`.component-select-page-option:hover {`,
	`\tbackground: var(--dropdown-option-hover, rgba(0,0,0,0.08));`,
	`\tcolor: var(--dropdown-option-hover-text, var(--text-primary, #2f2f2f));`,
	`}`,
	`.component-select-page-option.is-active {`,
	`\tbackground: transparent;`,
	`\tfont-weight: 600;`,
	`}`,
	`.component-select-table-hint {`,
	`	font-size: 11px;`,
	`	color: var(--text-secondary, #888888);`,
	`	margin-bottom: 4px;`,
	`	user-select: none;`,
	`}`,
	`.component-select-tooltip {`,
	`	position: fixed;`,
	`	z-index: 9999;`,
	`	min-width: 180px;`,
	`	max-width: 300px;`,
	`	overflow: hidden;`,
	`	background: #252525;`,
	`	color: #e8e8e8;`,
	`	border: 1px solid #4a4a4a;`,
	`	border-radius: 8px;`,
	`	font-size: 11px;`,
	`	line-height: 1.45;`,
	`	word-break: break-word;`,
	`	pointer-events: none;`,
	`	box-shadow: 0 8px 20px rgba(0,0,0,0.32);`,
	`	display: none;`,
	`}`,
	`.component-select-tooltip-row {`,
	`	display: flex;`,
	`	align-items: flex-start;`,
	`	gap: 6px;`,
	`	padding: 4px 8px;`,
	`}`,
	`.component-select-tooltip-row:nth-child(odd) {`,
	`	background: rgba(255,255,255,0.04);`,
	`}`,
	`.component-select-tooltip-row:nth-child(even) {`,
	`	background: rgba(255,255,255,0.08);`,
	`}`,
	`.component-select-tooltip-label {`,
	`	flex: 0 0 auto;`,
	`	font-weight: 700;`,
	`	color: #ffffff;`,
	`	white-space: nowrap;`,
	`}`,
	`.component-select-tooltip-value {`,
	`	flex: 1;`,
	`	color: #d9d9d9;`,
	`	min-width: 0;`,
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
		pageSize: typeof selectionObject.pageSize === 'number' && selectionObject.pageSize > 0
			? selectionObject.pageSize
			: candidates.length,
		currentPage: typeof selectionObject.currentPage === 'number' && selectionObject.currentPage > 0
			? selectionObject.currentPage
			: 1,
	};
}

// 解析描述文本，将每段拆成“参数名 / 参数值”。
function parseDescriptionItems(rawDesc: string): Array<{ label: string; value: string }> {
	return rawDesc
		.split(/[;；\n]+/)
		.map((s: string) => {
			const trimmed: string = s.trim();
			if (!trimmed) {
				return null;
			}
			const colonIdx: number = trimmed.search(/[:\uFF1A]/);
			if (colonIdx < 0) {
				return {
					label: '',
					value: trimmed,
				};
			}
			return {
				label: trimmed.slice(0, colonIdx).trim(),
				value: trimmed.slice(colonIdx + 1).trim(),
			};
		})
		.filter((item): item is { label: string; value: string } => {
			return Boolean(item && (item.label || item.value));
		});
}

// 格式化描述文本，去掉每段“参数名:”前缀，只保留参数值。
function formatDescriptionShort(rawDesc: string): string {
	return parseDescriptionItems(rawDesc)
		.map(item => item.value || item.label)
		.filter((s: string) => s.length > 0)
		.join(';');
}

// 渲染结构化描述 tooltip，使参数名更清晰且行间更规整。
function renderDescriptionTooltip(tooltipElement: HTMLDivElement, rawDesc: string): void {
	while (tooltipElement.firstChild) {
		tooltipElement.removeChild(tooltipElement.firstChild);
	}
	const items: Array<{ label: string; value: string }> = parseDescriptionItems(rawDesc);
	if (items.length === 0) {
		tooltipElement.textContent = rawDesc.trim();
		return;
	}
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		const rowElement: HTMLDivElement = document.createElement('div');
		rowElement.className = 'component-select-tooltip-row';
		if (item.label) {
			const labelElement: HTMLSpanElement = document.createElement('span');
			labelElement.className = 'component-select-tooltip-label';
			labelElement.textContent = `${item.label}:`;
			rowElement.appendChild(labelElement);
		}
		const valueElement: HTMLSpanElement = document.createElement('span');
		valueElement.className = 'component-select-tooltip-value';
		valueElement.textContent = item.value || '—';
		rowElement.appendChild(valueElement);
		tooltipElement.appendChild(rowElement);
	}
}

// 更新 tooltip 位置，避免超出视口。
function positionDescriptionTooltip(tooltipElement: HTMLDivElement, event: MouseEvent): void {
	const gapX = 10;
	const gapY = 14;
	const viewportPadding = 12;
	let left = event.clientX + gapX;
	let top = event.clientY + gapY;
	const rect = tooltipElement.getBoundingClientRect();
	if ((left + rect.width) > (window.innerWidth - viewportPadding)) {
		left = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
	}
	if ((top + rect.height) > (window.innerHeight - viewportPadding)) {
		top = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
	}
	tooltipElement.style.left = `${left}px`;
	tooltipElement.style.top = `${top}px`;
}

/**
 * 在工具消息节点内渲染器件选型交互面板，等待用户选择并确认。
 * @param options - 面板选项。
 * @returns 用户选择结果。
 */
export async function requestComponentSelectPanel(options: RequestSelectPanelOptions): Promise<RequestSelectPanelResult> {
	ensureComponentSelectStyleMounted();

	const selectRequest: ComponentSelectRequest = options.selectRequest;

	return await new Promise<RequestSelectPanelResult>((resolve) => {
		let resolved: boolean = false;
		let selectedIndex: number = 0;
		let rowElements: HTMLTableRowElement[] = [];
		let currentPage: number = selectRequest.currentPage;
		let currentCandidates: ComponentSelectCandidate[] = selectRequest.candidates;
		const pageSize: number = selectRequest.pageSize;
		const hasFetchPage: boolean = typeof options.fetchPage === 'function';
		let isPageLoading: boolean = false;
		let tableOsInstance: any = null;
		const overlayElement: HTMLDivElement = document.createElement('div');
		overlayElement.className = 'component-select-overlay';

		// 创建面板根节点。
		const panelElement: HTMLDivElement = document.createElement('div');
		panelElement.className = 'component-select-panel';
		overlayElement.appendChild(panelElement);

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

		// 表格上方提示文字。
		const tableHintElement: HTMLDivElement = document.createElement('div');
		tableHintElement.className = 'component-select-table-hint';
		tableHintElement.textContent = '悬停“描述”列可查看完整参数详情';
		panelElement.appendChild(tableHintElement);

		// 自定义 tooltip 层，用于描述列悬停弹出（功能需要在 buildTbodyRows 中引用）。
		const tooltipElement: HTMLDivElement = document.createElement('div');
		tooltipElement.className = 'component-select-tooltip';
		document.body.appendChild(tooltipElement);

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

		// 表体容器。
		const tbody: HTMLTableSectionElement = document.createElement('tbody');

		// 构建指定候选列表的表体行，清空并重新填充 tbody。
		const buildTbodyRows = (candidates: ComponentSelectCandidate[]): void => {
			while (tbody.firstChild) {
				tbody.removeChild(tbody.firstChild);
			}
			rowElements = [];
			selectedIndex = 0;
			for (let ri = 0; ri < candidates.length; ri += 1) {
				const candidate: ComponentSelectCandidate = candidates[ri];
				const row: HTMLTableRowElement = document.createElement('tr');
				row.className = 'component-select-row';
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
				const descShort: string = rawDesc ? formatDescriptionShort(rawDesc) : '—';
				const descTooltip: string | undefined = rawDesc
					? rawDesc.split(/[;；\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0).join('\n')
					: undefined;
				const restCells: Array<{ text: string; title?: string }> = [
					{ text: candidate.footprintName || '—' },
					{ text: descShort, title: descTooltip },
					{ text: candidate.manufacturer || candidate.supplier || '—' },
				];
				for (let ci = 0; ci < restCells.length; ci += 1) {
					const td: HTMLTableCellElement = document.createElement('td');
					const cellDef = restCells[ci];
					td.textContent = cellDef.text;
					if (ci === 1 && cellDef.title) {
						// 描述列使用自定义 tooltip，按参数名和值分行展示。
						const tooltipText: string = cellDef.title;
						td.addEventListener('mouseenter', () => {
							renderDescriptionTooltip(tooltipElement, tooltipText);
							tooltipElement.style.display = 'block';
						});
						td.addEventListener('mousemove', (e: MouseEvent) => {
							positionDescriptionTooltip(tooltipElement, e);
						});
						td.addEventListener('mouseleave', () => {
							tooltipElement.style.display = 'none';
						});
					}
					else {
						// 其他列使用原生 title 悬停提示。
						td.title = cellDef.title !== undefined ? cellDef.title : cellDef.text;
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
			if (rowElements[0]) {
				rowElements[0].classList.add('selected');
			}
		};

		buildTbodyRows(currentCandidates);
		table.appendChild(tbody);
		tableWrap.appendChild(table);
		panelElement.appendChild(tableWrap);

		// 操作栏：左侧翻页控件，右侧取消/确定按钮。
		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'component-select-actions';

		let prevPageButton: HTMLButtonElement | null = null;
		let nextPageButton: HTMLButtonElement | null = null;
		let pageDropdown: HTMLDivElement | null = null;
		let pageDropdownTrigger: HTMLButtonElement | null = null;
		let pageDropdownMenu: HTMLDivElement | null = null;
		// 已知最大页码（用于动态生成下拉列表项）。
		let knownMaxPage: number = currentPage;
		if (hasFetchPage) {
			const navGroup: HTMLDivElement = document.createElement('div');
			navGroup.className = 'component-select-pagination-nav';

			prevPageButton = document.createElement('button');
			prevPageButton.className = 'component-select-page-link';
			prevPageButton.type = 'button';
			prevPageButton.textContent = '上一页';
			prevPageButton.disabled = (currentPage <= 1);

			nextPageButton = document.createElement('button');
			nextPageButton.className = 'component-select-page-link';
			nextPageButton.type = 'button';
			nextPageButton.textContent = '下一页';
			nextPageButton.disabled = (currentCandidates.length < pageSize);

			// 自定义页码下拉框。
			pageDropdown = document.createElement('div');
			pageDropdown.className = 'component-select-page-dropdown';

			pageDropdownTrigger = document.createElement('button');
			pageDropdownTrigger.className = 'component-select-page-trigger';
			pageDropdownTrigger.type = 'button';
			pageDropdownTrigger.innerHTML = `第 ${currentPage} 页<svg class="component-select-page-chevron" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><use xlink:href="#icon-chevron-down"></use></svg><svg class="component-select-page-spinner" viewBox="0 0 12 12" focusable="false" aria-hidden="true"><use xlink:href="#icon-spinner-half"></use></svg>`;

			pageDropdownMenu = document.createElement('div');
			pageDropdownMenu.className = 'component-select-page-menu';
			pageDropdownMenu.setAttribute('role', 'listbox');

			pageDropdown.appendChild(pageDropdownTrigger);
			pageDropdown.appendChild(pageDropdownMenu);

			navGroup.appendChild(prevPageButton);
			navGroup.appendChild(nextPageButton);
			navGroup.appendChild(pageDropdown);

			actionsElement.appendChild(navGroup);
		}

		const buttonsGroup: HTMLDivElement = document.createElement('div');
		buttonsGroup.className = 'component-select-pagination-nav';

		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.className = 'component-select-button cancel';
		cancelButton.type = 'button';
		cancelButton.textContent = '取消';

		const confirmButton: HTMLButtonElement = document.createElement('button');
		confirmButton.className = 'component-select-button confirm';
		confirmButton.type = 'button';
		confirmButton.textContent = '确定';

		buttonsGroup.appendChild(cancelButton);
		buttonsGroup.appendChild(confirmButton);
		actionsElement.appendChild(buttonsGroup);
		panelElement.appendChild(actionsElement);

		document.body.appendChild(overlayElement);
		// 面板挂载到 DOM 后初始化 OverlayScrollbars。
		tableOsInstance = OverlayScrollbars(tableWrap, {
			overflow: {
				x: 'hidden',
				y: 'scroll',
			},
			scrollbars: {
				theme: 'os-theme-jlceda',
				autoHide: 'scroll',
				autoHideDelay: 1000,
				clickScroll: true,
			},
		});
		// 手动监听 viewport 鼠标进出，实现悬停时显示滚动条、离开后延迟隐藏。
		if (tableOsInstance) {
			const tableOsViewport: HTMLElement = tableOsInstance.elements().viewport;
			let tableHoverTimerId: number = 0;
			let tableIsHovering: boolean = false;
			tableOsViewport.addEventListener('pointerenter', () => {
				tableIsHovering = true;
				if (tableHoverTimerId) {
					window.clearTimeout(tableHoverTimerId);
					tableHoverTimerId = 0;
				}
				tableOsInstance.options({
					scrollbars: {
						theme: 'os-theme-jlceda',
						autoHide: 'never',
						autoHideDelay: 1000,
						clickScroll: true,
					},
				});
			}, { passive: true });
			tableOsViewport.addEventListener('pointerleave', () => {
				tableIsHovering = false;
				if (tableHoverTimerId) {
					window.clearTimeout(tableHoverTimerId);
				}
				tableHoverTimerId = window.setTimeout(() => {
					tableHoverTimerId = 0;
					if (!tableIsHovering) {
						tableOsInstance.options({
							scrollbars: {
								theme: 'os-theme-jlceda',
								autoHide: 'scroll',
								autoHideDelay: 1000,
								clickScroll: true,
							},
						});
					}
				}, 1000);
			}, { passive: true });
		}
		// 分页按钮和下拉框事件处理（在 OverlayScrollbars 初始化后绑定，翻页后可滚动到顶部）。
		if (hasFetchPage && prevPageButton !== null && nextPageButton !== null
			&& pageDropdown !== null && pageDropdownTrigger !== null && pageDropdownMenu !== null) {
			const prevBtn: HTMLButtonElement = prevPageButton;
			const nextBtn: HTMLButtonElement = nextPageButton;
			const dropdown: HTMLDivElement = pageDropdown;
			const dropdownTrigger: HTMLButtonElement = pageDropdownTrigger;
			const dropdownMenu: HTMLDivElement = pageDropdownMenu;
			const doFetchPage = options.fetchPage as (page: number) => Promise<ComponentSelectCandidate[]>;

			// 更新下拉框触发器文字。
			function updateTriggerText(): void {
				dropdownTrigger.innerHTML = `第 ${currentPage} 页<svg class="component-select-page-chevron" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><use xlink:href="#icon-chevron-down"></use></svg><svg class="component-select-page-spinner" viewBox="0 0 12 12" focusable="false" aria-hidden="true"><use xlink:href="#icon-spinner-half"></use></svg>`;
			}

			// 渲染下拉菜单页码列表。
			function renderDropdownOptions(): void {
				dropdownMenu.innerHTML = '';
				for (let p: number = 1; p <= knownMaxPage; p++) {
					const optBtn: HTMLButtonElement = document.createElement('button');
					optBtn.className = `component-select-page-option${p === currentPage ? ' is-active' : ''}`;
					optBtn.type = 'button';
					optBtn.textContent = `第 ${p} 页`;
					const targetPage: number = p;
					optBtn.addEventListener('click', () => {
						if (isPageLoading || targetPage === currentPage) {
							dropdown.classList.remove('open');
							return;
						}
						dropdown.classList.remove('open');
						goToPage(targetPage);
					});
					dropdownMenu.appendChild(optBtn);
				}
			}

			// 跳转到指定页。
			function goToPage(targetPage: number): void {
				isPageLoading = true;
				prevBtn.disabled = true;
				nextBtn.disabled = true;
				dropdown.classList.add('loading');
				updateTriggerText();
				void doFetchPage(targetPage).then((newCandidates: ComponentSelectCandidate[]) => {
					if (newCandidates.length > 0) {
						currentPage = targetPage;
						currentCandidates = newCandidates;
						buildTbodyRows(newCandidates);
						if (tableOsInstance) {
							tableOsInstance.elements().viewport.scrollTop = 0;
						}
						if (currentPage > knownMaxPage) {
							knownMaxPage = currentPage;
						}
						// 当前页满载时，预设下一页可达。
						if (currentCandidates.length >= pageSize && currentPage >= knownMaxPage) {
							knownMaxPage = currentPage + 1;
						}
					}
				}).catch(() => {
					// 翻页失败则保留当前页。
				}).finally(() => {
					isPageLoading = false;
					dropdown.classList.remove('loading');
					updateTriggerText();
					prevBtn.disabled = (currentPage <= 1);
					nextBtn.disabled = (currentCandidates.length < pageSize);
					renderDropdownOptions();
				});
			}

			// 初始化已知页码（第一页满载时至少有第2页）。
			if (currentCandidates.length >= pageSize && knownMaxPage < currentPage + 1) {
				knownMaxPage = currentPage + 1;
			}
			renderDropdownOptions();

			// 下拉框开关。
			dropdownTrigger.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
				if (dropdown.classList.contains('open')) {
					dropdown.classList.remove('open');
				}
				else {
					renderDropdownOptions();
					dropdown.classList.add('open');
				}
			});

			// 点击下拉菜单内容时阻止冒泡。
			dropdownMenu.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
			});

			// 点击外部关闭下拉框。
			document.addEventListener('click', (ev: Event) => {
				if (!dropdown.contains(ev.target as Node)) {
					dropdown.classList.remove('open');
				}
			});

			prevBtn.addEventListener('click', () => {
				if (isPageLoading || currentPage <= 1) {
					return;
				}
				goToPage(currentPage - 1);
			});

			nextBtn.addEventListener('click', () => {
				if (isPageLoading || currentCandidates.length < pageSize) {
					return;
				}
				goToPage(currentPage + 1);
			});
		}
		if (options.onMounted) {
			options.onMounted();
			// 面板高度渲染完成后再次滚动到底部，确保完全可见。
			window.setTimeout(() => {
				if (options.onMounted) {
					options.onMounted();
				}
			}, 50);
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
			tooltipElement.remove();
			overlayElement.remove();
			resolve(result);
		};

		onAbort = (): void => {
			finalize({ reason: 'aborted', confirmed: false });
		};

		cancelButton.addEventListener('click', () => {
			finalize({ reason: 'cancelled', confirmed: false });
		});

		confirmButton.addEventListener('click', () => {
			const selected: ComponentSelectCandidate | undefined = currentCandidates[selectedIndex];
			finalize({ reason: 'confirmed', confirmed: true, candidate: selected });
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
	fetchPage?: (page: number) => Promise<ComponentSelectCandidate[]>;
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
	// 从工具返回值中提取翻页回调（运行时函数，不参与 JSON 序列化）。
	const toolResultObj: unknown = options.toolResult;
	const rawFetchPage: unknown = options.fetchPage
		?? (isObjectRecord(toolResultObj) ? (toolResultObj as Record<string, unknown>)._fetchPage : undefined);
	const rawSelectionKeyword: unknown = isObjectRecord(toolResultObj)
		? (toolResultObj as Record<string, unknown>)._selectionKeyword
		: undefined;
	const selectionKeyword: string = String(rawSelectionKeyword ?? '').trim();
	const rawMarkKeywordSkipped: unknown = isObjectRecord(toolResultObj)
		? (toolResultObj as Record<string, unknown>)._markKeywordSkipped
		: undefined;
	const fetchPage: ((page: number) => Promise<ComponentSelectCandidate[]>) | undefined
		= typeof rawFetchPage === 'function'
			? rawFetchPage as (page: number) => Promise<ComponentSelectCandidate[]>
			: undefined;

	const selectResult: RequestSelectPanelResult = await requestComponentSelectPanel({
		messageNode: options.messageNode,
		selectRequest,
		fetchPage,
		abortSignal: options.abortSignal,
		onMounted: options.onMounted,
	});
	if (options.abortSignal && options.abortSignal.aborted) {
		throw new DOMException('【诊断信息】用户已停止', 'AbortError');
	}
	if (selectResult.reason === 'aborted') {
		throw new DOMException('【诊断信息】用户已停止', 'AbortError');
	}
	if (selectResult.reason === 'cancelled') {
		if (typeof rawMarkKeywordSkipped === 'function') {
			rawMarkKeywordSkipped();
		}
		return {
			ok: true,
			skipped: true,
			skipReason: 'user-skipped-selection',
			message: selectionKeyword
				? `用户跳过了“${selectionKeyword}”的器件选型，禁止重试。请直接进行下一步，不得就该器件再做任何动作。`
				: '用户跳过了当前器件选型，禁止重试。请直接进行下一步，不得就该器件再做任何动作。',
		};
	}
	if (!selectResult.confirmed || !selectResult.candidate) {
		return {
			ok: false,
			error: '器件选型结果无效，未取得可用候选器件。',
			errorCode: 'COMPONENT_SELECT_INVALID_RESULT',
		};
	}
	return {
		ok: true,
		selectedCandidate: selectResult.candidate,
		message: `用户已最终确认器件：${String(selectResult.candidate.name || selectResult.candidate.uuid)}。后续必须以该器件为准，不得因 AI 预期不一致而要求用户重新选型，也不得自行改选其他候选器件。`,
	};
}
