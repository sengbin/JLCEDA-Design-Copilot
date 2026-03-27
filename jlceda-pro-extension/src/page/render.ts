// 文件说明：提供页面展示相关能力，包括图标符号表加载、Markdown 渲染、HTML 转义与展示文案格式化。
import {
	formatToolExecDisplayText,
	TOOL_EXEC_RECEIVED_DATA_BEGIN,
	TOOL_EXEC_RECEIVED_DATA_END,
	TOOL_EXEC_SENT_DATA_BEGIN,
	TOOL_EXEC_SENT_DATA_END,
} from '../debug';
import { activeBlobUrls } from '../tools/executor';
import { readExtensionTextFileByCandidates } from '../utils';

let svgIconSpriteLoading: any = false;
/**
 * 加载并注入 SVG 图标符号表到当前页面。
 */
export function ensureSvgIconSpriteLoaded() {
	if (document.getElementById('jlceda-chat-icon-sprite')) {
		return;
	}
	if (svgIconSpriteLoading) {
		return;
	}
	svgIconSpriteLoading = true;
	const mountSprite: any = (svgText: any) => {
		const parser = new DOMParser();
		const parsed = parser.parseFromString(String(svgText || ''), 'image/svg+xml');
		const symbols = parsed.querySelectorAll('symbol');
		if (!symbols || symbols.length === 0) {
			return false;
		}
		const spriteRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		spriteRoot.setAttribute('id', 'jlceda-chat-icon-sprite');
		spriteRoot.setAttribute('aria-hidden', 'true');
		spriteRoot.setAttribute('focusable', 'false');
		spriteRoot.style.position = 'absolute';
		spriteRoot.style.width = '0';
		spriteRoot.style.height = '0';
		spriteRoot.style.overflow = 'hidden';
		for (let index = 0; index < symbols.length; index += 1) {
			const symbolNode = symbols[index];
			spriteRoot.appendChild(document.importNode(symbolNode, true));
		}
		if (document.body) {
			document.body.insertBefore(spriteRoot, document.body.firstChild);
		}
		return true;
	};
	const extensionCandidates: any = ['dist/iframe/icons.svg', 'iframe/icons.svg', 'icons.svg'];
	Promise.resolve().then(async () => {
		const extensionResult: any = await readExtensionTextFileByCandidates(window, extensionCandidates);
		if (extensionResult && extensionResult.ok) {
			mountSprite(extensionResult.text);
		}
	}).finally(() => {
		svgIconSpriteLoading = false;
	});
}
/**
 * 关闭指定 iframe 页面。
 * @param iframeId - iframe 标识。
 */
export async function closeIFramePageById(iframeId: unknown): Promise<void> {
	const targetId: any = String(iframeId || '').trim();
	if (!targetId) {
		window.close();
		return;
	}
	try {
		const win: any = window;
		if (win.eda && win.eda.sys_IFrame && win.eda.sys_IFrame.closeIFrame) {
			await win.eda.sys_IFrame.closeIFrame(targetId);
			return;
		}
	}
	catch { }
	try {
		const parentWin: any = window.parent;
		if (parentWin && parentWin.eda && parentWin.eda.sys_IFrame && parentWin.eda.sys_IFrame.closeIFrame) {
			await parentWin.eda.sys_IFrame.closeIFrame(targetId);
			return;
		}
	}
	catch { }
	window.close();
}
/**
 * HTML 转义。
 * @param input - 输入文本。
 * @returns 安全文本。
 */
export function escapeHtml(input: unknown): string {
	return String(input || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
/**
 * 渲染行内 Markdown。
 * @param text - 文本。
 * @returns HTML。
 */
export function parseInlineMarkdown(text: unknown): string {
	let html: any = escapeHtml(text);
	html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br />');
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
	// blob: URL：在当前会话有效集合中则渲染为下载链接，否则显示失效提示。
	html = html.replace(/\[([^\]]+)\]\((blob:[^)\s]+)\)/g, (_match: string, name: string, url: string) => {
		if (activeBlobUrls.has(url)) {
			return `<a href="${url}" download="${name}">${name}</a>`;
		}
		return `${name}<span class="download-link-expired">（下载链接已失效）</span>`;
	});
	return html;
}
/**
 * 渲染 Markdown 文本。
 * @param markdownText - Markdown 文本。
 * @returns HTML。
 */
export function renderMarkdown(markdownText: unknown): string {
	const lines: any = String(markdownText || '').replace(/\r\n/g, '\n').split('\n');
	const output: string[] = [];
	let inCodeBlock: any = false;
	let codeLines: string[] = [];
	let inUnorderedList: any = false;
	let inOrderedList: any = false;
	function parseTableCells(rowText: unknown): string[] {
		const raw: any = String(rowText || '').trim();
		if (!raw || !raw.includes('|')) {
			return [];
		}
		// 兼容 Markdown 表格首尾可选的 |。
		const normalized: any = raw.replace(/^\|/, '').replace(/\|$/, '');
		return normalized.split('|').map((cellText?: any) => cellText.trim());
	}
	function isTableSeparatorRow(rowText: unknown, expectedCellCount: number): boolean {
		const cells: any = parseTableCells(rowText);
		if (cells.length === 0) {
			return false;
		}
		if (typeof expectedCellCount === 'number' && cells.length !== expectedCellCount) {
			return false;
		}
		for (let cellIndex: any = 0; cellIndex < cells.length; cellIndex += 1) {
			if (!/^:?-{3,}:?$/.test(cells[cellIndex])) {
				return false;
			}
		}
		return true;
	}
	function closeLists(): void {
		// 每次切换块级结构前，优先收拢未闭合列表，保证 HTML 结构完整。
		if (inUnorderedList) {
			output.push('</ul>');
			inUnorderedList = false;
		}
		if (inOrderedList) {
			output.push('</ol>');
			inOrderedList = false;
		}
	}
	for (let index: any = 0; index < lines.length; index += 1) {
		const line: any = lines[index];
		const trimmed: any = line.trim();
		// 代码块按三引号切换，内部内容不再做 Markdown 解析。
		if (trimmed.startsWith('```')) {
			if (inCodeBlock) {
				output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
				codeLines = [];
				inCodeBlock = false;
			}
			else {
				closeLists();
				inCodeBlock = true;
			}
			continue;
		}
		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}
		if (!trimmed) {
			closeLists();
			continue;
		}
		const headingMatch: any = trimmed.match(/^(#{1,6})\s+(\S.*)$/);
		if (headingMatch) {
			closeLists();
			const level: any = headingMatch[1].length;
			output.push(`<h${level}>${parseInlineMarkdown(headingMatch[2])}</h${level}>`);
			continue;
		}
		const nextTrimmed: any = index + 1 < lines.length ? lines[index + 1].trim() : '';
		const tableHeaderCells: any = parseTableCells(trimmed);
		if (tableHeaderCells.length > 0 && isTableSeparatorRow(nextTrimmed, tableHeaderCells.length)) {
			closeLists();
			const tableRows: string[][] = [];
			let tableIndex: any = index + 2;
			// 连续读取合法行，直到遇到空行或列数不一致。
			while (tableIndex < lines.length) {
				const tableLine: any = lines[tableIndex].trim();
				if (!tableLine) {
					break;
				}
				const rowCells: any = parseTableCells(tableLine);
				if (rowCells.length === 0 || rowCells.length !== tableHeaderCells.length) {
					break;
				}
				if (isTableSeparatorRow(tableLine, tableHeaderCells.length)) {
					tableIndex += 1;
					continue;
				}
				tableRows.push(rowCells);
				tableIndex += 1;
			}
			const theadHtml: any = `<thead><tr>${tableHeaderCells.map((cellText: any) => `<th>${parseInlineMarkdown(cellText)}</th>`).join('')}</tr></thead>`;
			let tbodyHtml: any = '';
			if (tableRows.length > 0) {
				tbodyHtml = `<tbody>${tableRows.map((rowCells?: any) => `<tr>${rowCells.map((cellText?: any) => `<td>${parseInlineMarkdown(cellText)}</td>`).join('')}</tr>`).join('')}</tbody>`;
			}
			output.push(`<table>${theadHtml}${tbodyHtml}</table>`);
			index = tableIndex - 1;
			continue;
		}
		const unorderedMatch: any = trimmed.match(/^[-*+]\s+(\S.*)$/);
		if (unorderedMatch) {
			if (inOrderedList) {
				output.push('</ol>');
				inOrderedList = false;
			}
			// 无序列表与有序列表互斥，进入前先关闭另一类列表。
			if (!inUnorderedList) {
				output.push('<ul>');
				inUnorderedList = true;
			}
			output.push(`<li>${parseInlineMarkdown(unorderedMatch[1])}</li>`);
			continue;
		}
		const orderedMatch: any = trimmed.match(/^\d+\.\s+(\S.*)$/);
		if (orderedMatch) {
			if (inUnorderedList) {
				output.push('</ul>');
				inUnorderedList = false;
			}
			// 有序列表按段落连续性组织，非列表行会统一在 closeLists 中关闭。
			if (!inOrderedList) {
				output.push('<ol>');
				inOrderedList = true;
			}
			output.push(`<li>${parseInlineMarkdown(orderedMatch[1])}</li>`);
			continue;
		}
		const blockquoteMatch: any = trimmed.match(/^>\s?(.+)$/);
		if (blockquoteMatch) {
			closeLists();
			output.push(`<blockquote>${parseInlineMarkdown(blockquoteMatch[1])}</blockquote>`);
			continue;
		}
		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			closeLists();
			output.push('<hr />');
			continue;
		}
		closeLists();
		output.push(`<p>${parseInlineMarkdown(line)}</p>`);
	}
	if (inCodeBlock) {
		output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
	}
	closeLists();
	return output.join('');
}
/**
 * 格式化工具执行状态文本。
 * @param toolCall - 工具调用对象。
 * @param toolResult - 工具结果对象。
 * @param running - 是否执行中。
 * @returns 格式化后的文本。
 */
export function formatToolExecRawText(toolCall?: any, toolResult?: any, running?: any) {
	return formatToolExecDisplayText(toolCall, toolResult, running);
}
/**
 * 渲染工具执行详情区块 HTML。
 * 固定格式：发送数据（JSON）→ 接收数据（JSON）→ 调用状态 → 返回结果 → 错误详情。
 * @param text - formatToolExecDisplayText 产生的结构化文本。
 * @returns HTML。
 */
export function renderToolExecPlainText(text: unknown): string {
	const rawText: any = String(text || '');
	// 从结构化文本中提取指定区块内容。
	function extractSection(beginMarker: string, endMarker: string): string | null {
		const beginIdx: any = rawText.indexOf(beginMarker);
		if (beginIdx < 0) {
			return null;
		}
		const contentStart: any = beginIdx + beginMarker.length;
		const endIdx: any = rawText.indexOf(endMarker, contentStart);
		if (endIdx < 0) {
			return null;
		}
		return rawText.substring(contentStart, endIdx).trim();
	}
	// 渲染 JSON 区块。autoHeight 为 true 时自适应高度，为 false 时限制高度由滚动库接管。
	function renderJsonSectionHtml(label: string, rawJson: string, autoHeight: boolean): string {
		let prettyJson: any = rawJson;
		try {
			prettyJson = JSON.stringify(JSON.parse(rawJson), null, 2);
		}
		catch { }
		const containerClass: any = autoHeight ? 'tool-exec-json-auto' : 'tool-exec-json-scroll';
		return `<div class="tool-exec-field"><div class="tool-exec-field-label">${escapeHtml(label)}</div><div class="${containerClass}"><pre class="tool-exec-json-pre"><code>${escapeHtml(prettyJson)}</code></pre></div></div>`;
	}
	const sentData: any = extractSection(TOOL_EXEC_SENT_DATA_BEGIN, TOOL_EXEC_SENT_DATA_END);
	const receivedData: any = extractSection(TOOL_EXEC_RECEIVED_DATA_BEGIN, TOOL_EXEC_RECEIVED_DATA_END);
	const callStatusMatch: any = rawText.match(/(?:^|\n)\s*调用状态[：:]\s*([^\r\n]+)/u);
	const resultStatusMatch: any = rawText.match(/(?:^|\n)\s*返回结果[：:]\s*([^\r\n]+)/u);
	const output: string[] = [];
	if (sentData !== null) {
		// 发送数据自适应高度，完整展示发送内容。
		output.push(renderJsonSectionHtml('发送数据：', sentData, true));
	}
	if (receivedData !== null) {
		// 接收数据限制高度，由 OverlayScrollbars 接管滚动条。
		output.push(renderJsonSectionHtml('接收数据：', receivedData, false));
	}
	if (callStatusMatch) {
		output.push(`<div class="tool-exec-field tool-exec-field-row"><span class="tool-exec-field-label">调用状态：</span><span class="tool-exec-field-value">${escapeHtml(callStatusMatch[1].trim())}</span></div>`);
	}
	if (resultStatusMatch) {
		const resultValue: any = resultStatusMatch[1].trim();
		const isFailed: any = resultValue === '失败';
		output.push(`<div class="tool-exec-field tool-exec-field-row"><span class="tool-exec-field-label">返回结果：</span><span class="tool-exec-field-value${isFailed ? ' tool-exec-value-failed' : ''}">${escapeHtml(resultValue)}</span></div>`);
	}
	if (output.length === 0) {
		return '<div class="tool-exec-body"><span class="tool-exec-empty">（无详情）</span></div>';
	}
	return `<div class="tool-exec-body">${output.join('')}</div>`;
}
