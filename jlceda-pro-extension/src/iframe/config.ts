import { OverlayScrollbars } from 'overlayscrollbars';
import { closeIFramePageById } from './modules/page';
import { readInitialPlatformId, readPlatformConfigs } from './modules/platform';
import { persistAgentSystemPrompt, readAgentSystemPrompt } from './modules/prompt';
import { applyTheme, setupThemeSync } from './modules/theme';
import { messageType, showEdaToastMessage } from './modules/utils';

(function () {
	const STORAGE_KEY: any = 'jlceda-design-copilot-ai-model-config';
	const IFRAME_ID: any = 'jlceda-design-copilot-ai-model-config';
	const PLATFORM_LIST: any = readPlatformConfigs();
	const tabRow: any = document.querySelector('.tab-row');
	const platformPanels: any = document.querySelector('.platform-panels');
	const platformConfigBlock: any = document.querySelector('.platform-config-block');
	const leftMenu: any = document.querySelector('.left-menu');
	const notes: any = document.getElementById('notes');
	const promptEditor: any = document.getElementById('promptEditor');
	const promptTextareaScroll: any = document.querySelector('.prompt-textarea-scroll');
	const promptExportBtn: any = document.getElementById('promptExportBtn');
	const promptImportBtn: any = document.getElementById('promptImportBtn');
	const promptImportInput: any = document.getElementById('promptImportInput');
	const promptSaveBtn: any = document.getElementById('promptSaveBtn');
	const promptCancelBtn: any = document.getElementById('promptCancelBtn');
	const verifyBtn: any = document.getElementById('verifyBtn');
	const saveBtn: any = document.getElementById('saveBtn');
	const closeBtn: any = document.getElementById('closeBtn');
	const contentArea: any = document.querySelector('.content-area');
	const keyInputMap: any = {};
	const modelInputMap: any = {};
	const thinkingModeSwitchMap: any = {};
	const MENU_MODEL_CONFIG: any = 'model-config';
	const MENU_PROMPT: any = 'prompt-config';
	const VERIFY_TIMEOUT_MS: any = 15000;
	const SCROLLBAR_AUTO_HIDE_DELAY: any = 1000;
	const OVERLAY_SCROLLBAR_THEME_CLASS: any = 'os-theme-jlceda';
	const THINKING_MODE_CONFIG_KEY_PREFIX: any = 'thinkingEnabled_';
	const THINKING_MODE_LEGACY_CONFIG_KEY: any = 'thinkingEnabled';
	const PROMPT_IMPORT_MAX_FILE_SIZE: any = 1024 * 1024;
	const overlayScrollbarInstanceMap: any = new WeakMap();
	let hasPassedVerification: any = false;
	let activeMenuName: any = MENU_MODEL_CONFIG;
	// 生成提示词本地备份文件名，格式：自定义提示词_YYYYMMDD_HHMMSS.txt。
	function buildPromptBackupFileName() {
		const now: any = new Date();
		const formatNumber: any = (value: any) => String(value).padStart(2, '0');
		const datePart: any = now.getFullYear() + formatNumber(now.getMonth() + 1) + formatNumber(now.getDate());
		const timePart: any = formatNumber(now.getHours()) + formatNumber(now.getMinutes()) + formatNumber(now.getSeconds());
		return `自定义提示词_${datePart}_${timePart}.txt`;
	}
	// 生成平台独立的思考模式配置键。
	function buildThinkingModeConfigKey(platformId?: any) {
		return THINKING_MODE_CONFIG_KEY_PREFIX + String(platformId || '').trim();
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
				ensureOverlayScrollbarInstance(promptTextareaScroll, {
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
	// 获取提示词滚动视口节点，优先使用 OverlayScrollbars 视口。
	function getPromptScrollViewport() {
		if (!promptTextareaScroll) {
			return null;
		}
		const overlayInstance: any = overlayScrollbarInstanceMap.get(promptTextareaScroll);
		if (overlayInstance && typeof overlayInstance.elements === 'function') {
			const overlayElements: any = overlayInstance.elements();
			if (overlayElements && overlayElements.viewport) {
				return overlayElements.viewport;
			}
		}
		return promptTextareaScroll;
	}
	// 将提示词滚动视口滚动到底部。
	function scrollPromptViewportToBottom() {
		const viewport: any = getPromptScrollViewport();
		if (!viewport) {
			return;
		}
		viewport.scrollTop = viewport.scrollHeight;
	}
	// 将提示词滚动视口滚动到顶部。
	function scrollPromptViewportToTop() {
		const viewport: any = getPromptScrollViewport();
		if (!viewport) {
			return;
		}
		viewport.scrollTop = 0;
	}
	// 输入后执行两帧贴底滚动，避免换行时出现底部差一小段的问题。
	function schedulePromptViewportStickToBottom() {
		window.requestAnimationFrame(() => {
			scrollPromptViewportToBottom();
			window.requestAnimationFrame(() => {
				scrollPromptViewportToBottom();
			});
		});
	}
	// 默认加载提示词时回到顶部，避免自动滚到底。
	function schedulePromptViewportResetToTop() {
		window.requestAnimationFrame(() => {
			scrollPromptViewportToTop();
			window.requestAnimationFrame(() => {
				scrollPromptViewportToTop();
			});
		});
	}
	// 判断提示词编辑器光标是否位于文本末尾。
	function isPromptSelectionAtEnd() {
		if (!promptEditor) {
			return false;
		}
		const selection: any = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}
		const range: any = selection.getRangeAt(0);
		if (!range || !promptEditor.contains(range.endContainer)) {
			return false;
		}
		const textBeforeCaretRange: any = range.cloneRange();
		textBeforeCaretRange.selectNodeContents(promptEditor);
		textBeforeCaretRange.setEnd(range.endContainer, range.endOffset);
		const caretOffset: any = textBeforeCaretRange.toString().length;
		const totalLength: any = String(promptEditor.textContent || '').length;
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
			panelNode.innerHTML = [
				'<div class="platform-entry">',
				'<label class="label">平台入口</label>',
				`<a class="platform-entry-link" href="${platformItem.entryUrl}" target="_blank" rel="noopener noreferrer">${platformItem.entryUrl}</a>`,
				'</div>',
				'<div class="field">',
				'<label class="label">密钥（Key）</label>',
				`<input id="${platformItem.keyField}" class="input" type="text" placeholder="请输入 API Key" />`,
				'</div>',
				'<div class="field model-thinking-row">',
				'<div class="model-field-half">',
				'<label class="label">模型（Model）</label>',
				`<input id="${platformItem.modelField}" class="input model-input-half" type="text" placeholder="请输入 Model" />`,
				'</div>',
				'<div class="thinking-switch-field">',
				'<span class="label thinking-switch-label">思考模式</span>',
				'<div class="thinking-switch-row">',
				`<label class="thinking-switch" for="thinking-mode-switch-${platformItem.id}">`,
				`<input id="thinking-mode-switch-${platformItem.id}" class="thinking-switch-input" type="checkbox" />`,
				'<span class="thinking-switch-control" aria-hidden="true"><span class="thinking-switch-thumb"></span></span>',
				'<span class="thinking-switch-state-text" aria-hidden="true"></span>',
				'</label>',
				'<span class="thinking-switch-tip" aria-hidden="true">非思考模型请勿打开此开关</span>',
				'</div>',
				'</div>',
				'</div>',
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
			thinkingModeSwitchMap[platformItem.id] = document.getElementById(`thinking-mode-switch-${platformItem.id}`);
		}
	}
	// 按平台读取思考模式开关状态。
	function readThinkingModeEnabledByPlatform(platformId?: any) {
		const switchInput: any = thinkingModeSwitchMap[String(platformId || '').trim()];
		if (!switchInput) {
			return true;
		}
		return Boolean(switchInput.checked);
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
	// 规范化提示词文本，统一换行格式。
	function normalizePromptText(value?: any) {
		return String(value || '').replace(/\r\n/g, '\n');
	}
	// 读取提示词编辑器纯文本内容。
	function readPromptEditorText() {
		if (!promptEditor) {
			return '';
		}
		return normalizePromptText(promptEditor.textContent || '');
	}
	// 写入提示词编辑器纯文本内容。
	function writePromptEditorText(value?: any) {
		if (!promptEditor) {
			return;
		}
		promptEditor.textContent = normalizePromptText(value);
	}
	// 加载本地提示词到输入框。
	function loadPromptToForm() {
		if (!promptEditor) {
			return;
		}
		const promptResult: any = readAgentSystemPrompt();
		writePromptEditorText(promptResult.customPrompt);
		refreshConfigOverlayScrollbars();
		schedulePromptViewportResetToTop();
	}
	// 保存提示词输入框内容到本地。
	function savePrompt() {
		if (!promptEditor) {
			return;
		}
		const promptValue: any = readPromptEditorText();
		const saved: any = persistAgentSystemPrompt(promptValue);
		if (saved) {
			showEdaToastMessage(window, '自定义提示词修改成功。', messageType.info);
			return;
		}
		showEdaToastMessage(window, '自定义提示词修改失败。', messageType.error);
	}
	// 将提示词文本导出到本地文件，便于手动备份。
	function exportPromptToLocalFile() {
		if (!promptEditor || !document.body) {
			showEdaToastMessage(window, '保存失败：提示词编辑器未就绪。', messageType.error);
			return;
		}
		try {
			const promptValue: any = readPromptEditorText();
			const fileBlob: any = new Blob([promptValue], {
				type: 'text/plain;charset=utf-8',
			});
			const objectUrl: any = URL.createObjectURL(fileBlob);
			const linkNode: any = document.createElement('a');
			linkNode.href = objectUrl;
			linkNode.download = buildPromptBackupFileName();
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
	// 读取本地文件文本内容，导入到提示词编辑器。
	function readPromptTextFromFile(fileNode?: any) {
		return new Promise((resolve?: any, reject?: any) => {
			if (!fileNode) {
				reject(new Error('未选择文件。'));
				return;
			}
			const reader: any = new FileReader();
			reader.onload = () => {
				resolve(normalizePromptText(reader.result || ''));
			};
			reader.onerror = () => {
				reject(new Error('读取本地文件失败。'));
			};
			reader.readAsText(fileNode, 'utf-8');
		});
	}
	// 从本地选择文件并写入提示词编辑器，导入后由用户点击“修改”进行持久化。
	async function importPromptFromLocalFile(fileInputNode?: any) {
		if (!promptEditor || !fileInputNode || !fileInputNode.files || fileInputNode.files.length === 0) {
			return;
		}
		const fileNode: any = fileInputNode.files[0];
		if (Number(fileNode.size || 0) > PROMPT_IMPORT_MAX_FILE_SIZE) {
			showEdaToastMessage(window, '导入失败：文件过大，请控制在 1MB 内。', messageType.error);
			fileInputNode.value = '';
			return;
		}
		try {
			const importedText: any = await readPromptTextFromFile(fileNode);
			writePromptEditorText(importedText);
			refreshConfigOverlayScrollbars();
			schedulePromptViewportResetToTop();
			showEdaToastMessage(window, '本地提示词已载入，请点击“修改”保存。', messageType.info);
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
		if (targetMenuName === MENU_PROMPT) {
			loadPromptToForm();
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
			payload[platformItem.endpointField] = String(platformItem.endpoint || '').trim();
			payload[buildThinkingModeConfigKey(platformItem.id)] = readThinkingModeEnabledByPlatform(platformItem.id) ? '1' : '0';
		}
		return payload;
	}
	// 规范化历史配置。
	function normalizeConfig(saved?: any) {
		if (!saved || typeof saved !== 'object') {
			return null;
		}
		const normalized: any = {};
		const legacyThinkingValue: any = String(saved[THINKING_MODE_LEGACY_CONFIG_KEY] || '').trim() === '0' ? '0' : '1';
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const thinkingModeConfigKey: any = buildThinkingModeConfigKey(platformItem.id);
			const hasOwnThinkingMode: any = Object.prototype.hasOwnProperty.call(saved, thinkingModeConfigKey);
			const thinkingRawValue: any = hasOwnThinkingMode
				? saved[thinkingModeConfigKey]
				: legacyThinkingValue;
			normalized[platformItem.keyField] = String(saved[platformItem.keyField] || '').trim();
			normalized[platformItem.modelField] = String(saved[platformItem.modelField] || platformItem.model || '').trim();
			normalized[platformItem.endpointField] = String(platformItem.endpoint || '').trim();
			normalized[thinkingModeConfigKey] = String(thinkingRawValue || '').trim() === '0' ? '0' : '1';
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
				const switchInput: any = thinkingModeSwitchMap[platformItem.id];
				if (switchInput) {
					switchInput.checked = true;
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
			const switchInput: any = thinkingModeSwitchMap[platformItem.id];
			if (switchInput) {
				const thinkingModeConfigKey: any = buildThinkingModeConfigKey(platformItem.id);
				switchInput.checked = String(normalized[thinkingModeConfigKey] || '1').trim() !== '0';
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
		const isResponsesEndpoint: any = endpoint.endsWith('/responses');
		const requestBody: any = isResponsesEndpoint
			? {
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
				}
			: {
					model: modelName,
					messages: [
						{ role: 'user', content: 'ping' },
					],
					max_tokens: 8,
					temperature: 0,
				};
		let response: any = null;
		try {
			response = await fetchWithTimeout(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
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
			targets.push({
				label: platformItem.label,
				apiKey,
				endpoint: platformItem.endpoint,
				model: modelName,
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
		if (promptSaveBtn) {
			promptSaveBtn.addEventListener('click', () => {
				savePrompt();
			});
		}
		if (promptExportBtn) {
			promptExportBtn.addEventListener('click', () => {
				exportPromptToLocalFile();
			});
		}
		if (promptImportBtn && promptImportInput) {
			promptImportBtn.addEventListener('click', () => {
				promptImportInput.click();
			});
			promptImportInput.addEventListener('change', () => {
				importPromptFromLocalFile(promptImportInput);
			});
		}
		if (promptEditor) {
			promptEditor.addEventListener('input', (event?: any) => {
				const inputTypeText: any = event && event.inputType ? String(event.inputType) : '';
				const isLineBreakInput: any = inputTypeText === 'insertParagraph' || inputTypeText === 'insertLineBreak';
				const shouldStickToBottom: any = isLineBreakInput || isPromptSelectionAtEnd();
				refreshConfigOverlayScrollbars();
				if (shouldStickToBottom) {
					schedulePromptViewportStickToBottom();
				}
			});
		}
		for (let index: any = 0; index < PLATFORM_LIST.length; index += 1) {
			const platformItem: any = PLATFORM_LIST[index];
			const switchInput: any = thinkingModeSwitchMap[platformItem.id];
			if (!switchInput) {
				continue;
			}
			switchInput.addEventListener('change', () => {
				hasPassedVerification = false;
			});
		}
		if (promptCancelBtn) {
			promptCancelBtn.addEventListener('click', () => {
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
		}
	}
	if (PLATFORM_LIST.length === 0) {
		setNotes('配置错误：未检测到任何平台配置，请检查平台配置 JSON 文件。', 'error');
		verifyBtn.disabled = true;
		saveBtn.disabled = true;
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
})();
