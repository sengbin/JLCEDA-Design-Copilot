import { OverlayScrollbars } from 'overlayscrollbars';
import { persistAgentSystemInstructions, readAgentSystemInstructions } from './llm/agent/instructions';
import { closeIFramePageById } from './page/render';
import { applyTheme, setupThemeSync } from './page/theme';
import { readInitialPlatformId, readPlatformConfigs } from './platform/platform';
import { hidePageLoadingMask, messageType, showEdaToastMessage } from './utils';

(function () {
	const STORAGE_KEY: any = 'jlceda-design-copilot-ai-model-config';
	const IFRAME_ID: any = 'jlceda-design-copilot-ai-model-config';
	const PLATFORM_LIST: any = readPlatformConfigs();
	const tabRow: any = document.querySelector('.tab-row');
	const platformPanels: any = document.querySelector('.platform-panels');
	const platformConfigBlock: any = document.querySelector('.platform-config-block');
	const leftMenu: any = document.querySelector('.left-menu');
	const notes: any = document.getElementById('notes');
	const instructionsEditor: any = document.getElementById('instructionsEditor');
	const instructionsTextareaScroll: any = document.querySelector('.instructions-textarea-scroll');
	const instructionsExportBtn: any = document.getElementById('instructionsExportBtn');
	const instructionsImportBtn: any = document.getElementById('instructionsImportBtn');
	const instructionsImportInput: any = document.getElementById('instructionsImportInput');
	const instructionsSaveBtn: any = document.getElementById('instructionsSaveBtn');
	const instructionsCancelBtn: any = document.getElementById('instructionsCancelBtn');
	const verifyBtn: any = document.getElementById('verifyBtn');
	const saveBtn: any = document.getElementById('saveBtn');
	const closeBtn: any = document.getElementById('closeBtn');
	const contentArea: any = document.querySelector('.content-area');
	const keyInputMap: any = {};
	const modelInputMap: any = {};
	const endpointInputMap: any = {};
	const MENU_MODEL_CONFIG: any = 'model-config';
	const MENU_INSTRUCTIONS: any = 'instructions-config';
	const VERIFY_TIMEOUT_MS: any = 15000;
	const SCROLLBAR_AUTO_HIDE_DELAY: any = 1000;
	const OVERLAY_SCROLLBAR_THEME_CLASS: any = 'os-theme-jlceda';
	const INSTRUCTIONS_IMPORT_MAX_FILE_SIZE: any = 1024 * 1024;
	const overlayScrollbarInstanceMap: any = new WeakMap();
	let hasPassedVerification: any = false;
	let activeMenuName: any = MENU_MODEL_CONFIG;
	// 生成指令本地备份文件名，格式：自定义指令_YYYYMMDD_HHMMSS.txt。
	function buildInstructionsBackupFileName() {
		const now: any = new Date();
		const formatNumber: any = (value: any) => String(value).padStart(2, '0');
		const datePart: any = now.getFullYear() + formatNumber(now.getMonth() + 1) + formatNumber(now.getDate());
		const timePart: any = formatNumber(now.getHours()) + formatNumber(now.getMinutes()) + formatNumber(now.getSeconds());
		return `自定义指令_${datePart}_${timePart}.txt`;
	}
	// 规范化滚动条自动隐藏模式。
	function normalizeScrollbarAutoHideMode(value?: any) {
		const modeText: any = String(value || '').trim();
		if (modeText === 'never' || modeText === 'leave' || modeText === 'scroll' || modeText === 'move') {
			return modeText;
		}
		return 'leave';
	}
	// 确保目标节点只创建一个 OverlayScrollbars 实例。
	function ensureOverlayScrollbarInstance(scrollHostElement?: any, options?: any) {
		if (!scrollHostElement || !(scrollHostElement instanceof HTMLElement)) {
			return null;
		}
		const existedInstance: any = overlayScrollbarInstanceMap.get(scrollHostElement);
		if (existedInstance) {
			return existedInstance;
		}
		const allowHorizontalScroll: any = Boolean(options && options.allowHorizontalScroll);
		const autoHideMode: any = normalizeScrollbarAutoHideMode(options && options.autoHideMode);
		const nextInstance: any = OverlayScrollbars(scrollHostElement, {
			overflow: {
				x: allowHorizontalScroll ? 'scroll' : 'hidden',
				y: 'scroll',
			},
			scrollbars: {
				theme: OVERLAY_SCROLLBAR_THEME_CLASS,
				autoHide: autoHideMode,
				autoHideDelay: SCROLLBAR_AUTO_HIDE_DELAY,
				clickScroll: true,
			},
		});
		overlayScrollbarInstanceMap.set(scrollHostElement, nextInstance);
		return nextInstance;
	}
	// 刷新配置页滚动条实例，确保切换面板后滚动轨道尺寸正确。
	function refreshConfigOverlayScrollbars() {
		window.requestAnimationFrame(() => {
			const overlayInstances: any = [
				ensureOverlayScrollbarInstance(contentArea, {
					allowHorizontalScroll: false,
					autoHideMode: 'leave',
				}),
				ensureOverlayScrollbarInstance(platformPanels, {
					allowHorizontalScroll: false,
					autoHideMode: 'leave',
				}),
				ensureOverlayScrollbarInstance(instructionsTextareaScroll, {
					allowHorizontalScroll: false,
					autoHideMode: 'move',
				}),
			];
			for (let index: any = 0; index < overlayInstances.length; index += 1) {
				const overlayInstance: any = overlayInstances[index];
				if (!overlayInstance || typeof overlayInstance.update !== 'function') {
					continue;
				}
				overlayInstance.update(true);
			}
		});
	}
	// 获取指令滚动视口节点，优先使用 OverlayScrollbars 视口。
	function getInstructionsScrollViewport() {
		if (!instructionsTextareaScroll) {
			return null;
		}
		const overlayInstance: any = overlayScrollbarInstanceMap.get(instructionsTextareaScroll);
		if (overlayInstance && typeof overlayInstance.elements === 'function') {
			const overlayElements: any = overlayInstance.elements();
			if (overlayElements && overlayElements.viewport) {
				return overlayElements.viewport;
			}
		}
		return instructionsTextareaScroll;
	}
	// 将指令滚动视口滚动到底部。
	function scrollInstructionsViewportToBottom() {
		const viewport: any = getInstructionsScrollViewport();
		if (!viewport) {
			return;
		}
		viewport.scrollTop = viewport.scrollHeight;
	}
	// 将指令滚动视口滚动到顶部。
	function scrollInstructionsViewportToTop() {
		const viewport: any = getInstructionsScrollViewport();
		if (!viewport) {
			return;
		}
		viewport.scrollTop = 0;
	}
	// 输入后执行两帧贴底滚动，避免换行时出现底部差一小段的问题。
	function scheduleInstructionsViewportStickToBottom() {
		window.requestAnimationFrame(() => {
			scrollInstructionsViewportToBottom();
			window.requestAnimationFrame(() => {
				scrollInstructionsViewportToBottom();
			});
		});
	}
	// 默认加载指令时回到顶部，避免自动滚到底。
	function scheduleInstructionsViewportResetToTop() {
		window.requestAnimationFrame(() => {
			scrollInstructionsViewportToTop();
			window.requestAnimationFrame(() => {
				scrollInstructionsViewportToTop();
			});
		});
	}
	// 判断指令编辑器光标是否位于文本末尾。
	function isInstructionsSelectionAtEnd() {
		if (!instructionsEditor) {
			return false;
		}
		const selection: any = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}
		const range: any = selection.getRangeAt(0);
		if (!range || !instructionsEditor.contains(range.endContainer)) {
			return false;
		}
		const textBeforeCaretRange: any = range.cloneRange();
		textBeforeCaretRange.selectNodeContents(instructionsEditor);
		textBeforeCaretRange.setEnd(range.endContainer, range.endOffset);
		const caretOffset: any = textBeforeCaretRange.toString().length;
		const totalLength: any = String(instructionsEditor.textContent || '').length;
		return caretOffset >= totalLength;
	}
	// 渲染平台页签与表单区域。
	function renderPlatformUi() {
		if (!tabRow || !platformPanels) {
			throw new Error('配置页容器缺失，无法渲染平台配置区域。');
		}
		tabRow.innerHTML = '';
		platformPanels.innerHTML = '';
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const tabButton: any = document.createElement('button');
			tabButton.className = index === 0 ? 'tab-button is-active' : 'tab-button';
			tabButton.type = 'button';
			tabButton.setAttribute('data-platform', platformItem.id);
			tabButton.setAttribute('role', 'tab');
			tabButton.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
			tabButton.textContent = platformItem.label;
			tabRow.appendChild(tabButton);
			const panelNode: any = document.createElement('div');
			panelNode.className = 'platform-panel';
			panelNode.setAttribute('data-platform', platformItem.id);
			panelNode.hidden = index !== 0;
			const topSectionHtml: any = platformItem.isCustomEndpoint
				? [
						'<div class="field">',
						'<label class="label">终结点（Endpoint）</label>',
						`<input id="${platformItem.endpointField}" class="input" type="text" placeholder="https://api.example.com/v1/chat/completions" />`,
						'</div>',
					].join('')
				: [
						'<div class="platform-entry">',
						'<label class="label">平台入口</label>',
						`<a class="platform-entry-link" href="${platformItem.entryUrl}" target="_blank" rel="noopener noreferrer">${platformItem.entryUrl}</a>`,
						'</div>',
					].join('');
			const modelHintHtml: any = platformItem.modelHint
				? `<div class="model-hint" role="note">${platformItem.modelHint}</div>`
				: '';
			panelNode.innerHTML = [
				topSectionHtml,
				'<div class="field">',
				'<label class="label">密钥（Key）</label>',
				`<input id="${platformItem.keyField}" class="input" type="text" placeholder="请输入 API Key" />`,
				'</div>',
				'<div class="field">',
				'<label class="label">模型（Model）</label>',
				`<input id="${platformItem.modelField}" class="input" type="text" placeholder="请输入 Model" />`,
				'</div>',
				modelHintHtml,
			].join('');
			platformPanels.appendChild(panelNode);
		}
	}
	// 采集表单输入框引用。
	function collectFormInputRefs() {
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			keyInputMap[platformItem.id] = document.getElementById(platformItem.keyField);
			modelInputMap[platformItem.id] = document.getElementById(platformItem.modelField);
			if (platformItem.isCustomEndpoint) {
				endpointInputMap[platformItem.id] = document.getElementById(platformItem.endpointField);
			}
		}
	}
	// 根据当前激活标签更新平台面板左上角圆角状态。
	function updatePlatformPanelCornerState() {
		if (!platformConfigBlock || !tabRow) {
			return;
		}
		const firstTabButton: any = tabRow.querySelector('.tab-button');
		const firstTabActive: any = Boolean(firstTabButton && firstTabButton.classList && firstTabButton.classList.contains('is-active'));
		platformConfigBlock.classList.toggle('is-first-tab-active', firstTabActive);
	}
	// 切换模型配置页平台标签。
	function switchPlatformTabUi(platformName?: any) {
		if (!tabRow || !platformPanels) {
			return;
		}
		const currentPlatform: any = String(platformName || '');
		const tabs: any = Array.prototype.slice.call(tabRow.querySelectorAll('.tab-button'));
		const panels: any = Array.prototype.slice.call(platformPanels.querySelectorAll('.platform-panel'));
		for (let index: any = 0; index < tabs.length; index += 1) {
			const tabButton: any = tabs[index];
			if (!tabButton || typeof tabButton.getAttribute !== 'function') {
				continue;
			}
			const isActive: any = String(tabButton.getAttribute('data-platform') || '') === currentPlatform;
			tabButton.classList.toggle('is-active', isActive);
			tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
		}
		for (let index: any = 0; index < panels.length; index += 1) {
			const panel: any = panels[index];
			if (!panel || typeof panel.getAttribute !== 'function') {
				continue;
			}
			const isActive: any = String(panel.getAttribute('data-platform') || '') === currentPlatform;
			panel.hidden = !isActive;
		}
		updatePlatformPanelCornerState();
		refreshConfigOverlayScrollbars();
	}
	// 设置模型配置页提示文本。
	function setNotesUi(notesElement?: any, message?: any, type?: any, options?: any) {
		if (!notesElement || typeof notesElement.classList === 'undefined') {
			return;
		}
		const content: any = String(message || '');
		notesElement.classList.remove('success', 'error', 'loading');
		if (options && options.isLoading) {
			notesElement.innerHTML = '';
			const fragment: any = document.createDocumentFragment();
			for (let index: any = 0; index < content.length; index += 1) {
				const textChar: any = content.charAt(index);
				const span: any = document.createElement('span');
				span.className = 'notes-char';
				span.style.animationDelay = `${index * 0.05}s`;
				if (textChar === ' ') {
					span.className += ' space';
					span.textContent = ' ';
				}
				else {
					span.textContent = textChar;
				}
				fragment.appendChild(span);
			}
			notesElement.appendChild(fragment);
			notesElement.classList.add('loading');
			return;
		}
		notesElement.textContent = content;
		if (type === 'success' || type === 'error') {
			notesElement.classList.add(type);
		}
	}
	// 设置页面提示文本。
	function setNotes(message?: any, type?: any, options?: any) {
		setNotesUi(notes, message, type, options);
	}
	// 规范化指令文本，统一换行格式。
	function normalizeInstructionsText(value?: any) {
		return String(value || '').replace(/\r\n/g, '\n');
	}
	// 读取指令编辑器纯文本内容。
	function readInstructionsEditorText() {
		if (!instructionsEditor) {
			return '';
		}
		return normalizeInstructionsText(instructionsEditor.textContent || '');
	}
	// 写入指令编辑器纯文本内容。
	function writeInstructionsEditorText(value?: any) {
		if (!instructionsEditor) {
			return;
		}
		instructionsEditor.textContent = normalizeInstructionsText(value);
	}
	// 加载本地指令到输入框。
	function loadInstructionsToForm() {
		if (!instructionsEditor) {
			return;
		}
		const instructionsResult: any = readAgentSystemInstructions();
		writeInstructionsEditorText(instructionsResult.customInstructions);
		refreshConfigOverlayScrollbars();
		scheduleInstructionsViewportResetToTop();
	}
	// 保存指令输入框内容到本地。
	function saveInstructions() {
		if (!instructionsEditor) {
			return;
		}
		const instructionsValue: any = readInstructionsEditorText();
		const saved: any = persistAgentSystemInstructions(instructionsValue);
		if (saved) {
			showEdaToastMessage(window, '自定义指令修改成功。', messageType.info);
			return;
		}
		showEdaToastMessage(window, '自定义指令修改失败。', messageType.error);
	}
	// 将指令文本导出到本地文件，便于手动备份。
	function exportInstructionsToLocalFile() {
		if (!instructionsEditor || !document.body) {
			showEdaToastMessage(window, '保存失败：指令编辑器未就绪。', messageType.error);
			return;
		}
		try {
			const instructionsValue: any = readInstructionsEditorText();
			const fileBlob: any = new Blob([instructionsValue], {
				type: 'text/plain;charset=utf-8',
			});
			const objectUrl: any = URL.createObjectURL(fileBlob);
			const linkNode: any = document.createElement('a');
			linkNode.href = objectUrl;
			linkNode.download = buildInstructionsBackupFileName();
			linkNode.style.display = 'none';
			document.body.appendChild(linkNode);
			linkNode.click();
			window.setTimeout(() => {
				URL.revokeObjectURL(objectUrl);
				if (linkNode.parentNode) {
					linkNode.parentNode.removeChild(linkNode);
				}
			}, 0);
		}
		catch {
			showEdaToastMessage(window, '保存失败：无法写入本地文件。', messageType.error);
		}
	}
	// 读取本地文件文本内容，导入到指令编辑器。
	function readInstructionsTextFromFile(fileNode?: any) {
		return new Promise((resolve?: any, reject?: any) => {
			if (!fileNode) {
				reject(new Error('未选择文件。'));
				return;
			}
			const reader: any = new FileReader();
			reader.onload = () => {
				resolve(normalizeInstructionsText(reader.result || ''));
			};
			reader.onerror = () => {
				reject(new Error('读取本地文件失败。'));
			};
			reader.readAsText(fileNode, 'utf-8');
		});
	}
	// 从本地选择文件并写入指令编辑器，导入后由用户点击“修改”进行持久化。
	async function importInstructionsFromLocalFile(fileInputNode?: any) {
		if (!instructionsEditor || !fileInputNode || !fileInputNode.files || fileInputNode.files.length === 0) {
			return;
		}
		const fileNode: any = fileInputNode.files[0];
		if (Number(fileNode.size || 0) > INSTRUCTIONS_IMPORT_MAX_FILE_SIZE) {
			showEdaToastMessage(window, '导入失败：文件过大，请控制在 1MB 内。', messageType.error);
			fileInputNode.value = '';
			return;
		}
		try {
			const importedText: any = await readInstructionsTextFromFile(fileNode);
			writeInstructionsEditorText(importedText);
			refreshConfigOverlayScrollbars();
			scheduleInstructionsViewportResetToTop();
			showEdaToastMessage(window, '本地指令已载入，请点击“修改”保存。', messageType.info);
		}
		catch {
			showEdaToastMessage(window, '导入失败：读取本地文件失败。', messageType.error);
		}
		finally {
			fileInputNode.value = '';
		}
	}
	// 切换左侧菜单对应内容区。
	function switchMainMenu(menuName?: any) {
		const targetMenuName: any = String(menuName || '').trim() || MENU_MODEL_CONFIG;
		activeMenuName = targetMenuName;
		const menuButtons: any = leftMenu ? Array.prototype.slice.call(leftMenu.querySelectorAll('.left-menu-item')) : [];
		const contentPanels: any = Array.prototype.slice.call(document.querySelectorAll('.content-panel'));
		for (let index: any = 0; index < menuButtons.length; index += 1) {
			const menuButton: any = menuButtons[index];
			if (!menuButton || typeof menuButton.getAttribute !== 'function') {
				continue;
			}
			const isActive: any = String(menuButton.getAttribute('data-menu') || '') === targetMenuName;
			menuButton.classList.toggle('is-active', isActive);
		}
		for (let index: any = 0; index < contentPanels.length; index += 1) {
			const panelNode: any = contentPanels[index];
			if (!panelNode || typeof panelNode.getAttribute !== 'function') {
				continue;
			}
			const isActive: any = String(panelNode.getAttribute('data-menu-panel') || '') === targetMenuName;
			panelNode.hidden = !isActive;
			panelNode.classList.toggle('is-active', isActive);
		}
		if (targetMenuName === MENU_INSTRUCTIONS) {
			loadInstructionsToForm();
		}
		refreshConfigOverlayScrollbars();
	}
	// 读取本地保存配置。
	function readConfig() {
		try {
			const raw: any = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return null;
			}
			const parsed: any = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') {
				return null;
			}
			return parsed;
		}
		catch {
			return null;
		}
	}
	// 从表单读取配置负载。
	function getPayload() {
		const payload: any = {
			updatedAt: new Date().toISOString(),
		};
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const keyInput: any = keyInputMap[platformItem.id];
			const modelInput: any = modelInputMap[platformItem.id];
			payload[platformItem.keyField] = String((keyInput && keyInput.value) || '').trim();
			payload[platformItem.modelField] = String((modelInput && modelInput.value) || '').trim();
			if (platformItem.isCustomEndpoint) {
				const endpointInput: any = endpointInputMap[platformItem.id];
				payload[platformItem.endpointField] = String((endpointInput && endpointInput.value) || '').trim();
			}
			else {
				payload[platformItem.endpointField] = String(platformItem.endpoint || '').trim();
			}
		}
		return payload;
	}
	// 规范化历史配置。
	function normalizeConfig(saved?: any) {
		if (!saved || typeof saved !== 'object') {
			return null;
		}
		const normalized: any = {};
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			normalized[platformItem.keyField] = String(saved[platformItem.keyField] || '').trim();
			normalized[platformItem.modelField] = String(saved[platformItem.modelField] || platformItem.model || '').trim();
			normalized[platformItem.endpointField] = platformItem.isCustomEndpoint
				? String(saved[platformItem.endpointField] || '').trim()
				: String(platformItem.endpoint || '').trim();
		}
		return normalized;
	}
	// 将本地配置加载到表单。
	function loadConfigToForm() {
		const normalized: any = normalizeConfig(readConfig());
		if (!normalized) {
			setNotes('注意事项：请填写各平台 API Key 与模型名称，终结点为固定值，验证通过后点击“保存”。');
			for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
				const platformItem: any = PLATFORM_LIST[index];
				const keyInput: any = keyInputMap[platformItem.id];
				const modelInput: any = modelInputMap[platformItem.id];
				if (keyInput) {
					keyInput.value = '';
				}
				if (modelInput) {
					modelInput.value = String(platformItem.model || '').trim();
				}
				if (platformItem.isCustomEndpoint) {
					const endpointInput: any = endpointInputMap[platformItem.id];
					if (endpointInput) {
						endpointInput.value = '';
					}
				}
			}
			hasPassedVerification = false;
			return;
		}
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const keyInput: any = keyInputMap[platformItem.id];
			const modelInput: any = modelInputMap[platformItem.id];
			if (keyInput) {
				keyInput.value = String(normalized[platformItem.keyField] || '').trim();
			}
			if (modelInput) {
				modelInput.value = String(normalized[platformItem.modelField] || '').trim();
			}
			if (platformItem.isCustomEndpoint) {
				const endpointInput: any = endpointInputMap[platformItem.id];
				if (endpointInput) {
					endpointInput.value = String(normalized[platformItem.endpointField] || '').trim();
				}
			}
		}
		hasPassedVerification = false;
		setNotes('已加载本地配置，可直接修改并点击“保存”更新。', 'success');
	}
	// 保存或更新配置。
	function saveOrUpdateConfig() {
		const payload: any = getPayload();
		let hasAnyApiKey: any = false;
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			if (String(payload[platformItem.keyField] || '').trim()) {
				hasAnyApiKey = true;
				break;
			}
		}
		if (!hasAnyApiKey) {
			setNotes('保存失败：至少填写一个平台的 API Key。', 'error');
			return false;
		}
		// 验证自定义平台：填写了 Key 就必须填写终结点。
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			if (!platformItem.isCustomEndpoint) {
				continue;
			}
			const customKey: any = String(payload[platformItem.keyField] || '').trim();
			const customEndpoint: any = String(payload[platformItem.endpointField] || '').trim();
			if (customKey && !customEndpoint) {
				setNotes('保存失败：使用自定义模型时必须填写终结点。', 'error');
				return false;
			}
		}
		const existed: any = !!readConfig();
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		setNotes(existed ? '配置已更新。' : '配置已保存。', 'success');
		return true;
	}
	// 使用超时控制发起验证请求，避免网络异常导致长时间无响应。
	async function fetchWithTimeout(url?: any, options?: any, timeoutMs?: any) {
		const safeTimeout: any = Math.max(1000, Number(timeoutMs) || 0);
		let isTimeoutTriggered: any = false;
		const abortController: any = new AbortController();
		const timerId: any = window.setTimeout(() => {
			isTimeoutTriggered = true;
			abortController.abort();
		}, safeTimeout);
		try {
			const requestOptions: any = { ...options || {} };
			requestOptions.signal = abortController.signal;
			return await fetch(url, requestOptions);
		}
		catch (error: any) {
			if (isTimeoutTriggered && error && error.name === 'AbortError') {
				const timeoutError: any = new Error('网络请求超时，请检查网络后重新验证。');
				timeoutError.name = 'VerifyTimeoutError';
				throw timeoutError;
			}
			throw error;
		}
		finally {
			window.clearTimeout(timerId);
		}
	}
	// 统一格式化验证请求失败提示。
	function resolveVerifyRequestErrorMessage(error?: any) {
		if (error && String(error.name || '').trim() === 'VerifyTimeoutError') {
			return '网络请求超时，请检查网络后重新验证。';
		}
		const rawMessage: any = String(error && error.message ? error.message : '').trim();
		if (!rawMessage) {
			return '网络请求失败，请检查网络后重新验证。';
		}
		if (/failed to fetch|networkerror/iu.test(rawMessage)) {
			return '网络请求失败，请检查网络后重新验证。';
		}
		return rawMessage;
	}
	// 验证单个平台配置可用性。
	async function verifySinglePlatform(target?: any) {
		const apiKey: any = String((target && target.apiKey) || '').trim();
		if (!target || !apiKey) {
			return { ok: false, message: '配置无效' };
		}
		const endpoint: any = String(target.endpoint || '').trim();
		const modelName: any = String(target.model || '').trim();
		if (!endpoint || !modelName) {
			return { ok: false, message: '请求 URL 或模型名称未填写' };
		}
		const isAnthropicFormat: any = String(target.apiFormat || '').trim() === 'anthropic';
		const isResponsesEndpoint: any = !isAnthropicFormat && endpoint.endsWith('/responses');
		let requestBody: any;
		let requestHeaders: any;
		if (isAnthropicFormat) {
			requestBody = {
				model: modelName,
				max_tokens: 8,
				messages: [{ role: 'user', content: 'ping' }],
			};
			requestHeaders = {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			};
		}
		else if (isResponsesEndpoint) {
			requestBody = {
				model: modelName,
				input: [
					{
						role: 'user',
						content: [
							{
								type: 'input_text',
								text: 'ping',
							},
						],
					},
				],
			};
			requestHeaders = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			};
		}
		else {
			requestBody = {
				model: modelName,
				messages: [
					{ role: 'user', content: 'ping' },
				],
				max_tokens: 8,
				temperature: 0,
			};
			requestHeaders = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			};
		}
		let response: any = null;
		try {
			response = await fetchWithTimeout(endpoint, {
				method: 'POST',
				headers: requestHeaders,
				body: JSON.stringify(requestBody),
			}, VERIFY_TIMEOUT_MS);
		}
		catch (error: any) {
			return {
				ok: false,
				message: resolveVerifyRequestErrorMessage(error),
			};
		}
		const text: any = await response.text();
		let result: any;
		try {
			result = JSON.parse(text);
		}
		catch {
			result = null;
		}
		if (!response.ok) {
			const errorMessage: any = result && result.error && result.error.message
				? String(result.error.message)
				: (`HTTP ${response.status}`);
			return { ok: false, message: errorMessage };
		}
		// HTTP 200 时校验响应体是否包含合法 API 响应字段，防止终结点填写为 base URL 时误判通过。
		if (isAnthropicFormat) {
			if (!result || !Array.isArray(result.content)) {
				return { ok: false, message: '响应格式异常，请确认终结点是否为完整的 Anthropic API 路径（如 https://api.anthropic.com/v1/messages）' };
			}
		}
		else if (isResponsesEndpoint) {
			if (!result || !Array.isArray(result.output)) {
				return { ok: false, message: '响应格式异常，请确认终结点是否为完整的 Responses API 路径（如 .../v1/responses）' };
			}
		}
		else {
			if (!result || !Array.isArray(result.choices)) {
				return { ok: false, message: '响应格式异常，请确认终结点是否为完整的 API 路径（如 https://api.example.com/v1/chat/completions）' };
			}
		}
		return { ok: true, message: '验证成功' };
	}
	// 验证当前表单内全部已填写平台。
	async function verifyApiKey() {
		hasPassedVerification = false;
		const payload: any = getPayload();
		const targets: any = [];
		const failMessages: any = [];
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const apiKey: any = String(payload[platformItem.keyField] || '').trim();
			const modelName: any = String(payload[platformItem.modelField] || '').trim();
			if (!apiKey) {
				continue;
			}
			if (!modelName) {
				failMessages.push(`${platformItem.label}：模型名称未填写`);
				continue;
			}
			const targetEndpoint: any = platformItem.isCustomEndpoint
				? String((endpointInputMap[platformItem.id] && endpointInputMap[platformItem.id].value) || '').trim()
				: platformItem.endpoint;
			if (!targetEndpoint) {
				failMessages.push(`${platformItem.label}：终结点未填写`);
				continue;
			}
			targets.push({
				label: platformItem.label,
				apiKey,
				endpoint: targetEndpoint,
				model: modelName,
				apiFormat: String(platformItem.apiFormat || '').trim(),
			});
		}
		if (targets.length === 0 && failMessages.length === 0) {
			setNotes('验证失败：至少填写一个平台的 API Key。', 'error');
			return;
		}
		if (failMessages.length > 0) {
			setNotes(`验证失败：${failMessages.join('；')}`, 'error');
			return;
		}
		verifyBtn.disabled = true;
		setNotes('正在验证已填写平台的 API Key，请稍候...', '', { isLoading: true });
		try {
			const successLabels: any = [];
			for (let index: any = 0; index < targets.length; index += 1) {
				const target: any = targets[index];
				const verifyResult: any = await verifySinglePlatform(target);
				if (verifyResult.ok) {
					successLabels.push(target.label);
				}
				else {
					failMessages.push(`${target.label}：${verifyResult.message}`);
				}
			}
			if (failMessages.length > 0) {
				setNotes(`验证失败：${failMessages.join('；')}`, 'error');
				return;
			}
			hasPassedVerification = true;
			setNotes(`验证成功：${successLabels.join('、')} API Key 可用。`, 'success');
		}
		catch (error: any) {
			const message: any = error && error.message ? String(error.message) : '网络请求失败';
			setNotes(`验证失败：${message}`, 'error');
		}
		finally {
			verifyBtn.disabled = false;
		}
	}
	// 初始化页面事件。
	function bindEvents() {
		if (leftMenu) {
			leftMenu.addEventListener('click', (event?: any) => {
				const target: any = event && event.target ? event.target : null;
				const menuButton: any = target && target.closest ? target.closest('.left-menu-item') : null;
				if (!menuButton) {
					return;
				}
				const menuName: any = String(menuButton.getAttribute('data-menu') || '').trim();
				if (!menuName || menuName === activeMenuName) {
					return;
				}
				switchMainMenu(menuName);
			});
		}
		if (instructionsSaveBtn) {
			instructionsSaveBtn.addEventListener('click', () => {
				saveInstructions();
			});
		}
		if (instructionsExportBtn) {
			instructionsExportBtn.addEventListener('click', () => {
				exportInstructionsToLocalFile();
			});
		}
		if (instructionsImportBtn && instructionsImportInput) {
			instructionsImportBtn.addEventListener('click', () => {
				instructionsImportInput.click();
			});
			instructionsImportInput.addEventListener('change', () => {
				importInstructionsFromLocalFile(instructionsImportInput);
			});
		}
		if (instructionsEditor) {
			instructionsEditor.addEventListener('input', (event?: any) => {
				const inputTypeText: any = event && event.inputType ? String(event.inputType) : '';
				const isLineBreakInput: any = inputTypeText === 'insertParagraph' || inputTypeText === 'insertLineBreak';
				const shouldStickToBottom: any = isLineBreakInput || isInstructionsSelectionAtEnd();
				refreshConfigOverlayScrollbars();
				if (shouldStickToBottom) {
					scheduleInstructionsViewportStickToBottom();
				}
			});
		}
		if (instructionsCancelBtn) {
			instructionsCancelBtn.addEventListener('click', () => {
				closeIFramePageById(IFRAME_ID);
			});
		}
		verifyBtn.addEventListener('click', () => {
			verifyApiKey();
		});
		saveBtn.addEventListener('click', () => {
			if (!hasPassedVerification) {
				setNotes('必须先点击“验证配置”并验证通过。', 'error');
				return;
			}
			const saved: any = saveOrUpdateConfig();
			if (saved) {
				closeIFramePageById(IFRAME_ID);
			}
		});
		closeBtn.addEventListener('click', () => {
			closeIFramePageById(IFRAME_ID);
		});
		document.addEventListener('keydown', (event?: any) => {
			if (!event || event.key !== 'Escape') {
				return;
			}
			event.preventDefault();
			closeIFramePageById(IFRAME_ID);
		});
		if (tabRow) {
			tabRow.addEventListener('click', (event?: any) => {
				const target: any = event && event.target ? event.target : null;
				const tabButton: any = target && target.closest ? target.closest('.tab-button') : null;
				if (!tabButton) {
					return;
				}
				const platformName: any = String(tabButton.getAttribute('data-platform') || '');
				switchPlatformTabUi(platformName);
			});
		}
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const keyInput: any = keyInputMap[platformItem.id];
			const modelInput: any = modelInputMap[platformItem.id];
			if (keyInput) {
				keyInput.addEventListener('input', () => {
					hasPassedVerification = false;
				});
			}
			if (modelInput) {
				modelInput.addEventListener('input', () => {
					hasPassedVerification = false;
				});
			}
			if (platformItem.isCustomEndpoint) {
				const endpointInput: any = endpointInputMap[platformItem.id];
				if (endpointInput) {
					endpointInput.addEventListener('input', () => {
						hasPassedVerification = false;
					});
				}
			}
		}
	}
	if (PLATFORM_LIST.length === 0) {
		setNotes('配置错误：未检测到任何平台配置，请检查平台配置 JSON 文件。', 'error');
		verifyBtn.disabled = true;
		saveBtn.disabled = true;
		hidePageLoadingMask();
		return;
	}
	renderPlatformUi();
	collectFormInputRefs();
	bindEvents();
	refreshConfigOverlayScrollbars();
	setupThemeSync(applyTheme);
	switchMainMenu(MENU_MODEL_CONFIG);
	switchPlatformTabUi(readInitialPlatformId());
	loadConfigToForm();
	hidePageLoadingMask();
})();
