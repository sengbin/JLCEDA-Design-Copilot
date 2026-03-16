import { OverlayScrollbars } from 'overlayscrollbars';
import scrollIntoView from 'scroll-into-view-if-needed';
import { DEBUG_TOOL_EXEC_DETAILS_EXPANDABLE } from './debug';
import { readAgentSystemPrompt } from './llm/agent/instructions';
import { AI_AGENT_RUNTIME, getModelContextHistoryBudgetTokens, throwIfAgentAborted } from './llm/agent/runtime';
import tools from './llm/agent/tools.json';
import { buildModelRequestPayload, buildResponsesTools, pickManualExposedTools, validateModelRequestConfig } from './llm/client';
import { extractResponsesToolCallDeltas, mergeToolCallDelta, parseSseEventBlock } from './llm/stream';
import { buildThinkingModeConfigKey, CHAT_MODEL_CONFIG_CONSTANTS, getNormalizedEndpoint, isImageUploadEnabled, persistModelSelection, readConfig, readModelSelection, resolveImagePayloadMode, resolveModelConfig } from './page/model';
import { closeIFramePageById, ensureSvgIconSpriteLoaded, escapeHtml, formatToolExecRawText, renderMarkdown, renderToolExecPlainText } from './page/render';
import { applyTheme, setupThemeSync } from './page/theme';
import { buildUserMessageContentForApi, cloneImageEntries, collectClipboardImageFiles, convertImageFileToEntry, isGenericClipboardImageName, resolveImageEntryName } from './page/upload';
import { readPlatformConfigs } from './platform/platform';
import { createChatSessionManager } from './session/session';
import { generateSessionTitleByModel } from './session/title';
import { createAgentToolRuntime, executeToolWithTimeout } from './tools/executor';
import { messageType, safeJsonStringify, showEdaToastMessage } from './utils';

(function () {
	ensureSvgIconSpriteLoaded();
	const STORAGE_KEY: any = CHAT_MODEL_CONFIG_CONSTANTS.storageKey;
	const IFRAME_ID: any = 'jlceda-design-copilot-chat-tool';
	const MODEL_SELECT_PLACEHOLDER_TEXT: any = CHAT_MODEL_CONFIG_CONSTANTS.modelSelectPlaceholderText;
	const MODEL_SELECTION_KEY: any = CHAT_MODEL_CONFIG_CONSTANTS.modelSelectionKey;
	const IMAGE_ATTACHMENT_LIMIT: any = CHAT_MODEL_CONFIG_CONSTANTS.imageAttachmentLimit;
	const MODEL_CONFIG_MAP: any = CHAT_MODEL_CONFIG_CONSTANTS.modelConfigMap;
	const CHAT_SESSION_STORAGE_KEY: any = 'jlceda-design-copilot-chat-session-v2';
	const CHAT_SESSION_MAX_MESSAGES: any = 120;
	const CHAT_SESSION_DEFAULT_TITLE: any = '新对话';
	const THINKING_MODE_LEGACY_CONFIG_KEY: any = 'thinkingEnabled';
	const CHAT_EMPTY_STATE_TITLE_TEXT: any = 'AI 设计助手';
	const CHAT_EMPTY_STATE_NOTICE_TEXT: any = '我是个辅助工具，也可能会出错，请注意核对结果。';
	const CHAT_EMPTY_STATE_EXAMPLES: any = [
		'帮我检查一下这个原理图。',
		'这个电路有什么可以优化的地方吗？',
		'把当前打开的原理图的BOM给我。',
	];
	const RUNNING_INDICATOR_TEXT: any = '执行中...';
	const imageUploadButton: any = document.querySelector('.image-upload-button');
	const imageUploadInput: any = document.querySelector('.image-upload-input');
	const modelSelect: any = document.querySelector('.model-select');
	// 获取当前选中的模型值。
	function getSelectedModelValue() {
		const selectedValue: any = modelSelect ? String(modelSelect.value || '') : '';
		return selectedValue || readModelSelection(MODEL_SELECTION_KEY);
	}
	// 根据模型切换图片上传控件可用性。
	function updateImageUploadAvailability(modelValue?: any) {
		const enabled: any = isImageUploadEnabled(modelValue);
		const attachmentRow: any = imageUploadButton ? imageUploadButton.parentElement : null;
		if (attachmentRow) {
			attachmentRow.style.display = 'flex';
		}
		if (imageUploadInput) {
			imageUploadInput.disabled = !enabled;
			if (!enabled) {
				imageUploadInput.value = '';
			}
		}
		if (!enabled) {
			clearPendingImageEntries();
		}
		return enabled;
	}
	const MAX_AGENT_STEPS: any = AI_AGENT_RUNTIME.maxAgentSteps;
	const TOOL_CALL_TIMEOUT_SECONDS: any = AI_AGENT_RUNTIME.toolCallTimeoutSeconds;
	const MODEL_MAX_OUTPUT_TOKENS: any = AI_AGENT_RUNTIME.modelMaxOutputTokens;
	const toolRuntime: any = createAgentToolRuntime(window);
	const exposedTools: any = pickManualExposedTools(tools);
	const MODEL_CONTEXT_HISTORY_BUDGET_TOKENS: any = getModelContextHistoryBudgetTokens();
	const chatHistory: any = document.querySelector('.chat-history');
	const chatTextareaScroll: any = document.querySelector('.chat-textarea-scroll');
	const chatEditor: any = document.querySelector('.chat-textarea');
	const chatInputBox: any = document.querySelector('.chat-input-box');
	const sendButton: any = document.querySelector('.send-button');
	const imageAttachmentList: any = document.querySelector('.image-attachment-list');
	const modelSelectControl: any = document.querySelector('.model-select-control');
	const modelSelectTrigger: any = document.querySelector('.model-select-trigger');
	const modelSelectMenu: any = document.querySelector('.model-select-menu');
	const chatSessionDropdown: any = document.querySelector('.chat-sesson-dropdown');
	const chatSessionDropdownCurrent: any = document.querySelector('.chat-sesson-dropdown-current');
	const chatSessionDropdownMenu: any = document.querySelector('.chat-sesson-dropdown-menu');
	const chatSessionAddButton: any = document.querySelector('.chat-sesson-add-button');
	const chatSessionDeleteButton: any = document.querySelector('.chat-sesson-delete-button');
	const agentMessages: any = [];
	const chatDisplayMessages: any = [];
	const pendingImageEntries: any = [];
	let hasCompletedRound: any = false;
	let runningIndicatorNode: any = null;
	let isSending: any = false;
	let isRestoringSession: any = false;
	let activeAbortController: any = null;
	const STREAM_IDLE_STATUS_DELAY: any = 1200;
	let streamIdleTimerId: any = 0;
	let streamIdleWatchActive: any = false;
	const CHAT_INPUT_MAX_VISIBLE_LINES: any = 8;
	const SCROLL_BOTTOM_SNAP_THRESHOLD: any = 4;
	const SCROLLBAR_AUTO_HIDE_DELAY: any = 1000;
	const IMAGE_ATTACHMENT_HOVER_HIDE_DEBOUNCE_MS: any = 180;
	const OVERLAY_SCROLLBAR_THEME_CLASS: any = 'os-theme-jlceda';
	const chatHistoryMessageContainer: any = createChatHistoryMessageContainer(chatHistory);
	const chatEmptyStateNode: any = createChatEmptyStateNode(chatHistory);
	const overlayScrollControllerMap: any = new WeakMap();
	let chatHistoryScrollController: any = null;
	let chatSessionDropdownScrollController: any = null;
	let chatInputOverlayScrollbar: any = null;
	let imageAttachmentHoverPreviewLayer: any = null;
	let imageAttachmentHoverPreviewImage: any = null;
	let imageAttachmentHoverPreviewName: any = null;
	let imageAttachmentHoverHideTimerId: any = 0;
	const sessionTitleRefreshTaskMap: any = new Map();
	let sessionTitleRefreshTaskSeed: any = 0;
	const sessionManager: any = createChatSessionManager({
		storageKey: CHAT_SESSION_STORAGE_KEY,
		maxMessages: CHAT_SESSION_MAX_MESSAGES,
		defaultSessionTitle: CHAT_SESSION_DEFAULT_TITLE,
		runtimeWindow: window,
		chatHistory: chatHistoryMessageContainer,
		agentMessages,
		chatDisplayMessages,
		cloneImageEntries,
		safeJsonStringify,
		normalizeMessageContentForChat: (content, allowImagePart) => normalizeMessageContentForChat(content, allowImagePart),
		readReasoningContent: message => readReasoningContent(message),
		appendMessage: (role, text, variant) => appendMessage(role, text, variant),
		scrollChatHistoryIfAllowed: () => scrollChatHistoryIfAllowed(),
		onAfterRestore: () => {
			applyFoldStateAfterSessionRestore();
			rebuildProcessFoldGroupsAfterSessionRestore();
			clearFoldLoadingIndicators();
			isRestoringSession = false;
			syncChatEmptyStateVisibility();
			if (chatHistoryScrollController) {
				chatHistoryScrollController.setAutoFollowEnabled(true);
			}
			hasCompletedRound = chatDisplayMessages.length > 0;
			updateSendButtonState();
		},
		resolveApiMemberInAnyRoot: apiPath => toolRuntime.resolveApiMemberInAnyRoot(apiPath),
		hideRunningIndicator: () => hideRunningIndicator(),
	});
	// 规范化聊天输入文本，统一换行格式。
	function normalizeChatInputText(value?: any) {
		return String(value || '').replace(/\r\n/g, '\n');
	}
	// 读取聊天输入编辑器纯文本。
	function readChatInputText() {
		if (!chatEditor) {
			return '';
		}
		return normalizeChatInputText(chatEditor.textContent || '');
	}
	// 写入聊天输入编辑器纯文本。
	function writeChatInputText(value?: any) {
		if (!chatEditor) {
			return;
		}
		chatEditor.textContent = normalizeChatInputText(value);
	}
	// 读取配置中的思考模式开关，默认开启。
	function readThinkingModeEnabledFromConfig(configObject?: any, selectedModelValue?: any) {
		if (!configObject || typeof configObject !== 'object') {
			return true;
		}
		const modelValue: any = String(selectedModelValue || '').trim();
		const thinkingModeConfigKey: any = buildThinkingModeConfigKey(modelValue);
		const hasPlatformValue: any = Object.prototype.hasOwnProperty.call(configObject, thinkingModeConfigKey);
		const rawValue: any = hasPlatformValue
			? configObject[thinkingModeConfigKey]
			: configObject[THINKING_MODE_LEGACY_CONFIG_KEY];
		if (typeof rawValue === 'boolean') {
			return rawValue;
		}
		const normalizedText: any = String(rawValue || '').trim().toLowerCase();
		if (!normalizedText) {
			return true;
		}
		if (normalizedText === '0' || normalizedText === 'false' || normalizedText === 'off') {
			return false;
		}
		return true;
	}
	// 获取聊天输入滚动视口节点，优先使用 OverlayScrollbars 视口。
	function getChatInputViewport() {
		if (!chatTextareaScroll) {
			return null;
		}
		if (chatInputOverlayScrollbar && typeof chatInputOverlayScrollbar.elements === 'function') {
			const overlayElements: any = chatInputOverlayScrollbar.elements();
			if (overlayElements && overlayElements.viewport) {
				return overlayElements.viewport;
			}
		}
		return chatTextareaScroll;
	}
	// 刷新聊天输入框滚动条布局。
	function refreshChatInputOverlayScrollbar() {
		if (!chatInputOverlayScrollbar || typeof chatInputOverlayScrollbar.update !== 'function') {
			return;
		}
		chatInputOverlayScrollbar.update(true);
	}
	// 将聊天输入滚动视口滚动到底部。
	function scrollChatInputViewportToBottom() {
		const viewport: any = getChatInputViewport();
		if (!viewport) {
			return;
		}
		viewport.scrollTop = viewport.scrollHeight;
	}
	// 输入后执行两帧贴底滚动，避免换行时光标落到可视区域外。
	function scheduleChatInputViewportStickToBottom() {
		window.requestAnimationFrame(() => {
			scrollChatInputViewportToBottom();
			window.requestAnimationFrame(() => {
				scrollChatInputViewportToBottom();
			});
		});
	}
	// 判断聊天输入框光标是否位于文本末尾。
	function isChatSelectionAtEnd() {
		if (!chatEditor) {
			return false;
		}
		const selection: any = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}
		const range: any = selection.getRangeAt(0);
		if (!range || !chatEditor.contains(range.endContainer)) {
			return false;
		}
		const textBeforeCaretRange: any = range.cloneRange();
		textBeforeCaretRange.selectNodeContents(chatEditor);
		textBeforeCaretRange.setEnd(range.endContainer, range.endOffset);
		const caretOffset: any = textBeforeCaretRange.toString().length;
		const totalLength: any = String(chatEditor.textContent || '').length;
		return caretOffset >= totalLength;
	}
	// 判断工具执行展示文本是否为失败结果。
	function isFailedToolExecDisplayText(text?: any) {
		const sourceText: any = String(text || '').replace(/\r\n/g, '\n');
		return /(?:^|\n)\s*返回结果[：:]\s*失败(?:\s*$|\n)/u.test(sourceText);
	}
	// 生成可写入模型上下文的工具结果对象（移除本地内部修复字段）。
	function sanitizeToolResultForModel(result?: any) {
		const resultObject: any = result && typeof result === 'object' ? result : null;
		if (!resultObject) {
			return result;
		}
		const sanitizedResult: any = { ...resultObject };
		delete sanitizedResult.argumentsRepairStatus;
		delete sanitizedResult.argumentsRepairOriginalPreview;
		delete sanitizedResult.argumentsRepairRepairedPreview;
		delete sanitizedResult.argumentsRepairAppliedRules;
		delete sanitizedResult.argumentsRepairError;
		if (String(sanitizedResult.errorCode || '').trim() === 'INVALID_TOOL_ARGUMENTS_JSON') {
			sanitizedResult.error = '工具参数不是有效 JSON。';
		}
		return sanitizedResult;
	}
	// 读取消息节点对应的展示文本。
	function readDisplayTextByMessageNode(messageNode?: any) {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return '';
		}
		const indexText: any = String(messageNode.getAttribute('data-display-index') || '').trim();
		if (!indexText) {
			return '';
		}
		const indexValue: any = Number(indexText);
		if (!Number.isFinite(indexValue) || indexValue < 0) {
			return '';
		}
		const record: any = chatDisplayMessages[indexValue];
		if (!record || typeof record !== 'object') {
			return '';
		}
		return String(record.text || '');
	}
	// 会话恢复后统一折叠规则：仅工具失败项保持展开。
	function applyFoldStateAfterSessionRestore() {
		if (!chatHistoryMessageContainer) {
			return;
		}
		const messageNodes: any = chatHistoryMessageContainer.querySelectorAll('.chat-message.reasoning, .chat-message.tool-exec');
		for (let index: any = 0; index < messageNodes.length; index += 1) {
			const messageNode: any = messageNodes[index];
			if (!messageNode || !(messageNode instanceof HTMLElement)) {
				continue;
			}
			const detailsElement: any = messageNode.querySelector('details.fold-block');
			if (!detailsElement) {
				continue;
			}
			if (messageNode.classList.contains('tool-exec')) {
				detailsElement.open = isFailedToolExecDisplayText(readDisplayTextByMessageNode(messageNode));
				continue;
			}
			detailsElement.open = false;
		}
	}
	// 判断节点是否为思考或工具调用消息。
	function isProcessMessageNode(node?: any) {
		if (!node || !(node instanceof HTMLElement)) {
			return false;
		}
		if (!node.classList.contains('chat-message')) {
			return false;
		}
		return node.classList.contains('reasoning') || node.classList.contains('tool-exec');
	}
	// 创建“执行过程”外层折叠节点。
	function createProcessGroupElements(defaultOpen?: any) {
		const wrapperNode: any = document.createElement('div');
		wrapperNode.className = 'chat-process-group';
		const detailsNode: any = document.createElement('details');
		detailsNode.className = 'process-group-fold';
		detailsNode.open = Boolean(defaultOpen);
		const summaryNode: any = document.createElement('summary');
		summaryNode.className = 'process-group-summary';
		const iconWrapNode: any = document.createElement('span');
		iconWrapNode.className = 'process-group-icon-wrap';
		iconWrapNode.setAttribute('aria-hidden', 'true');
		const chevronIconNode: any = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		chevronIconNode.setAttribute('class', 'process-group-icon-chevron');
		chevronIconNode.setAttribute('viewBox', '0 0 14 7');
		chevronIconNode.setAttribute('focusable', 'false');
		const chevronUseNode: any = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		chevronUseNode.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#icon-chevron-down');
		chevronIconNode.appendChild(chevronUseNode);
		iconWrapNode.appendChild(chevronIconNode);
		const titleNode: any = document.createElement('span');
		titleNode.className = 'process-group-title';
		titleNode.textContent = '执行过程';
		const loadingNode: any = document.createElement('span');
		loadingNode.className = 'process-group-loading-indicator';
		loadingNode.setAttribute('aria-hidden', 'true');
		loadingNode.innerHTML = '<svg class="process-group-loading-icon" viewBox="0 0 12 12" focusable="false"><use xlink:href="#icon-spinner-half"></use></svg>';
		summaryNode.appendChild(iconWrapNode);
		summaryNode.appendChild(titleNode);
		summaryNode.appendChild(loadingNode);
		const contentNode: any = document.createElement('div');
		contentNode.className = 'process-group-content';
		detailsNode.appendChild(summaryNode);
		detailsNode.appendChild(contentNode);
		wrapperNode.appendChild(detailsNode);
		return {
			wrapperNode,
			detailsNode,
			contentNode,
		};
	}
	// 会话恢复后重建连续思考/工具调用的外层折叠分组。
	function rebuildProcessFoldGroupsAfterSessionRestore() {
		if (!chatHistoryMessageContainer) {
			return;
		}
		const existedGroups: any = chatHistoryMessageContainer.querySelectorAll('.chat-process-group');
		for (let index: any = 0; index < existedGroups.length; index += 1) {
			const groupNode: any = existedGroups[index];
			if (!groupNode || !(groupNode instanceof HTMLElement)) {
				continue;
			}
			const contentNode: any = groupNode.querySelector('.process-group-content');
			const parentNode: any = groupNode.parentNode;
			if (contentNode && parentNode) {
				while (contentNode.firstChild) {
					parentNode.insertBefore(contentNode.firstChild, groupNode);
				}
			}
			groupNode.remove();
		}
		const children: any = Array.from(chatHistoryMessageContainer.children);
		let cursor: any = 0;
		while (cursor < children.length) {
			const currentNode: any = children[cursor];
			if (!isProcessMessageNode(currentNode)) {
				cursor += 1;
				continue;
			}
			let endCursor: any = cursor + 1;
			while (endCursor < children.length && isProcessMessageNode(children[endCursor])) {
				endCursor += 1;
			}
			if ((endCursor - cursor) <= 1) {
				cursor = endCursor;
				continue;
			}
			const processGroupElements: any = createProcessGroupElements(false);
			chatHistoryMessageContainer.insertBefore(processGroupElements.wrapperNode, children[cursor]);
			for (let moveIndex: any = cursor; moveIndex < endCursor; moveIndex += 1) {
				processGroupElements.contentNode.appendChild(children[moveIndex]);
			}
			cursor = endCursor;
		}
	}
	// 初始化聊天历史消息容器。
	function createChatHistoryMessageContainer(chatHistoryElement?: any) {
		if (!chatHistoryElement || !(chatHistoryElement instanceof HTMLElement)) {
			return null;
		}
		const messageContainer: any = document.createElement('div');
		messageContainer.className = 'chat-history-content';
		while (chatHistoryElement.firstChild) {
			messageContainer.appendChild(chatHistoryElement.firstChild);
		}
		chatHistoryElement.appendChild(messageContainer);
		return messageContainer;
	}
	// 创建聊天空状态占位节点。
	function createChatEmptyStateNode(chatHistoryElement?: any) {
		if (!chatHistoryElement || !(chatHistoryElement instanceof HTMLElement)) {
			return null;
		}
		const emptyStateNode: any = document.createElement('div');
		emptyStateNode.className = 'chat-empty-state';
		const examplesHtml: any = CHAT_EMPTY_STATE_EXAMPLES
			.map((exampleText: any) => `<li><button type="button" class="chat-empty-state-example-button" data-example-text="${escapeHtml(exampleText)}">${escapeHtml(exampleText)}</button></li>`)
			.join('');
		emptyStateNode.innerHTML = `<div class="chat-empty-state-card"><div class="chat-empty-state-logo" aria-hidden="true"><img src="/images/logo.png" alt="" /></div><div class="chat-empty-state-title">${escapeHtml(CHAT_EMPTY_STATE_TITLE_TEXT)}</div><div class="chat-empty-state-desc chat-empty-state-desc-primary">${escapeHtml(CHAT_EMPTY_STATE_NOTICE_TEXT)}</div></div><ul class="chat-empty-state-examples" aria-label="示例问题">${examplesHtml}</ul>`;
		emptyStateNode.addEventListener('click', (event?: any) => {
			const target: any = event && event.target ? event.target : null;
			const buttonElement: any = target && target.closest ? target.closest('.chat-empty-state-example-button') : null;
			if (!buttonElement) {
				return;
			}
			if (!chatEditor) {
				return;
			}
			const exampleText: any = String(buttonElement.getAttribute('data-example-text') || '').trim();
			if (!exampleText) {
				return;
			}
			writeChatInputText(exampleText);
			adjustChatInputHeight();
			updateSendButtonState();
			chatEditor.focus();
		});
		chatHistoryElement.appendChild(emptyStateNode);
		return emptyStateNode;
	}
	// 判断当前是否存在可展示的聊天消息。
	function hasVisibleChatMessages() {
		if (!chatHistoryMessageContainer) {
			return false;
		}
		return Boolean(chatHistoryMessageContainer.querySelector('.chat-message, .chat-process-group'));
	}
	// 刷新对话工具栏按钮可用状态。
	function updateChatSessionActionButtonState() {
		const hasAnySession: any = sessionManager.hasAnyChatSession();
		const activeSessionId: any = sessionManager.getActiveChatSessionId();
		if (chatSessionAddButton) {
			chatSessionAddButton.disabled = isSending || isRestoringSession || !hasAnySession;
		}
		if (chatSessionDeleteButton) {
			chatSessionDeleteButton.disabled = isSending || isRestoringSession || !hasAnySession || !activeSessionId;
		}
	}
	// 同步聊天空状态的显示与隐藏。
	function syncChatEmptyStateVisibility() {
		if (!chatEmptyStateNode) {
			return;
		}
		chatEmptyStateNode.classList.toggle('is-visible', !hasVisibleChatMessages());
		updateChatSessionActionButtonState();
	}
	// 创建通用滚动控制器（OverlayScrollbars + 按需滚动定位）。
	function createOverlayAutoFollowScrollController(scrollHostElement?: any, options?: any) {
		if (!scrollHostElement || !(scrollHostElement instanceof HTMLElement)) {
			return null;
		}
		const bottomSnapThreshold: any = Math.max(0, Number(options && options.bottomSnapThreshold) || 0);
		const allowHorizontalScroll: any = Boolean(options && options.allowHorizontalScroll);
		const normalizeAutoHideMode: any = (value: any) => {
			const modeText = String(value || '').trim();
			if (modeText === 'never' || modeText === 'leave' || modeText === 'scroll' || modeText === 'move') {
				return modeText;
			}
			return 'leave';
		};
		let autoHideMode: any = normalizeAutoHideMode(options && options.autoHideMode);
		let effectiveAutoHideMode: any = autoHideMode;
		let isPointerHovering: any = false;
		let isScrollActivityVisible: any = false;
		let scrollActivityHideTimerId: any = 0;
		const MANUAL_SCROLL_INTENT_WINDOW_MS: any = 260;
		let autoFollowEnabled: any = options && Object.prototype.hasOwnProperty.call(options, 'autoFollowEnabled')
			? Boolean(options.autoFollowEnabled)
			: false;
		let lastManualScrollIntentAt: any = 0;
		const overlayInstance: any = OverlayScrollbars(scrollHostElement, {
			overflow: {
				x: allowHorizontalScroll ? 'scroll' : 'hidden',
				y: 'scroll',
			},
			scrollbars: {
				theme: OVERLAY_SCROLLBAR_THEME_CLASS,
				autoHide: effectiveAutoHideMode,
				autoHideDelay: SCROLLBAR_AUTO_HIDE_DELAY,
				clickScroll: true,
			},
		});
		const overlayElements: any = overlayInstance.elements();
		const viewportElement: any = overlayElements.viewport;
		const contentElement: any = overlayElements.content;
		const contentBodyElement: any = document.createElement('div');
		contentBodyElement.className = 'chat-scroll-content-body';
		while (contentElement.firstChild) {
			contentBodyElement.appendChild(contentElement.firstChild);
		}
		contentElement.appendChild(contentBodyElement);
		const followAnchorElement: any = document.createElement('div');
		followAnchorElement.className = 'chat-scroll-follow-anchor';
		followAnchorElement.setAttribute('aria-hidden', 'true');
		contentElement.appendChild(followAnchorElement);
		// 读取当前到底部距离。
		function readBottomDistance() {
			return Math.max(0, viewportElement.scrollHeight - viewportElement.scrollTop - viewportElement.clientHeight);
		}
		// 清理滚动活动隐藏计时器。
		function clearScrollActivityHideTimer() {
			if (scrollActivityHideTimerId) {
				window.clearTimeout(scrollActivityHideTimerId);
				scrollActivityHideTimerId = 0;
			}
		}
		// 计算当前生效的滚动条自动隐藏模式。
		function computeEffectiveAutoHideMode() {
			if (autoHideMode === 'never') {
				return 'never';
			}
			if (isPointerHovering || isScrollActivityVisible) {
				return 'never';
			}
			return autoHideMode;
		}
		// 应用滚动条自动隐藏模式。
		function applyEffectiveAutoHideMode() {
			const nextMode: any = computeEffectiveAutoHideMode();
			if (nextMode === effectiveAutoHideMode) {
				return;
			}
			effectiveAutoHideMode = nextMode;
			overlayInstance.options({
				scrollbars: {
					theme: OVERLAY_SCROLLBAR_THEME_CLASS,
					autoHide: effectiveAutoHideMode,
					autoHideDelay: SCROLLBAR_AUTO_HIDE_DELAY,
					clickScroll: true,
				},
			});
			refresh();
		}
		// 按滚动活动延迟隐藏滚动条。
		function scheduleScrollActivityHide() {
			if (autoHideMode === 'never' || isPointerHovering) {
				return;
			}
			clearScrollActivityHideTimer();
			scrollActivityHideTimerId = window.setTimeout(() => {
				scrollActivityHideTimerId = 0;
				if (autoHideMode === 'never' || isPointerHovering) {
					return;
				}
				isScrollActivityVisible = false;
				applyEffectiveAutoHideMode();
			}, SCROLLBAR_AUTO_HIDE_DELAY);
		}
		// 标记滚动活动，保持滚动条可见并刷新延迟隐藏计时。
		function markScrollActivityVisible() {
			if (autoHideMode === 'never') {
				return;
			}
			isScrollActivityVisible = true;
			applyEffectiveAutoHideMode();
			scheduleScrollActivityHide();
		}
		// 判断是否在底部吸附范围内。
		function isAtBottom() {
			return readBottomDistance() <= bottomSnapThreshold;
		}
		// 记录用户手动滚动意图。
		function markManualScrollIntent() {
			lastManualScrollIntentAt = Date.now();
		}
		// 按滚动位置同步自动跟随状态。
		function syncAutoFollowByScrollPosition() {
			if (isAtBottom()) {
				autoFollowEnabled = true;
				return;
			}
			if ((Date.now() - lastManualScrollIntentAt) <= MANUAL_SCROLL_INTENT_WINDOW_MS) {
				autoFollowEnabled = false;
			}
		}
		// 刷新滚动容器布局。
		function refresh() {
			overlayInstance.update(true);
		}
		// 将锚点滚动到容器底部。
		function scrollAnchorToBottom(scrollMode?: any) {
			scrollIntoView(followAnchorElement, {
				behavior: 'auto',
				block: 'end',
				inline: 'nearest',
				scrollMode,
				boundary: viewportElement,
			});
		}
		// 在允许自动跟随时滚动到底部。
		function followToBottomIfAllowed() {
			if (!autoFollowEnabled) {
				return;
			}
			markScrollActivityVisible();
			scrollAnchorToBottom('if-needed');
			syncAutoFollowByScrollPosition();
		}
		// 强制滚动到底部并开启自动跟随。
		function forceFollowToBottom() {
			autoFollowEnabled = true;
			markScrollActivityVisible();
			scrollAnchorToBottom('always');
			window.requestAnimationFrame(() => {
				markScrollActivityVisible();
				scrollAnchorToBottom('if-needed');
				syncAutoFollowByScrollPosition();
			});
		}
		viewportElement.addEventListener('wheel', (event?: any) => {
			const deltaY: any = Number(event.deltaY) || 0;
			if (deltaY !== 0) {
				markManualScrollIntent();
			}
			if (deltaY < 0) {
				autoFollowEnabled = false;
			}
		}, { passive: true });
		viewportElement.addEventListener('pointerdown', () => {
			markManualScrollIntent();
		}, { passive: true });
		viewportElement.addEventListener('pointerenter', () => {
			isPointerHovering = true;
			applyEffectiveAutoHideMode();
		}, { passive: true });
		viewportElement.addEventListener('pointerleave', () => {
			isPointerHovering = false;
			scheduleScrollActivityHide();
			if (!isScrollActivityVisible) {
				applyEffectiveAutoHideMode();
			}
		}, { passive: true });
		viewportElement.addEventListener('scroll', () => {
			markScrollActivityVisible();
			syncAutoFollowByScrollPosition();
		}, { passive: true });
		return {
			refresh,
			getContentBodyElement: () => contentBodyElement,
			setBodyHtml: (htmlText?: any) => {
				contentBodyElement.innerHTML = String(htmlText || '');
			},
			setAutoHideMode: (modeValue?: any) => {
				const nextMode: any = normalizeAutoHideMode(modeValue);
				if (nextMode === autoHideMode) {
					return;
				}
				autoHideMode = nextMode;
				if (autoHideMode === 'never') {
					isScrollActivityVisible = false;
					clearScrollActivityHideTimer();
				}
				applyEffectiveAutoHideMode();
				if (autoHideMode !== 'never' && !isPointerHovering && isScrollActivityVisible) {
					scheduleScrollActivityHide();
				}
			},
			getViewportElement: () => viewportElement,
			setAutoFollowEnabled: (value?: any) => {
				autoFollowEnabled = Boolean(value);
			},
			isAutoFollowEnabled: () => autoFollowEnabled,
			isAtBottom,
			followToBottomIfAllowed,
			forceFollowToBottom,
		};
	}
	// 确保目标节点只创建一个滚动控制器。
	function ensureOverlayScrollController(scrollHostElement?: any, options?: any) {
		if (!scrollHostElement || !(scrollHostElement instanceof HTMLElement)) {
			return null;
		}
		const existedController: any = overlayScrollControllerMap.get(scrollHostElement);
		if (existedController) {
			if (options && Object.prototype.hasOwnProperty.call(options, 'autoFollowEnabled')) {
				existedController.setAutoFollowEnabled(Boolean(options.autoFollowEnabled));
			}
			if (options && Object.prototype.hasOwnProperty.call(options, 'autoHideMode')) {
				existedController.setAutoHideMode(options.autoHideMode);
			}
			return existedController;
		}
		const nextController: any = createOverlayAutoFollowScrollController(scrollHostElement, options || {});
		if (!nextController) {
			return null;
		}
		overlayScrollControllerMap.set(scrollHostElement, nextController);
		return nextController;
	}
	// 绑定消息节点中的滚动容器控制器。
	function bindOverlayScrollControllersInMessage(messageNode?: any) {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const foldContentElements: any = messageNode.querySelectorAll('.fold-content');
		for (let index: any = 0; index < foldContentElements.length; index += 1) {
			const foldContentElement: any = foldContentElements[index];
			const parentMessage: any = foldContentElement.closest('.chat-message');
			if (parentMessage && parentMessage.classList.contains('reasoning')) {
				continue;
			}
			ensureOverlayScrollController(foldContentElement, {
				bottomSnapThreshold: SCROLL_BOTTOM_SNAP_THRESHOLD,
				allowHorizontalScroll: false,
			});
		}
		const preElements: any = messageNode.querySelectorAll('pre');
		for (let index: any = 0; index < preElements.length; index += 1) {
			ensureOverlayScrollController(preElements[index], {
				bottomSnapThreshold: 0,
				allowHorizontalScroll: true,
			});
		}
	}
	// 在允许自动滚动时同步到底部。
	function scrollChatHistoryIfAllowed() {
		if (!chatHistoryScrollController) {
			return;
		}
		chatHistoryScrollController.followToBottomIfAllowed();
	}
	// 强制滚动聊天区到底部。
	function forceScrollChatHistoryToBottom() {
		if (!chatHistoryScrollController) {
			return;
		}
		chatHistoryScrollController.forceFollowToBottom();
	}
	// 关闭对话下拉列表。
	function closeChatSessionDropdown() {
		if (!chatSessionDropdown || !(chatSessionDropdown instanceof HTMLDetailsElement)) {
			return;
		}
		chatSessionDropdown.open = false;
	}
	// 格式化会话时间。
	function formatChatSessionTime(updatedAt?: any) {
		const timestamp: any = Number(updatedAt || 0);
		if (!Number.isFinite(timestamp) || timestamp <= 0) {
			return '';
		}
		const dateObject: any = new Date(timestamp);
		if (Number.isNaN(dateObject.getTime())) {
			return '';
		}
		const pad: any = (value: any) => String(value).padStart(2, '0');
		return `${dateObject.getFullYear()}/${pad(dateObject.getMonth() + 1)}/${pad(dateObject.getDate())
		} ${pad(dateObject.getHours())}:${pad(dateObject.getMinutes())}`;
	}
	// 按当前模型配置异步生成会话标题并回填到对应会话。
	function requestAsyncSessionTitleRefresh(params?: any) {
		const sessionId: any = String(params && params.sessionId ? params.sessionId : '').trim();
		const userText: any = String(params && params.userText ? params.userText : '').trim();
		const endpoint: any = String(params && params.endpoint ? params.endpoint : '').trim();
		const apiKey: any = String(params && params.apiKey ? params.apiKey : '').trim();
		const modelName: any = String(params && params.modelName ? params.modelName : '').trim();
		if (!sessionId || !userText || !endpoint || !apiKey || !modelName) {
			return;
		}
		sessionTitleRefreshTaskSeed += 1;
		const taskId: any = sessionTitleRefreshTaskSeed;
		sessionTitleRefreshTaskMap.set(sessionId, taskId);
		generateSessionTitleByModel({
			endpoint,
			apiKey,
			modelName,
			userText,
		}).then((titleText?: any) => {
			if (sessionTitleRefreshTaskMap.get(sessionId) !== taskId) {
				return;
			}
			if (!titleText) {
				return;
			}
			const updated: any = sessionManager.updateChatSessionTitleById(sessionId, titleText);
			if (!updated) {
				return;
			}
			renderChatSessionDropdownOptions();
		}).catch(() => {
			// 标题优化失败不影响主对话流程。
		});
	}
	// 创建单个会话下拉选项节点。
	function createChatSessionOptionElement(sessionItem?: any, isActive?: any) {
		const listItem: any = document.createElement('li');
		const optionButton: any = document.createElement('button');
		optionButton.className = `chat-sesson-option${isActive ? ' is-active' : ''}`;
		optionButton.type = 'button';
		optionButton.setAttribute('role', 'option');
		optionButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
		optionButton.setAttribute('data-session-id', String(sessionItem && sessionItem.id ? sessionItem.id : ''));
		const iconSpan: any = document.createElement('span');
		iconSpan.className = 'chat-sesson-option-icon';
		iconSpan.setAttribute('aria-hidden', 'true');
		iconSpan.innerHTML = '<svg viewBox="0 0 20 20" focusable="false"><use xlink:href="#icon-chat-speech-bubble"></use></svg>';
		const titleSpan: any = document.createElement('span');
		titleSpan.className = 'chat-sesson-option-title';
		titleSpan.textContent = String(sessionItem && sessionItem.title ? sessionItem.title : CHAT_SESSION_DEFAULT_TITLE);
		const timeSpan: any = document.createElement('span');
		timeSpan.className = 'chat-sesson-option-time';
		timeSpan.textContent = formatChatSessionTime(sessionItem && sessionItem.updatedAt ? sessionItem.updatedAt : 0);
		optionButton.appendChild(iconSpan);
		optionButton.appendChild(titleSpan);
		optionButton.appendChild(timeSpan);
		listItem.appendChild(optionButton);
		return listItem;
	}
	// 重新渲染会话下拉列表。
	function renderChatSessionDropdownOptions() {
		if (!chatSessionDropdownMenu) {
			return;
		}
		const dropdownRenderContainer: any = chatSessionDropdownScrollController
			? chatSessionDropdownScrollController.getContentBodyElement()
			: chatSessionDropdownMenu;
		const sessionList: any = sessionManager.listChatSessions();
		const activeSessionId: any = sessionManager.getActiveChatSessionId();
		const usingDefaultPlaceholder: any = !activeSessionId;
		dropdownRenderContainer.innerHTML = '';
		if (sessionList.length === 0) {
			const defaultItem: any = createChatSessionOptionElement({
				id: '',
				title: CHAT_SESSION_DEFAULT_TITLE,
				updatedAt: 0,
			}, true);
			dropdownRenderContainer.appendChild(defaultItem);
			if (chatSessionDropdownCurrent) {
				chatSessionDropdownCurrent.textContent = CHAT_SESSION_DEFAULT_TITLE;
			}
			updateChatSessionActionButtonState();
			return;
		}
		if (usingDefaultPlaceholder) {
			dropdownRenderContainer.appendChild(createChatSessionOptionElement({
				id: '',
				title: CHAT_SESSION_DEFAULT_TITLE,
				updatedAt: 0,
			}, true));
		}
		let hasActiveOption: any = false;
		for (let index: any = 0; index < sessionList.length; index += 1) {
			const item: any = sessionList[index];
			const isActive: any = String(item.id || '') === String(activeSessionId || '');
			if (isActive) {
				hasActiveOption = true;
			}
			dropdownRenderContainer.appendChild(createChatSessionOptionElement(item, isActive));
		}
		if (!usingDefaultPlaceholder && !hasActiveOption && dropdownRenderContainer.firstElementChild) {
			const fallbackOption: any = dropdownRenderContainer.firstElementChild.querySelector('.chat-sesson-option');
			if (fallbackOption) {
				fallbackOption.classList.add('is-active');
				fallbackOption.setAttribute('aria-selected', 'true');
			}
		}
		if (usingDefaultPlaceholder) {
			if (chatSessionDropdownCurrent) {
				chatSessionDropdownCurrent.textContent = CHAT_SESSION_DEFAULT_TITLE;
			}
			updateChatSessionActionButtonState();
			return;
		}
		const activeOption: any = chatSessionDropdownMenu.querySelector('.chat-sesson-option.is-active')
			|| chatSessionDropdownMenu.querySelector('.chat-sesson-option');
		if (chatSessionDropdownCurrent && activeOption) {
			const titleElement: any = activeOption.querySelector('.chat-sesson-option-title');
			chatSessionDropdownCurrent.textContent = String(titleElement && titleElement.textContent ? titleElement.textContent : CHAT_SESSION_DEFAULT_TITLE);
		}
		updateChatSessionActionButtonState();
	}
	if (chatHistory) {
		chatHistoryScrollController = ensureOverlayScrollController(chatHistory, {
			bottomSnapThreshold: SCROLL_BOTTOM_SNAP_THRESHOLD,
			allowHorizontalScroll: false,
			autoHideMode: 'leave',
			autoFollowEnabled: true,
		});
	}
	if (chatSessionDropdownMenu) {
		chatSessionDropdownScrollController = ensureOverlayScrollController(chatSessionDropdownMenu, {
			bottomSnapThreshold: 0,
			allowHorizontalScroll: false,
			autoHideMode: 'leave',
			autoFollowEnabled: false,
		});
	}
	// 待发送附件列表改为多行换行展示，不启用滚动容器包装。
	// 切换发送状态并更新按钮表现。
	function setSending(sending?: any) {
		isSending = !!sending;
		sendButton.dataset.sending = isSending ? '1' : '0';
		sendButton.setAttribute('aria-label', isSending ? '停止聊天' : '发送消息');
		sendButton.title = isSending ? '停止聊天' : '发送消息';
		updateChatSessionActionButtonState();
		if (isSending) {
			sendButton.disabled = false;
			sendButton.dataset.canSend = '1';
		}
		else {
			updateSendButtonState();
		}
		if (!isSending) {
			activeAbortController = null;
			stopStreamIdleWatch();
			hideRunningIndicator();
		}
	}
	// 判断输入框是否有可发送内容。
	function hasSendableInputText() {
		return String(readChatInputText()).trim().length > 0;
	}
	// 根据输入状态刷新发送按钮。
	function updateSendButtonState() {
		const canSend: any = hasSendableInputText() && !isRestoringSession;
		sendButton.dataset.canSend = canSend ? '1' : '0';
		if (!isSending) {
			sendButton.disabled = !canSend;
		}
	}
	// 判断错误是否为用户主动中断。
	function isAbortError(error?: any) {
		if (!error) {
			return false;
		}
		if (error.name === 'AbortError') {
			return true;
		}
		return String(error.message || '').toLowerCase().includes('abort');
	}
	// 停止当前执行中的会话。
	function stopCurrentRun() {
		if (!isSending || !activeAbortController) {
			return;
		}
		activeAbortController.abort();
	}
	// 隐藏运行中提示节点。
	function hideRunningIndicator() {
		if (runningIndicatorNode && runningIndicatorNode.parentNode) {
			runningIndicatorNode.remove();
		}
		runningIndicatorNode = null;
		syncChatEmptyStateVisibility();
	}
	// 显示运行中提示节点，收到流式数据后自动移除。
	function showRunningIndicator() {
		hideRunningIndicator();
		runningIndicatorNode = createMessageNode('ai', 'running');
		setMessageContent(runningIndicatorNode, 'ai', RUNNING_INDICATOR_TEXT, 'running');
		syncChatEmptyStateVisibility();
	}
	// 停止流式空闲监控。
	function stopStreamIdleWatch() {
		streamIdleWatchActive = false;
		if (streamIdleTimerId) {
			window.clearTimeout(streamIdleTimerId);
			streamIdleTimerId = 0;
		}
	}
	// 刷新流式空闲监控计时器。
	function refreshStreamIdleWatch() {
		if (!streamIdleWatchActive) {
			return;
		}
		if (streamIdleTimerId) {
			window.clearTimeout(streamIdleTimerId);
		}
		streamIdleTimerId = window.setTimeout(() => {
			if (!streamIdleWatchActive) {
				streamIdleTimerId = 0;
			}
		}, STREAM_IDLE_STATUS_DELAY);
	}
	// 启动流式空闲监控。
	function startStreamIdleWatch() {
		streamIdleWatchActive = true;
		refreshStreamIdleWatch();
	}
	// 标记流式输出仍在活跃。
	function markStreamActive() {
		if (!streamIdleWatchActive) {
			return;
		}
		hideRunningIndicator();
		refreshStreamIdleWatch();
	}
	// 根据选项文本动态调整模型下拉宽度。
	function adjustModelSelectWidth() {
		if (!modelSelect || !modelSelectControl || !modelSelectTrigger) {
			return;
		}
		const selectedIndex: any = modelSelect.selectedIndex;
		const selectedOption: any = selectedIndex >= 0 ? modelSelect.options[selectedIndex] : null;
		const optionText: any = selectedOption
			? String((selectedOption.getAttribute('data-label') || selectedOption.text || '').trim())
			: MODEL_SELECT_PLACEHOLDER_TEXT;
		const style: any = window.getComputedStyle(modelSelectTrigger);
		const adjustModelSelectWidthWithCache: any = adjustModelSelectWidth;
		const canvas: any = adjustModelSelectWidthWithCache.__canvas || (adjustModelSelectWidthWithCache.__canvas = document.createElement('canvas'));
		const context: any = canvas.getContext('2d');
		if (!context) {
			return;
		}
		context.font = style.font || (`${style.fontSize} ${style.fontFamily}`);
		const textWidth: any = Math.ceil(context.measureText(optionText).width);
		const nextWidth: any = Math.max(36, textWidth + 29);
		modelSelectTrigger.style.width = `${nextWidth}px`;
		modelSelectMenu.style.minWidth = `${nextWidth}px`;
		modelSelectControl.style.width = `${nextWidth}px`;
	}
	// 同步模型触发器显示文本。
	function syncModelSelectTrigger() {
		if (!modelSelect || !modelSelectTrigger) {
			return;
		}
		const selectedIndex: any = modelSelect.selectedIndex;
		const selectedOption: any = selectedIndex >= 0 ? modelSelect.options[selectedIndex] : null;
		const labelText: any = selectedOption
			? String((selectedOption.getAttribute('data-label') || selectedOption.text || '').trim())
			: MODEL_SELECT_PLACEHOLDER_TEXT;
		modelSelectTrigger.textContent = labelText;
	}
	// 关闭模型下拉菜单。
	function closeModelSelectMenu() {
		if (!modelSelectControl || !modelSelectTrigger) {
			return;
		}
		modelSelectControl.classList.remove('open');
		modelSelectTrigger.setAttribute('aria-expanded', 'false');
	}
	// 打开模型下拉菜单。
	function openModelSelectMenu() {
		if (!modelSelectControl || !modelSelectTrigger) {
			return;
		}
		modelSelectControl.classList.add('open');
		modelSelectTrigger.setAttribute('aria-expanded', 'true');
	}
	// 渲染模型下拉菜单项。
	function renderModelSelectMenu() {
		if (!modelSelect || !modelSelectMenu) {
			return;
		}
		modelSelectMenu.innerHTML = '';
		for (let index: any = 0; index < modelSelect.options.length; index += 1) {
			const option: any = modelSelect.options[index];
			const rawLabel: any = String(option.getAttribute('data-label') || option.text || '').trim();
			option.setAttribute('data-label', rawLabel);
			const itemButton: any = document.createElement('button');
			itemButton.type = 'button';
			itemButton.className = 'model-select-option';
			itemButton.setAttribute('role', 'option');
			itemButton.setAttribute('data-value', option.value);
			itemButton.textContent = rawLabel;
			if (option.value === modelSelect.value) {
				itemButton.classList.add('is-active');
			}
			itemButton.addEventListener('click', () => {
				if (modelSelect.value === option.value) {
					closeModelSelectMenu();
					return;
				}
				modelSelect.value = option.value;
				modelSelect.dispatchEvent(new Event('change'));
				closeModelSelectMenu();
			});
			modelSelectMenu.appendChild(itemButton);
		}
	}
	// 根据平台配置渲染模型下拉选项。
	function renderModelSelectOptionsByPlatformConfig() {
		if (!modelSelect) {
			return;
		}
		const platformList: any = readPlatformConfigs();
		modelSelect.innerHTML = '';
		for (let index: any = 0; index < platformList.length; index += 1) {
			const platformItem: any = platformList[index];
			const optionElement: any = document.createElement('option');
			optionElement.value = platformItem.id;
			optionElement.text = platformItem.label;
			modelSelect.appendChild(optionElement);
		}
	}
	// 确保图片悬停预览层存在。
	function ensureImageAttachmentHoverPreviewLayer() {
		if (imageAttachmentHoverPreviewLayer) {
			return imageAttachmentHoverPreviewLayer;
		}
		const previewLayer: any = document.createElement('div');
		previewLayer.className = 'image-attachment-hover-preview';
		previewLayer.setAttribute('aria-hidden', 'true');
		const previewImage: any = document.createElement('img');
		previewImage.className = 'image-attachment-hover-preview-image';
		previewImage.alt = '';
		previewImage.decoding = 'async';
		previewImage.loading = 'lazy';
		const previewName: any = document.createElement('div');
		previewName.className = 'image-attachment-hover-preview-name';
		previewLayer.appendChild(previewImage);
		previewLayer.appendChild(previewName);
		document.body.appendChild(previewLayer);
		imageAttachmentHoverPreviewLayer = previewLayer;
		imageAttachmentHoverPreviewImage = previewImage;
		imageAttachmentHoverPreviewName = previewName;
		return previewLayer;
	}
	// 清理图片悬停预览隐藏计时器。
	function clearImageAttachmentHoverHideTimer() {
		if (!imageAttachmentHoverHideTimerId) {
			return;
		}
		window.clearTimeout(imageAttachmentHoverHideTimerId);
		imageAttachmentHoverHideTimerId = 0;
	}
	// 隐藏图片悬停预览层。
	function hideImageAttachmentHoverPreview() {
		clearImageAttachmentHoverHideTimer();
		if (!imageAttachmentHoverPreviewLayer) {
			return;
		}
		imageAttachmentHoverPreviewLayer.classList.remove('is-visible');
	}
	// 延时隐藏图片悬停预览层，避免快速移动鼠标时闪烁。
	function debounceHideImageAttachmentHoverPreview() {
		clearImageAttachmentHoverHideTimer();
		imageAttachmentHoverHideTimerId = window.setTimeout(() => {
			imageAttachmentHoverHideTimerId = 0;
			hideImageAttachmentHoverPreview();
		}, IMAGE_ATTACHMENT_HOVER_HIDE_DEBOUNCE_MS);
	}
	// 显示图片悬停预览层。
	function showImageAttachmentHoverPreview(imageEntry?: any, anchorElement?: any) {
		if (!imageEntry || !imageEntry.dataUrl || !anchorElement) {
			return;
		}
		clearImageAttachmentHoverHideTimer();
		const previewLayer: any = ensureImageAttachmentHoverPreviewLayer();
		if (!previewLayer || !imageAttachmentHoverPreviewImage || !imageAttachmentHoverPreviewName) {
			return;
		}
		imageAttachmentHoverPreviewImage.src = String(imageEntry.dataUrl || '');
		imageAttachmentHoverPreviewName.textContent = String(imageEntry.name || '图片');
		const desiredWidth: any = Math.max(160, Math.min(220, Math.floor(window.innerWidth * 0.24)));
		previewLayer.style.width = `${desiredWidth}px`;
		previewLayer.style.left = '0px';
		previewLayer.style.top = '0px';
		previewLayer.dataset.placement = 'top';
		previewLayer.classList.add('is-visible');
		const anchorRect: any = anchorElement.getBoundingClientRect();
		const previewRect: any = previewLayer.getBoundingClientRect();
		const viewportPadding: any = 8;
		let centerX: any = anchorRect.left + (anchorRect.width / 2);
		const halfWidth: any = previewRect.width / 2;
		centerX = Math.max(viewportPadding + halfWidth, Math.min(window.innerWidth - viewportPadding - halfWidth, centerX));
		const topOffset: any = 10;
		let placement: any = 'top';
		let top: any = anchorRect.top - topOffset;
		if ((anchorRect.top - previewRect.height - topOffset) < viewportPadding) {
			placement = 'bottom';
			top = anchorRect.bottom + topOffset;
		}
		previewLayer.dataset.placement = placement;
		previewLayer.style.left = `${Math.round(centerX)}px`;
		previewLayer.style.top = `${Math.round(top)}px`;
	}
	// 绑定图片链接悬停预览交互。
	function bindImageLinkHoverPreview(anchorElement?: any, imageEntry?: any) {
		if (!anchorElement || !imageEntry || !imageEntry.dataUrl) {
			return;
		}
		anchorElement.addEventListener('mouseenter', () => {
			showImageAttachmentHoverPreview(imageEntry, anchorElement);
		});
		anchorElement.addEventListener('mouseleave', () => {
			debounceHideImageAttachmentHoverPreview();
		});
		anchorElement.addEventListener('focus', () => {
			showImageAttachmentHoverPreview(imageEntry, anchorElement);
		});
		anchorElement.addEventListener('blur', () => {
			debounceHideImageAttachmentHoverPreview();
		});
	}
	// 渲染待发送图片列表。
	function renderImageAttachmentList() {
		if (!imageAttachmentList) {
			return;
		}
		hideImageAttachmentHoverPreview();
		imageAttachmentList.innerHTML = '';
		for (let index: any = 0; index < pendingImageEntries.length; index += 1) {
			const imageEntry: any = pendingImageEntries[index];
			const itemNode: any = document.createElement('div');
			itemNode.className = 'image-attachment-item';
			const removeButton: any = document.createElement('button');
			removeButton.type = 'button';
			removeButton.className = 'image-attachment-remove';
			removeButton.setAttribute('aria-label', '删除图片');
			removeButton.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><use xlink:href="#icon-close-x"></use></svg>';
			removeButton.addEventListener('click', () => {
				hideImageAttachmentHoverPreview();
				const targetId: any = imageEntry.id;
				for (let entryIndex: any = 0; entryIndex < pendingImageEntries.length; entryIndex += 1) {
					if (pendingImageEntries[entryIndex].id === targetId) {
						pendingImageEntries.splice(entryIndex, 1);
						break;
					}
				}
				renderImageAttachmentList();
			});
			itemNode.addEventListener('mouseenter', () => {
				showImageAttachmentHoverPreview(imageEntry, itemNode);
			});
			itemNode.addEventListener('mouseleave', () => {
				debounceHideImageAttachmentHoverPreview();
			});
			itemNode.addEventListener('focusin', () => {
				showImageAttachmentHoverPreview(imageEntry, itemNode);
			});
			itemNode.addEventListener('focusout', (event?: any) => {
				const nextTarget: any = event && event.relatedTarget ? event.relatedTarget : null;
				if (nextTarget && itemNode.contains(nextTarget)) {
					return;
				}
				debounceHideImageAttachmentHoverPreview();
			});
			const nameNode: any = document.createElement('span');
			nameNode.className = 'image-attachment-name';
			nameNode.textContent = imageEntry.name || '图片';
			itemNode.appendChild(removeButton);
			itemNode.appendChild(nameNode);
			imageAttachmentList.appendChild(itemNode);
		}
	}
	// 清空待发送图片。
	function clearPendingImageEntries() {
		pendingImageEntries.length = 0;
		renderImageAttachmentList();
	}
	// 规范化图片文件名用于去重比较。
	function normalizeImageFileNameForDedup(fileName?: any) {
		return String(fileName || '').trim().toLowerCase();
	}
	// 生成图片内容去重键，用于拦截同一图片重复添加。
	function buildImageContentDedupKey(imageEntry?: any) {
		const dataUrlText: any = String(imageEntry && imageEntry.dataUrl ? imageEntry.dataUrl : '').trim();
		if (!dataUrlText) {
			return '';
		}
		const mimeTypeText: any = String(imageEntry && imageEntry.mimeType ? imageEntry.mimeType : '').trim().toLowerCase();
		return `${mimeTypeText}|${dataUrlText}`;
	}
	// 判断是否为自动命名的剪贴板截图文件名。
	function isAutoScreenshotImageName(fileName?: any) {
		const nameText: any = String(fileName || '').trim();
		return /^(?:image\d+(?:\.(?:png|jpe?g|webp|gif|bmp|svg))?|屏幕截图\s*\d+(?:\.(?:png|jpe?g|webp|gif|bmp|svg))?)$/i.test(nameText);
	}
	// 读取当前待发送截图的 image 序号最大值。
	function readMaxAutoImageNameIndex(entries?: any) {
		const sourceEntries: any = Array.isArray(entries) ? entries : [];
		let maxIndex: any = 0;
		for (let index: any = 0; index < sourceEntries.length; index += 1) {
			const entryItem: any = sourceEntries[index];
			const nameText: any = String(entryItem && entryItem.name ? entryItem.name : '').trim();
			const matched: any = nameText.match(/^(?:image|屏幕截图\s*)(\d+)(?:\.(?:png|jpe?g|webp|gif|bmp|svg))?$/i);
			if (!matched || !matched[1]) {
				continue;
			}
			const currentIndex: any = Number(matched[1]);
			if (!Number.isFinite(currentIndex) || currentIndex <= maxIndex) {
				continue;
			}
			maxIndex = currentIndex;
		}
		return maxIndex;
	}
	// 批量添加待发送图片。
	async function addPendingImages(fileList?: any, sourceType?: any) {
		const sourceFiles: any = Array.isArray(fileList) ? fileList : [];
		const imageFiles: any = sourceFiles.filter((fileObject: any) => {
			return fileObject && String(fileObject.type || '').toLowerCase().indexOf('image/') === 0;
		});
		if (imageFiles.length === 0) {
			return;
		}
		const isPasteUpload: any = String(sourceType || '').trim().toLowerCase() === 'paste';
		const uploadBatchToken: any = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const pasteImageNumberStart: any = readMaxAutoImageNameIndex(pendingImageEntries) + 1;
		const existingNameSet: any = new Set();
		const existingContentSet: any = new Set();
		for (let index: any = 0; index < pendingImageEntries.length; index += 1) {
			const pendingNameKey: any = normalizeImageFileNameForDedup(pendingImageEntries[index] && pendingImageEntries[index].name);
			if (pendingNameKey) {
				existingNameSet.add(pendingNameKey);
			}
			if (isPasteUpload) {
				const pendingNameText: any = String((pendingImageEntries[index] && pendingImageEntries[index].name) || '').trim();
				if (!isAutoScreenshotImageName(pendingNameText)) {
					continue;
				}
				const pendingContentKey: any = buildImageContentDedupKey(pendingImageEntries[index]);
				if (pendingContentKey) {
					existingContentSet.add(pendingContentKey);
				}
			}
		}
		const nameSetInCurrentBatch: any = new Set();
		const candidateImageFiles: any = [];
		for (let index: any = 0; index < imageFiles.length; index += 1) {
			const fileObject: any = imageFiles[index];
			const rawFileName: any = String(fileObject && fileObject.name ? fileObject.name : '').trim();
			const isPasteScreenshot: any = isPasteUpload && isGenericClipboardImageName(rawFileName);
			const shouldApplyNameDedup: any = !isPasteUpload;
			const resolvedFileName: any = resolveImageEntryName(fileObject, index, sourceType, uploadBatchToken, pasteImageNumberStart);
			const fileNameKey: any = normalizeImageFileNameForDedup(resolvedFileName);
			if (shouldApplyNameDedup && fileNameKey && (existingNameSet.has(fileNameKey) || nameSetInCurrentBatch.has(fileNameKey))) {
				continue;
			}
			if (shouldApplyNameDedup && fileNameKey) {
				nameSetInCurrentBatch.add(fileNameKey);
			}
			candidateImageFiles.push({
				fileObject,
				isPasteScreenshot,
				originalIndex: index,
			});
		}
		const remaining: any = IMAGE_ATTACHMENT_LIMIT - pendingImageEntries.length;
		if (remaining <= 0) {
			showEdaToastMessage(window, '最多可添加5张图片。', messageType.warning);
			return;
		}
		const contentSetInCurrentBatch: any = new Set();
		let addedImageCount: any = 0;
		for (let index: any = 0; index < candidateImageFiles.length; index += 1) {
			if (addedImageCount >= remaining) {
				break;
			}
			const candidateImageItem: any = candidateImageFiles[index];
			const fileObject: any = candidateImageItem.fileObject;
			try {
				const entry: any = await convertImageFileToEntry(fileObject, candidateImageItem.originalIndex, sourceType, uploadBatchToken, pasteImageNumberStart);
				if (candidateImageItem.isPasteScreenshot) {
					const contentKey: any = buildImageContentDedupKey(entry);
					if (contentKey && (existingContentSet.has(contentKey) || contentSetInCurrentBatch.has(contentKey))) {
						continue;
					}
					if (contentKey) {
						contentSetInCurrentBatch.add(contentKey);
					}
				}
				pendingImageEntries.push(entry);
				addedImageCount += 1;
			}
			catch { }
		}
		if (candidateImageFiles.length > remaining) {
			showEdaToastMessage(window, '最多可添加5张图片。', messageType.warning);
		}
		renderImageAttachmentList();
	}
	// 创建单条消息节点并追加到历史区。
	function createMessageNode(role?: any, variant?: any, displayIndex?: any) {
		const messageNode: any = document.createElement('div');
		const className: any = ['chat-message', role === 'user' ? 'user' : 'ai'];
		if (variant) {
			className.push(String(variant));
		}
		messageNode.className = className.join(' ');
		if (Number.isFinite(displayIndex) && displayIndex >= 0) {
			messageNode.setAttribute('data-display-index', String(displayIndex));
		}
		if (chatHistoryMessageContainer) {
			chatHistoryMessageContainer.appendChild(messageNode);
		}
		scrollChatHistoryIfAllowed();
		return messageNode;
	}
	// 构建折叠块标题。
	function buildFoldTitle(variant?: any, text?: any) {
		if (variant === 'reasoning') {
			return '思考';
		}
		if (variant === 'tool-exec') {
			const sourceText: any = String(text || '');
			const toolNameMatched: any = sourceText.match(/^\s*工具名[：:]\s*([^\r\n]+)/mu);
			const apiPathMatched: any = sourceText.match(/^\s*调用\s*API[：:]\s*([^\r\n]+)/mu);
			const toolName: any = toolNameMatched && toolNameMatched[1] ? String(toolNameMatched[1]).trim() : '';
			const apiPathRaw: any = apiPathMatched && apiPathMatched[1] ? String(apiPathMatched[1]).trim() : '';
			const apiPath: any = apiPathRaw && apiPathRaw !== '无' ? apiPathRaw : '';
			if (apiPath) {
				return `工具：${toolName || '未命名工具'}，API：${apiPath}。`;
			}
			return `工具：${toolName || '未命名工具'}。`;
		}
		return '';
	}
	// 构建折叠标题行内容，图标统一从 SVG 精灵中读取。
	function buildFoldSummaryInnerHtml(titleText?: any) {
		const safeTitleText: any = escapeHtml(String(titleText || '').trim());
		return `<span class="fold-summary-icon-wrap" aria-hidden="true"><svg class="fold-summary-icon fold-summary-icon-chevron" viewBox="0 0 14 7" focusable="false"><use xlink:href="#icon-chevron-down"></use></svg><svg class="fold-summary-icon fold-summary-icon-spinner" viewBox="0 0 12 12" focusable="false"><use xlink:href="#icon-spinner-half"></use></svg></span><span class="fold-summary-text">${safeTitleText}</span>`;
	}
	// 构建轮次模型说明文本。
	function buildRoundModelText(modelName?: any) {
		const safeModelName: any = String(modelName || '').trim();
		if (safeModelName) {
			return `本轮模型：${safeModelName}`;
		}
		return '本轮模型：未识别';
	}
	// 设置消息节点内容。
	function setMessageContent(messageNode?: any, role?: any, text?: any, variant?: any) {
		if (role === 'user') {
			const isRichMessage: any = text && typeof text === 'object' && !Array.isArray(text);
			messageNode.innerHTML = '';
			if (!isRichMessage) {
				const textNode: any = document.createElement('div');
				textNode.className = 'chat-user-text';
				textNode.textContent = String(text || '');
				messageNode.appendChild(textNode);
			}
			else {
				const payloadText: any = String(text.text || '').trim();
				const payloadImages: any = cloneImageEntries(text.images);
				// 文本与图片分离渲染，保证用户消息显示稳定。
				if (payloadText) {
					const textNode: any = document.createElement('div');
					textNode.className = 'chat-user-text';
					textNode.textContent = payloadText;
					messageNode.appendChild(textNode);
				}
				if (payloadImages.length > 0) {
					const imageLinkListNode: any = document.createElement('div');
					imageLinkListNode.className = 'chat-user-image-links';
					for (let index: any = 0; index < payloadImages.length; index += 1) {
						const imageItem: any = payloadImages[index];
						const rowNode: any = document.createElement('div');
						rowNode.className = 'chat-user-image-link-row';
						const linkNode: any = document.createElement('span');
						linkNode.className = 'chat-user-image-link';
						linkNode.textContent = imageItem.name || (`图片${String(index + 1)}`);
						bindImageLinkHoverPreview(linkNode, imageItem);
						rowNode.appendChild(linkNode);
						imageLinkListNode.appendChild(rowNode);
					}
					messageNode.appendChild(imageLinkListNode);
				}
			}
		}
		else {
			const normalizedText: any = String(text || '');
			if (variant === 'round-separator') {
				messageNode.innerHTML = '<div class="chat-round-separator-line" aria-hidden="true"></div>';
			}
			else if (variant === 'round-model') {
				messageNode.innerHTML = `<div class="chat-round-model-text">${escapeHtml(normalizedText)}</div>`;
			}
			else if (variant === 'running') {
				messageNode.innerHTML = `<span class="chat-running-status"><span class="chat-running-spinner" aria-hidden="true"><svg class="chat-running-spinner-icon" viewBox="0 0 12 12" focusable="false"><use xlink:href="#icon-spinner-half"></use></svg></span><span class="chat-running-text">${escapeHtml(normalizedText || RUNNING_INDICATOR_TEXT)}</span></span>`;
			}
			// 思考与工具执行消息使用折叠容器，普通回复直接渲染 Markdown。
			if (variant === 'reasoning') {
				const foldTitle: any = buildFoldTitle(variant, normalizedText);
				const foldContentHtml: any = renderMarkdown(normalizedText);
				messageNode.innerHTML = `<details class="fold-block" open><summary class="fold-summary">${buildFoldSummaryInnerHtml(foldTitle)}</summary><div class="fold-content">${foldContentHtml}</div></details>`;
			}
			else if (variant === 'tool-exec') {
				const foldTitle: any = buildFoldTitle(variant, normalizedText);
				if (DEBUG_TOOL_EXEC_DETAILS_EXPANDABLE) {
					const foldContentHtml: any = renderToolExecPlainText(normalizedText);
					messageNode.innerHTML = `<details class="fold-block" open><summary class="fold-summary">${buildFoldSummaryInnerHtml(foldTitle)}</summary><div class="fold-content">${foldContentHtml}</div></details>`;
				}
				else {
					messageNode.innerHTML = `<div class="tool-exec-title-only"><span class="tool-exec-title-only-glyph" aria-hidden="true"><svg class="tool-exec-title-only-icon" viewBox="0 0 100 100" focusable="false"><use xlink:href="#icon-tool-equipment"></use></svg><span class="tool-exec-title-only-spinner"><svg class="tool-exec-title-only-spinner-icon" viewBox="0 0 12 12" focusable="false"><use xlink:href="#icon-spinner-half"></use></svg></span></span><span class="tool-exec-title-only-text">${escapeHtml(foldTitle)}</span></div>`;
				}
			}
			else if (variant !== 'round-separator' && variant !== 'round-model' && variant !== 'running') {
				messageNode.innerHTML = renderMarkdown(normalizedText);
			}
		}
		bindOverlayScrollControllersInMessage(messageNode);
		sessionManager.syncDisplayRecordByMessageNode(messageNode, role, text, variant);
		scrollChatHistoryIfAllowed();
	}
	// 折叠指定消息中的推理详情。
	function collapseReasoningDetails(messageNode?: any) {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const detailsElement: any = messageNode.querySelector('details.fold-block');
		if (detailsElement) {
			detailsElement.open = false;
		}
	}
	// 设置消息折叠块展开状态。
	function setMessageFoldOpen(messageNode?: any, value?: any) {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const detailsElement: any = messageNode.querySelector('details.fold-block');
		if (detailsElement) {
			detailsElement.open = Boolean(value);
		}
	}
	// 设置消息折叠块加载态。
	function setFoldLoadingState(messageNode?: any, isLoading?: any) {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const detailsElement: any = messageNode.querySelector('details.fold-block');
		if (detailsElement) {
			detailsElement.classList.toggle('is-loading', Boolean(isLoading));
			return;
		}
		const toolTitleOnlyElement: any = messageNode.querySelector('.tool-exec-title-only');
		if (toolTitleOnlyElement) {
			toolTitleOnlyElement.classList.toggle('is-loading', Boolean(isLoading));
		}
	}
	// 清理历史区残留的折叠加载态。
	function clearFoldLoadingIndicators() {
		if (!chatHistoryMessageContainer) {
			return;
		}
		const loadingDetails: any = chatHistoryMessageContainer.querySelectorAll('details.fold-block.is-loading');
		for (let index: any = 0; index < loadingDetails.length; index += 1) {
			loadingDetails[index].classList.remove('is-loading');
		}
		const loadingToolTitles: any = chatHistoryMessageContainer.querySelectorAll('.tool-exec-title-only.is-loading');
		for (let index: any = 0; index < loadingToolTitles.length; index += 1) {
			loadingToolTitles[index].classList.remove('is-loading');
		}
	}
	// 追加一条完整消息。
	function appendMessage(role?: any, text?: any, variant?: any) {
		const displayIndex: any = sessionManager.pushDisplayMessageRecord(role, text, variant);
		const messageNode: any = createMessageNode(role, variant, displayIndex);
		setMessageContent(messageNode, role, text, variant);
		syncChatEmptyStateVisibility();
		return messageNode;
	}
	// 创建思考与工具调用的外层折叠分组控制器（仅在连续消息超过 1 条时启用）。
	function createProcessFoldGroupController() {
		let firstProcessNode: any = null;
		let groupWrapperNode: any = null;
		let groupDetailsNode: any = null;
		let groupContentNode: any = null;
		let groupLoading: any = false;
		let hasCollapsedOnContent: any = false;
		// 重置当前过程分组状态，供下一段过程消息重新起组。
		function resetProcessGroupState() {
			firstProcessNode = null;
			groupWrapperNode = null;
			groupDetailsNode = null;
			groupContentNode = null;
			hasCollapsedOnContent = false;
		}
		// 应用外层分组加载态样式。
		function applyGroupLoadingState() {
			if (!groupDetailsNode) {
				return;
			}
			groupDetailsNode.classList.toggle('is-loading', Boolean(groupLoading));
		}
		// 确保外层分组节点已创建。
		function ensureGroupNode() {
			if (groupDetailsNode) {
				return;
			}
			if (!chatHistoryMessageContainer || !firstProcessNode) {
				return;
			}
			const processGroupElements: any = createProcessGroupElements(true);
			groupWrapperNode = processGroupElements.wrapperNode;
			groupDetailsNode = processGroupElements.detailsNode;
			groupContentNode = processGroupElements.contentNode;
			const firstNodeParent: any = firstProcessNode.parentNode;
			if (firstNodeParent) {
				firstNodeParent.insertBefore(groupWrapperNode, firstProcessNode);
			}
			else {
				chatHistoryMessageContainer.appendChild(groupWrapperNode);
			}
			groupContentNode.appendChild(firstProcessNode);
			applyGroupLoadingState();
			scrollChatHistoryIfAllowed();
		}
		// 追加一条过程消息到外层分组。
		function appendProcessNode(messageNode?: any) {
			if (!messageNode || !(messageNode instanceof HTMLElement)) {
				return;
			}
			if (!firstProcessNode) {
				firstProcessNode = messageNode;
				return;
			}
			ensureGroupNode();
			if (!groupContentNode) {
				return;
			}
			if (messageNode.parentNode !== groupContentNode) {
				groupContentNode.appendChild(messageNode);
			}
			applyGroupLoadingState();
			scrollChatHistoryIfAllowed();
		}
		return {
			appendProcessNode,
			setLoading(value?: any) {
				groupLoading = Boolean(value);
				applyGroupLoadingState();
			},
			collapseOnContent() {
				if (hasCollapsedOnContent) {
					return;
				}
				hasCollapsedOnContent = true;
				groupLoading = false;
				applyGroupLoadingState();
				if (groupDetailsNode) {
					groupDetailsNode.open = false;
				}
				resetProcessGroupState();
			},
			finalize() {
				groupLoading = false;
				applyGroupLoadingState();
				resetProcessGroupState();
			},
		};
	}
	// 创建 AI 流式输出消息控制器。
	function createAiStreamingMessage(variant?: any) {
		const displayIndex: any = sessionManager.pushDisplayMessageRecord('ai', '', variant);
		const messageNode: any = createMessageNode('ai', variant, displayIndex);
		let displayText: any = '';
		let isFoldLoading: any = false;
		let hasAutoOpenedFold: any = false;
		let foldDetailsElement: any = null;
		let foldSummaryElement: any = null;
		let foldContentElement: any = null;
		let foldContentScrollController: any = null;
		let foldSummaryInnerHtmlCache: any = '';
		// 判断当前是否为折叠展示类型。
		function isFoldVariant() {
			if (variant === 'reasoning') {
				return true;
			}
			if (variant === 'tool-exec') {
				return Boolean(DEBUG_TOOL_EXEC_DETAILS_EXPANDABLE);
			}
			return false;
		}
		// 确保折叠节点已创建并返回引用。
		function ensureFoldElements(sourceText?: any) {
			if (!isFoldVariant()) {
				return null;
			}
			// 首次渲染时懒创建折叠结构，后续仅更新内容。
			if (!foldDetailsElement || !foldSummaryElement || !foldContentElement) {
				messageNode.innerHTML = '';
				foldDetailsElement = document.createElement('details');
				foldDetailsElement.className = 'fold-block';
				if (variant === 'reasoning') {
					foldDetailsElement.open = true;
				}
				foldSummaryElement = document.createElement('summary');
				foldSummaryElement.className = 'fold-summary';
				foldContentElement = document.createElement('div');
				foldContentElement.className = 'fold-content';
				foldDetailsElement.appendChild(foldSummaryElement);
				foldDetailsElement.appendChild(foldContentElement);
				messageNode.appendChild(foldDetailsElement);
				foldSummaryInnerHtmlCache = '';
				if (variant === 'tool-exec') {
					foldContentScrollController = ensureOverlayScrollController(foldContentElement, {
						bottomSnapThreshold: SCROLL_BOTTOM_SNAP_THRESHOLD,
						allowHorizontalScroll: false,
						autoHideMode: 'leave',
						autoFollowEnabled: false,
					});
				}
				else {
					foldContentScrollController = null;
				}
			}
			const foldTitle: any = buildFoldTitle(variant, sourceText);
			const nextFoldSummaryInnerHtml: any = buildFoldSummaryInnerHtml(foldTitle);
			// 仅在标题内容变化时更新节点，避免流式分片频繁重建导致加载图标动画被重置。
			if (nextFoldSummaryInnerHtml !== foldSummaryInnerHtmlCache) {
				foldSummaryElement.innerHTML = nextFoldSummaryInnerHtml;
				foldSummaryInnerHtmlCache = nextFoldSummaryInnerHtml;
			}
			return {
				details: foldDetailsElement,
				content: foldContentElement,
			};
		}
		// 控制折叠块展开状态。
		function setFoldOpen(value?: any) {
			const detailsElement: any = foldDetailsElement || messageNode.querySelector('details.fold-block');
			if (detailsElement) {
				detailsElement.open = Boolean(value);
			}
		}
		// 自动展开折叠块（仅触发一次）。
		function autoOpenFoldOnce() {
			if (hasAutoOpenedFold) {
				return;
			}
			hasAutoOpenedFold = true;
			setFoldOpen(true);
		}
		// 同步折叠块加载态样式。
		function syncFoldLoadingState() {
			if (foldDetailsElement) {
				foldDetailsElement.classList.toggle('is-loading', Boolean(isFoldLoading));
				return;
			}
			setFoldLoadingState(messageNode, isFoldLoading);
		}
		// 统一渲染流式消息。
		function renderStreamingMessage() {
			if (isFoldVariant()) {
				const foldElements: any = ensureFoldElements(displayText);
				if (foldElements && foldElements.content) {
					// 工具输出走纯文本容器，推理内容走 Markdown 渲染。
					const nextContentHtml: any = variant === 'tool-exec'
						? renderToolExecPlainText(displayText)
						: renderMarkdown(displayText);
					if (foldContentScrollController && typeof foldContentScrollController.setBodyHtml === 'function') {
						foldContentScrollController.setBodyHtml(nextContentHtml);
					}
					else {
						foldElements.content.innerHTML = nextContentHtml;
					}
				}
				sessionManager.syncDisplayRecordByMessageNode(messageNode, 'ai', displayText, variant);
				syncFoldLoadingState();
				scrollChatHistoryIfAllowed();
				return;
			}
			setMessageContent(messageNode, 'ai', displayText, variant);
			syncFoldLoadingState();
		}
		return {
			append(textChunk?: any) {
				const chunk: any = String(textChunk || '');
				if (!chunk) {
					return;
				}
				displayText += chunk;
				renderStreamingMessage();
				autoOpenFoldOnce();
			},
			set(fullText?: any) {
				displayText = String(fullText || '');
				renderStreamingMessage();
				autoOpenFoldOnce();
			},
			setLoading(value?: any) {
				isFoldLoading = Boolean(value);
				syncFoldLoadingState();
			},
			collapse() {
				setFoldOpen(false);
			},
			getText() {
				return displayText;
			},
			getNode() {
				return messageNode;
			},
		};
	}
	// 获取最近一条用户消息索引。
	function findLastUserMessageIndex(messages?: any) {
		const source: any = Array.isArray(messages) ? messages : [];
		for (let index: any = source.length - 1; index >= 0; index -= 1) {
			const item: any = source[index];
			if (item && item.role === 'user') {
				return index;
			}
		}
		return -1;
	}
	// 粗略估算文本 token 数。
	function estimateTokenCount(text?: any) {
		const source: any = String(text || '');
		if (!source) {
			return 0;
		}
		return Math.ceil(source.length / 1.6);
	}
	// 读取单条上下文消息的文本内容。
	function getContextMessageText(messageItem?: any) {
		if (!messageItem || typeof messageItem !== 'object') {
			return '';
		}
		if (messageItem.role === 'tool') {
			const toolName: any = String(messageItem.name || '').trim();
			const toolContent: any = String(messageItem.content || '').trim();
			return `[tool:${toolName}]\n${toolContent}`;
		}
		const contentText: any = readAssistantContent(messageItem.content);
		const toolCallBrief: any = (Array.isArray(messageItem.tool_calls) && messageItem.tool_calls.length > 0)
			? (`[tool_calls:${messageItem.tool_calls.length}]`)
			: '';
		return [contentText, toolCallBrief].filter((piece?: any) => {
			return !!String(piece || '').trim();
		}).join('\n');
	}
	// 估算消息在上下文中的 token 占用。
	function estimateMessageTokenUsage(messageItem?: any) {
		if (!messageItem || typeof messageItem !== 'object') {
			return 0;
		}
		const roleText: any = String(messageItem.role || '').trim();
		const contentText: any = getContextMessageText(messageItem);
		return estimateTokenCount(roleText) + estimateTokenCount(contentText) + 12;
	}
	// 构建受 token 预算约束的上下文窗口。
	function buildContextWindowMessages() {
		const history: any = Array.isArray(agentMessages) ? agentMessages : [];
		if (history.length === 0) {
			return [];
		}
		let totalTokens: any = 0;
		for (let index: any = 0; index < history.length; index += 1) {
			totalTokens += estimateMessageTokenUsage(history[index]);
		}
		if (totalTokens <= MODEL_CONTEXT_HISTORY_BUDGET_TOKENS) {
			return history.slice();
		}
		let rollingTokens: any = 0;
		let startIndex: any = history.length - 1;
		for (let index: any = history.length - 1; index >= 0; index -= 1) {
			const usage: any = estimateMessageTokenUsage(history[index]);
			if (rollingTokens + usage > MODEL_CONTEXT_HISTORY_BUDGET_TOKENS) {
				break;
			}
			rollingTokens += usage;
			startIndex = index;
		}
		while (startIndex < history.length && history[startIndex] && history[startIndex].role !== 'user') {
			startIndex += 1;
		}
		if (startIndex >= history.length) {
			startIndex = Math.max(0, history.length - 1);
		}
		let sliced: any = history.slice(startIndex);
		while (sliced.length > 0 && sliced[0] && sliced[0].role === 'tool') {
			sliced = sliced.slice(1);
		}
		return sliced;
	}
	// 组装 responses 回退输入文本。
	function buildResponsesInputText(systemPromptText?: any) {
		const contextMessages: any = buildContextWindowMessages();
		const historyLines: any = [];
		for (let index: any = 0; index < contextMessages.length; index += 1) {
			const messageItem: any = contextMessages[index];
			if (!messageItem || (messageItem.role !== 'user' && messageItem.role !== 'assistant')) {
				continue;
			}
			const contentText: any = readAssistantContent(messageItem.content);
			if (!contentText) {
				continue;
			}
			historyLines.push(`${messageItem.role === 'assistant' ? '助手' : '用户'}：${contentText}`);
		}
		const recentLines: any = historyLines.slice(-12);
		const historyText: any = recentLines.join('\n');
		const pieces: any = [`系统提示：${String(systemPromptText || '').trim()}`];
		if (historyText) {
			pieces.push(`对话历史：\n${historyText}`);
		}
		return pieces.join('\n\n');
	}
	// 规范化消息内容为 responses 所需结构。
	function normalizeMessageContentForResponses(content?: any) {
		const normalized: any = [];
		// 追加文本片段。
		function pushText(text?: any) {
			const trimmed: any = String(text || '').trim();
			if (trimmed) {
				normalized.push({
					type: 'input_text',
					text: trimmed,
				});
			}
		}
		// 追加图片片段。
		function pushImage(urlValue?: any) {
			if (!urlValue) {
				return;
			}
			const imageUrl: any = typeof urlValue === 'string' ? urlValue : (urlValue && urlValue.url ? urlValue.url : '');
			if (!imageUrl) {
				return;
			}
			normalized.push({
				type: 'input_image',
				image_url: imageUrl,
			});
		}
		if (typeof content === 'string') {
			pushText(content);
			return normalized;
		}
		if (!Array.isArray(content)) {
			return normalized;
		}
		for (let index: any = 0; index < content.length; index += 1) {
			const item: any = content[index];
			if (!item || typeof item !== 'object') {
				continue;
			}
			const type: any = String(item.type || '').trim().toLowerCase();
			if (type === 'input_text' || type === 'text') {
				pushText(item.text || item.output_text || '');
				continue;
			}
			if (type === 'input_image') {
				pushImage(item.image_url || '');
				continue;
			}
			if (type === 'image_url') {
				pushImage(item.image_url || '');
				continue;
			}
		}
		return normalized;
	}
	// 构建 responses 输入条目数组。
	function buildResponsesInputEntries(systemPromptText?: any) {
		const contextMessages: any = buildContextWindowMessages();
		const lastUserIndex: any = findLastUserMessageIndex(contextMessages);
		const entries: any = [];
		for (let index: any = 0; index < contextMessages.length; index += 1) {
			const messageItem: any = contextMessages[index];
			if (!messageItem || !messageItem.role) {
				continue;
			}
			if (messageItem.role === 'tool') {
				if (index <= lastUserIndex) {
					continue;
				}
				const callId: any = String(messageItem.tool_call_id || '').trim();
				const outputText: any = String(messageItem.content || '').trim();
				if (!callId || !outputText) {
					continue;
				}
				entries.push({
					type: 'function_call_output',
					call_id: callId,
					output: outputText,
				});
				continue;
			}
			if (messageItem.role !== 'user' && messageItem.role !== 'assistant') {
				continue;
			}
			const contentArray: any = normalizeMessageContentForResponses(messageItem.content);
			if (contentArray.length === 0) {
				continue;
			}
			const entry: any = {
				role: messageItem.role,
				content: contentArray,
			};
			if (messageItem.role === 'assistant') {
				const reasoningContent: any = readReasoningContent(messageItem);
				if (reasoningContent) {
					entry.reasoning_content = reasoningContent;
				}
			}
			entries.push(entry);
		}
		if (entries.length === 0) {
			entries.push({
				role: 'user',
				content: [
					{
						type: 'input_text',
						text: buildResponsesInputText(systemPromptText),
					},
				],
			});
		}
		return entries;
	}
	// 规范化消息内容为 chat/completions 结构。
	function normalizeMessageContentForChat(content?: any, allowImagePart?: any) {
		const normalizedParts: any = [];
		const textLines: any = [];
		// 追加文本内容。
		function pushText(text?: any) {
			const trimmed: any = String(text || '').trim();
			if (!trimmed) {
				return;
			}
			textLines.push(trimmed);
			if (allowImagePart) {
				normalizedParts.push({
					type: 'text',
					text: trimmed,
				});
			}
		}
		// 追加图片内容。
		function pushImage(imageValue?: any) {
			const imageUrl: any = typeof imageValue === 'string'
				? imageValue
				: (imageValue && imageValue.url ? String(imageValue.url) : '');
			if (!imageUrl) {
				return;
			}
			textLines.push('[图片]');
			if (allowImagePart) {
				normalizedParts.push({
					type: 'image_url',
					image_url: {
						url: imageUrl,
					},
				});
			}
		}
		if (typeof content === 'string') {
			pushText(content);
		}
		else if (Array.isArray(content)) {
			for (let index: any = 0; index < content.length; index += 1) {
				const item: any = content[index];
				if (!item) {
					continue;
				}
				if (typeof item === 'string') {
					pushText(item);
					continue;
				}
				const type: any = String(item.type || '').trim().toLowerCase();
				if (type === 'text' || type === 'input_text') {
					pushText(item.text || item.output_text || '');
					continue;
				}
				if (type === 'image_url' || type === 'input_image') {
					pushImage(item.image_url || '');
				}
			}
		}
		if (allowImagePart) {
			if (normalizedParts.length === 0) {
				return '';
			}
			if (normalizedParts.length === 1 && normalizedParts[0].type === 'text') {
				return normalizedParts[0].text;
			}
			return normalizedParts;
		}
		return textLines.join('\n').trim();
	}
	// 构建 chat/completions 消息数组。
	function buildChatMessagesEntries(selectedModelValue?: any, systemPromptText?: any) {
		const outputMessages: any = [{ role: 'system', content: String(systemPromptText || '').trim() }];
		const contextMessages: any = buildContextWindowMessages();
		const lastUserIndex: any = findLastUserMessageIndex(contextMessages);
		const imagePayloadMode: any = resolveImagePayloadMode(selectedModelValue);
		const allowImagePart: any = imagePayloadMode === 'image_url';
		for (let index: any = 0; index < contextMessages.length; index += 1) {
			const messageItem: any = contextMessages[index];
			if (!messageItem || !messageItem.role) {
				continue;
			}
			if (messageItem.role === 'tool') {
				if (index <= lastUserIndex) {
					continue;
				}
				outputMessages.push({
					role: 'tool',
					tool_call_id: String(messageItem.tool_call_id || ''),
					name: String(messageItem.name || ''),
					content: String(messageItem.content || '').trim(),
				});
				continue;
			}
			if (messageItem.role === 'user' || messageItem.role === 'assistant') {
				const hasToolCalls: any = messageItem.role === 'assistant'
					&& index > lastUserIndex
					&& Array.isArray(messageItem.tool_calls)
					&& messageItem.tool_calls.length > 0;
				const normalizedContent: any = normalizeMessageContentForChat(messageItem.content, allowImagePart);
				if (!normalizedContent && !hasToolCalls) {
					continue;
				}
				const normalizedMessage: any = {
					role: messageItem.role,
					content: normalizedContent || '',
				};
				if (messageItem.role === 'assistant') {
					const reasoningContent: any = readReasoningContent(messageItem);
					if (reasoningContent) {
						normalizedMessage.reasoning_content = reasoningContent;
					}
				}
				if (hasToolCalls) {
					normalizedMessage.tool_calls = messageItem.tool_calls;
				}
				outputMessages.push(normalizedMessage);
			}
		}
		return outputMessages;
	}
	// 读取 responses 接口输出文本。
	function readResponsesOutputText(responseData?: any) {
		if (!responseData || typeof responseData !== 'object') {
			return '';
		}
		if (typeof responseData.output_text === 'string' && responseData.output_text.trim()) {
			return responseData.output_text.trim();
		}
		const textParts: any = [];
		const outputList: any = Array.isArray(responseData.output) ? responseData.output : [];
		for (let index: any = 0; index < outputList.length; index += 1) {
			const outputItem: any = outputList[index];
			if (!outputItem) {
				continue;
			}
			if (typeof outputItem.text === 'string' && outputItem.text) {
				textParts.push(outputItem.text);
			}
			const contentList: any = Array.isArray(outputItem.content) ? outputItem.content : [];
			for (let contentIndex: any = 0; contentIndex < contentList.length; contentIndex += 1) {
				const contentItem: any = contentList[contentIndex];
				if (!contentItem) {
					continue;
				}
				if (typeof contentItem.text === 'string' && contentItem.text) {
					textParts.push(contentItem.text);
				}
				else if (typeof contentItem.output_text === 'string' && contentItem.output_text) {
					textParts.push(contentItem.output_text);
				}
			}
		}
		return textParts.join('\n').trim();
	}
	// 读取助手消息文本内容。
	function readAssistantContent(content?: any) {
		if (typeof content === 'string') {
			return content;
		}
		if (Array.isArray(content)) {
			return content
				.map((item?: any) => {
					if (!item) {
						return '';
					}
					if (typeof item === 'string') {
						return item;
					}
					if (item.type === 'text' || item.type === 'input_text') {
						return String(item.text || '');
					}
					if (item.type === 'image_url' || item.type === 'input_image') {
						return '[图片]';
					}
					return '';
				})
				.join('\\n')
				.trim();
		}
		return '';
	}
	// 规范化推理内容文本。
	function normalizeReasoning(value?: any) {
		if (!value) {
			return '';
		}
		if (typeof value === 'string') {
			return value.trim();
		}
		if (Array.isArray(value)) {
			return value
				.map((item?: any) => {
					if (!item) {
						return '';
					}
					if (typeof item === 'string') {
						return item;
					}
					if (typeof item.text === 'string') {
						return item.text;
					}
					if (typeof item.reasoning_content === 'string') {
						return item.reasoning_content;
					}
					return '';
				})
				.join('\n')
				.trim();
		}
		if (typeof value === 'object') {
			if (typeof value.text === 'string') {
				return value.text.trim();
			}
			if (typeof value.reasoning_content === 'string') {
				return value.reasoning_content.trim();
			}
		}
		return '';
	}
	// 读取消息中的推理内容。
	function readReasoningContent(message?: any, fallbackText?: any) {
		const fromMessage: any = normalizeReasoning(message && (message.reasoning_content || message.reasoning || message.reasoningContent));
		if (fromMessage) {
			return fromMessage;
		}
		return String(fallbackText || '').trim();
	}
	// 提取 think 标签中的推理文本。
	function splitThinkContent(text?: any) {
		const input: any = String(text || '');
		const thinkParts: any = [];
		const cleaned: any = input
			.replace(/<think>([\s\S]*?)<\/think>/gi, (_: any, content: any) => {
				const part = String(content || '').trim();
				if (part) {
					thinkParts.push(part);
				}
				return '';
			})
			.trim();
		return {
			cleanContent: cleaned,
			reasoningText: thinkParts.join('\n\n').trim(),
		};
	}
	// 调用模型并处理流式返回。
	async function callModel(config?: any, onStreamDelta?: any, abortSignal?: any) {
		const requestConfig: any = validateModelRequestConfig(config, getNormalizedEndpoint);
		const endpoint: any = requestConfig.endpoint;
		const modelName: any = requestConfig.modelName;
		const apiKey: any = requestConfig.apiKey;
		const isResponsesEndpoint: any = endpoint.endsWith('/responses');
		const promptResult: any = readAgentSystemPrompt();
		const systemPromptText: any = String(promptResult && promptResult.prompt ? promptResult.prompt : '').trim();
		const payload: any = buildModelRequestPayload({
			isResponsesEndpoint,
			modelName,
			responsesInput: buildResponsesInputEntries(systemPromptText),
			responsesTools: buildResponsesTools(exposedTools),
			chatMessages: buildChatMessagesEntries(config.selectedModel, systemPromptText),
			chatTools: exposedTools,
			selectedModel: config.selectedModel,
			thinkingEnabled: readThinkingModeEnabledFromConfig(config, config.selectedModel),
			maxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
		});
		const response: any = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			signal: abortSignal,
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const errorText: any = await response.text();
			let errorData: any = null;
			try {
				errorData = JSON.parse(errorText);
			}
			catch {
				errorData = null;
			}
			const errorMessage: any = errorData && errorData.error && errorData.error.message
				? String(errorData.error.message)
				: `HTTP ${response.status}`;
			throw new Error(errorMessage);
		}
		if (!response.body) {
			throw new Error('模型未返回流式数据。');
		}
		const message: any = {
			role: 'assistant',
			content: '',
			reasoning_content: '',
			tool_calls: [],
		};
		const reader: any = response.body.getReader();
		const decoder: any = new TextDecoder('utf-8');
		let buffer: any = '';
		let responseTextBuffer: any = '';
		// 追加正文增量。
		function appendContentDelta(deltaText?: any) {
			const contentDelta: any = readAssistantContent(deltaText);
			if (!contentDelta) {
				return;
			}
			message.content += contentDelta;
			if (onStreamDelta) {
				onStreamDelta({ type: 'content', text: contentDelta });
			}
		}
		// 追加推理增量。
		function appendReasoningDelta(deltaText?: any) {
			const reasoningDelta: any = normalizeReasoning(deltaText);
			if (!reasoningDelta) {
				return;
			}
			message.reasoning_content += reasoningDelta;
			if (onStreamDelta) {
				onStreamDelta({ type: 'reasoning', text: reasoningDelta });
			}
		}
		// 处理 chat/completions 增量块。
		function handleChatChunk(chunkObject?: any) {
			if (!chunkObject || !Array.isArray(chunkObject.choices) || !chunkObject.choices[0]) {
				return;
			}
			const choice: any = chunkObject.choices[0];
			const delta: any = choice.delta || choice.message || {};
			appendContentDelta(delta.content);
			appendReasoningDelta(delta.reasoning_content || delta.reasoning || delta.reasoningContent);
			if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
				mergeToolCallDelta(message.tool_calls, delta.tool_calls);
			}
		}
		// 处理 responses 增量块。
		function handleResponsesChunk(chunkObject?: any, eventType?: any) {
			if (!chunkObject || typeof chunkObject !== 'object') {
				return;
			}
			const normalizedEvent: any = String(eventType || chunkObject.type || '').trim();
			const responseToolCallDeltas: any = extractResponsesToolCallDeltas(chunkObject, normalizedEvent);
			if (responseToolCallDeltas.length > 0) {
				mergeToolCallDelta(message.tool_calls, responseToolCallDeltas);
			}
			const isOutputTextEvent: any = normalizedEvent.indexOf('response.output_text') === 0;
			const isReasoningEvent: any = normalizedEvent.indexOf('response.reasoning') === 0 || normalizedEvent.indexOf('response.reasoning_summary_text') === 0;
			if (normalizedEvent === 'response.completed') {
				if (message.tool_calls.length === 0 && responseToolCallDeltas.length > 0) {
					mergeToolCallDelta(message.tool_calls, responseToolCallDeltas);
				}
				const fullText: any = readResponsesOutputText(chunkObject);
				if (fullText && !message.content) {
					appendContentDelta(fullText);
				}
				return;
			}
			if (isOutputTextEvent) {
				appendContentDelta(chunkObject.delta || chunkObject.output_text || chunkObject.text);
			}
			if (isReasoningEvent) {
				appendReasoningDelta(chunkObject.delta || chunkObject.reasoning_content || chunkObject.reasoning || chunkObject.reasoningContent || chunkObject.summary || chunkObject.text);
			}
			const deltaObject: any = chunkObject.delta && typeof chunkObject.delta === 'object' ? chunkObject.delta : null;
			if (deltaObject) {
				if (!isOutputTextEvent && !isReasoningEvent) {
					appendContentDelta(deltaObject.content || deltaObject.output_text || deltaObject.text);
					appendReasoningDelta(deltaObject.reasoning_content || deltaObject.reasoning || deltaObject.reasoningContent || deltaObject.summary);
				}
			}
			if (message.tool_calls.length === 0 && responseToolCallDeltas.length > 0) {
				mergeToolCallDelta(message.tool_calls, responseToolCallDeltas);
			}
		}
		while (true) {
			const readResult: any = await reader.read();
			const done: any = readResult.done;
			const value: any = readResult.value;
			if (done) {
				break;
			}
			const decodedText: any = decoder.decode(value, { stream: true });
			responseTextBuffer += decodedText;
			buffer += decodedText.replace(/\r\n/g, '\n');
			let delimiterIndex: any = buffer.indexOf('\n\n');
			while (delimiterIndex >= 0) {
				const eventBlock: any = buffer.slice(0, delimiterIndex);
				buffer = buffer.slice(delimiterIndex + 2);
				delimiterIndex = buffer.indexOf('\n\n');
				const parsedEvent: any = parseSseEventBlock(eventBlock);
				if (!parsedEvent) {
					continue;
				}
				const eventType: any = parsedEvent.eventType;
				const payloadText: any = parsedEvent.payloadText;
				let chunkObject: any = null;
				try {
					chunkObject = JSON.parse(payloadText);
				}
				catch {
					chunkObject = null;
				}
				if (isResponsesEndpoint) {
					handleResponsesChunk(chunkObject, eventType);
				}
				else {
					handleChatChunk(chunkObject);
				}
			}
		}
		const remainText: any = decoder.decode();
		if (remainText) {
			responseTextBuffer += remainText;
			buffer += remainText.replace(/\r\n/g, '\n');
		}
		if (message.content || message.reasoning_content || message.tool_calls.length > 0) {
			return message;
		}
		if (!isResponsesEndpoint && responseTextBuffer.trim()) {
			let data: any = null;
			try {
				data = JSON.parse(responseTextBuffer);
			}
			catch {
				data = null;
			}
			if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
				const fallbackMessage: any = data.choices[0].message || {};
				return {
					role: 'assistant',
					content: readAssistantContent(fallbackMessage.content) || '',
					reasoning_content: readReasoningContent(fallbackMessage),
					tool_calls: Array.isArray(fallbackMessage.tool_calls) ? fallbackMessage.tool_calls : [],
				};
			}
		}
		throw new Error('模型流式返回为空。');
	}
	// 运行多轮代理流程。
	async function runAgent(config?: any, abortSignal?: any) {
		const processFoldGroupController: any = createProcessFoldGroupController();
		try {
			for (let step: any = 0; step < MAX_AGENT_STEPS; step += 1) {
				throwIfAgentAborted(abortSignal);
				let reasoningStreamMessage: any = null;
				let assistantStreamMessage: any = null;
				let hasReasoningStream: any = false;
				let hasAssistantStream: any = false;
				let reasoningFoldAutoCollapsed: any = false;
				startStreamIdleWatch();
				processFoldGroupController.setLoading(true);
				// 推理块自动折叠（仅触发一次）。
				const collapseReasoningFoldOnce: any = () => {
					if (!reasoningStreamMessage || reasoningFoldAutoCollapsed) {
						return;
					}
					reasoningStreamMessage.collapse();
					reasoningFoldAutoCollapsed = true;
				};
				const message: any = await callModel(config, (delta: any) => {
					if (!delta || !delta.type) {
						return;
					}
					const deltaType = delta.type;
					if (deltaType !== 'reasoning') {
						collapseReasoningFoldOnce();
					}
					if (deltaType === 'reasoning') {
						if (!delta.text) {
							return;
						}
						markStreamActive();
						hasReasoningStream = true;
						if (!reasoningStreamMessage) {
							reasoningStreamMessage = createAiStreamingMessage('reasoning');
							reasoningStreamMessage.setLoading(true);
							processFoldGroupController.appendProcessNode(reasoningStreamMessage.getNode());
						}
						processFoldGroupController.setLoading(true);
						reasoningStreamMessage.append(delta.text);
						return;
					}
					if (deltaType === 'content') {
						if (reasoningStreamMessage) {
							reasoningStreamMessage.setLoading(false);
						}
						if (!delta.text) {
							return;
						}
						processFoldGroupController.collapseOnContent();
						markStreamActive();
						hasAssistantStream = true;
						if (!assistantStreamMessage) {
							assistantStreamMessage = createAiStreamingMessage();
						}
						assistantStreamMessage.append(delta.text);
					}
				}, abortSignal);
				stopStreamIdleWatch();
				const rawAssistantContent: any = readAssistantContent(message.content);
				const thinkResult: any = splitThinkContent(rawAssistantContent);
				const assistantContent: any = thinkResult.cleanContent;
				const reasoningContent: any = readReasoningContent(message, thinkResult.reasoningText);
				if (reasoningStreamMessage) {
					reasoningStreamMessage.setLoading(false);
					processFoldGroupController.setLoading(false);
					if (reasoningContent) {
						reasoningStreamMessage.set(reasoningContent);
					}
					collapseReasoningFoldOnce();
				}
				else if (reasoningContent && !hasReasoningStream) {
					const reasoningMessageNode: any = appendMessage('ai', reasoningContent, 'reasoning');
					processFoldGroupController.appendProcessNode(reasoningMessageNode);
					collapseReasoningDetails(reasoningMessageNode);
				}
				if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
					if (abortSignal && abortSignal.aborted) {
						throw new DOMException('【诊断信息】用户已停止', 'AbortError');
					}
					agentMessages.push({
						role: 'assistant',
						content: assistantContent || rawAssistantContent,
						reasoning_content: reasoningContent || '',
						tool_calls: message.tool_calls,
					});
					sessionManager.schedulePersistChatSession();
					processFoldGroupController.setLoading(true);
					for (let index: any = 0; index < message.tool_calls.length; index += 1) {
						if (abortSignal && abortSignal.aborted) {
							throw new DOMException('【诊断信息】用户已停止', 'AbortError');
						}
						const toolCall: any = message.tool_calls[index];
						const toolName: any = toolCall && toolCall.function ? toolCall.function.name : '';
						const toolArgs: any = toolCall && toolCall.function ? toolCall.function.arguments : '';
						const toolCallId: any = toolCall && toolCall.id ? toolCall.id : (`tool-call-${Date.now()}-${index}`);
						const toolMessageNode: any = appendMessage('ai', formatToolExecRawText(toolCall, undefined, true), 'tool-exec');
						processFoldGroupController.appendProcessNode(toolMessageNode);
						setFoldLoadingState(toolMessageNode, true);
						let result: any = null;
						try {
							result = await executeToolWithTimeout(toolRuntime, toolName, toolArgs, TOOL_CALL_TIMEOUT_SECONDS);
						}
						finally {
							setFoldLoadingState(toolMessageNode, false);
						}
						setMessageContent(toolMessageNode, 'ai', formatToolExecRawText(toolCall, result, false), 'tool-exec');
						const hasOkFlag: any = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok');
						const errorText: any = String(result && result.error ? result.error : '无');
						const hasBooleanBusinessResult: any = result && typeof result === 'object' && typeof result.result === 'boolean';
						const isBusinessResultPassed: any = hasBooleanBusinessResult ? Boolean(result.result) : true;
						const isSuccess: any = hasOkFlag
							? (Boolean(result && result.ok) && isBusinessResultPassed)
							: !(errorText && errorText !== '无');
						setMessageFoldOpen(toolMessageNode, !isSuccess);
						agentMessages.push({
							role: 'tool',
							tool_call_id: toolCallId,
							name: toolName,
							content: safeJsonStringify(sanitizeToolResultForModel(result)),
						});
						sessionManager.schedulePersistChatSession();
					}
					processFoldGroupController.setLoading(false);
					hideRunningIndicator();
					continue;
				}
				agentMessages.push({
					role: 'assistant',
					content: assistantContent || rawAssistantContent,
					reasoning_content: reasoningContent || '',
				});
				sessionManager.schedulePersistChatSession();
				if (assistantStreamMessage) {
					processFoldGroupController.collapseOnContent();
					assistantStreamMessage.set(assistantContent || rawAssistantContent || '已完成。');
				}
				else if (!hasAssistantStream) {
					processFoldGroupController.collapseOnContent();
					appendMessage('ai', assistantContent || rawAssistantContent || '已完成。');
				}
				hideRunningIndicator();
				return;
			}
			hideRunningIndicator();
			appendMessage('ai', '本轮执行步骤达到上限，请细化需求后重试。');
		}
		finally {
			processFoldGroupController.finalize();
		}
	}
	// 处理发送按钮逻辑。
	async function handleSend() {
		if (isSending) {
			return;
		}
		if (isRestoringSession) {
			return;
		}
		const userText: any = String(readChatInputText()).trim();
		const selectedImages: any = cloneImageEntries(pendingImageEntries);
		if (!userText && selectedImages.length === 0) {
			return;
		}
		const config: any = readConfig(STORAGE_KEY);
		if (!config) {
			appendMessage('ai', '未检测到可用配置，请先在“设置”中保存 API Key。');
			return;
		}
		const selectedModel: any = (modelSelect ? String(modelSelect.value || '') : '') || readModelSelection(MODEL_SELECTION_KEY);
		if (!selectedModel) {
			appendMessage('ai', '未选择模型，请先在模型下拉框中选择。');
			return;
		}
		if (!isImageUploadEnabled(selectedModel) && selectedImages.length > 0) {
			selectedImages.length = 0;
		}
		const modelConfig: any = resolveModelConfig(MODEL_CONFIG_MAP, selectedModel);
		if (!modelConfig) {
			appendMessage('ai', `模型配置无效：${selectedModel}。请在设置中修正后重试。`);
			return;
		}
		const apiKey: any = String(config[modelConfig.keyField] || '').trim();
		if (!apiKey) {
			showEdaToastMessage(window, `未检测到可用的 ${modelConfig.platformLabel} API Key，请先在“设置”中配置。`, messageType.warning);
			return;
		}
		const endpoint: any = String(config[modelConfig.endpointField] || '').trim();
		if (!endpoint) {
			appendMessage('ai', `${modelConfig.platformLabel} 请求 URL 未配置，请先在“设置”中填写。`);
			return;
		}
		const modelName: any = String(config[modelConfig.modelField] || '').trim();
		if (!modelName) {
			appendMessage('ai', `${modelConfig.platformLabel} 模型名称未配置，请先在“设置”中填写。`);
			return;
		}
		config.model = modelName;
		config.apiUrl = endpoint;
		config.apiKey = apiKey;
		config.selectedModel = selectedModel;
		const roundModelText: any = buildRoundModelText(modelName);
		const sessionPrepareResult: any = sessionManager.ensureActiveChatSessionForUserMessage(userText);
		if (sessionPrepareResult && (sessionPrepareResult.created || sessionPrepareResult.titleUpdated)) {
			renderChatSessionDropdownOptions();
			requestAsyncSessionTitleRefresh({
				sessionId: sessionPrepareResult.sessionId,
				userText,
				endpoint,
				apiKey,
				modelName,
			});
		}
		if (hasCompletedRound && chatDisplayMessages.length > 0) {
			appendMessage('ai', 'round-separator', 'round-separator');
		}
		hasCompletedRound = false;
		appendMessage('user', {
			text: userText,
			images: selectedImages,
		});
		forceScrollChatHistoryToBottom();
		writeChatInputText('');
		adjustChatInputHeight();
		updateSendButtonState();
		clearPendingImageEntries();
		const userMessageContent: any = buildUserMessageContentForApi(userText, selectedImages, resolveImagePayloadMode(selectedModel));
		agentMessages.push({
			role: 'user',
			content: userMessageContent,
		});
		sessionManager.schedulePersistChatSession();
		activeAbortController = new AbortController();
		setSending(true);
		showRunningIndicator();
		let roundCompleted: any = false;
		try {
			await runAgent(config, activeAbortController.signal);
			roundCompleted = true;
		}
		catch (error: any) {
			stopStreamIdleWatch();
			hideRunningIndicator();
			if (isAbortError(error)) {
				appendMessage('ai', '已停止。');
				roundCompleted = true;
			}
			else {
				const message: any = error && error.message ? String(error.message) : '请求失败';
				appendMessage('ai', `执行失败：${message}`);
				roundCompleted = true;
			}
		}
		finally {
			if (roundCompleted) {
				appendMessage('ai', roundModelText, 'round-model');
				hasCompletedRound = true;
			}
			sessionManager.persistChatSessionNow();
			renderChatSessionDropdownOptions();
			clearFoldLoadingIndicators();
			setSending(false);
			if (chatEditor) {
				chatEditor.focus();
			}
		}
	}
	sendButton.addEventListener('click', () => {
		if (isSending) {
			stopCurrentRun();
			return;
		}
		handleSend();
	});
	if (chatTextareaScroll) {
		chatInputOverlayScrollbar = OverlayScrollbars(chatTextareaScroll, {
			overflow: {
				x: 'hidden',
				y: 'scroll',
			},
			scrollbars: {
				theme: OVERLAY_SCROLLBAR_THEME_CLASS,
				autoHide: 'move',
				autoHideDelay: SCROLLBAR_AUTO_HIDE_DELAY,
				clickScroll: true,
			},
		});
	}
	if (chatEditor) {
		chatEditor.addEventListener('keydown', (event?: any) => {
			if (event.key === 'Enter' && !event.shiftKey && !isSending) {
				event.preventDefault();
				handleSend();
			}
		});
	}
	// 自适应调整输入框高度。
	function adjustChatInputHeight() {
		if (!chatEditor || !chatTextareaScroll) {
			return;
		}
		const computedStyle: any = window.getComputedStyle(chatEditor);
		const lineHeightValue: any = Number.parseFloat(String(computedStyle.lineHeight || ''));
		const lineHeightPx: any = Number.isFinite(lineHeightValue) && lineHeightValue > 0 ? lineHeightValue : 20;
		const paddingTop: any = Number.parseFloat(String(computedStyle.paddingTop || '')) || 0;
		const paddingBottom: any = Number.parseFloat(String(computedStyle.paddingBottom || '')) || 0;
		const minHeight: any = Math.max(24, Math.ceil(lineHeightPx + paddingTop + paddingBottom));
		const maxHeight: any = Math.max(minHeight, Math.ceil((lineHeightPx * CHAT_INPUT_MAX_VISIBLE_LINES) + paddingTop + paddingBottom));
		chatTextareaScroll.style.height = 'auto';
		const contentHeight: any = Math.max(minHeight, Number(chatEditor.scrollHeight) || minHeight);
		const nextHeight: any = Math.min(maxHeight, contentHeight);
		chatTextareaScroll.style.height = `${String(nextHeight)}px`;
		refreshChatInputOverlayScrollbar();
	}
	if (chatEditor) {
		chatEditor.addEventListener('input', (event?: any) => {
			const inputTypeText: any = event && event.inputType ? String(event.inputType) : '';
			const isLineBreakInput: any = inputTypeText === 'insertParagraph' || inputTypeText === 'insertLineBreak';
			const shouldStickToBottom: any = isLineBreakInput || isChatSelectionAtEnd();
			adjustChatInputHeight();
			if (shouldStickToBottom) {
				scheduleChatInputViewportStickToBottom();
			}
			updateSendButtonState();
		});
	}
	window.setTimeout(() => {
		adjustChatInputHeight();
		updateSendButtonState();
	}, 0);
	renderImageAttachmentList();
	if (chatInputBox && chatEditor) {
		chatInputBox.addEventListener('click', (event?: any) => {
			const target: any = event && event.target ? event.target : null;
			const interactiveElement: any = target && target.closest ? target.closest('button, input, select, [contenteditable]') : null;
			if (!interactiveElement || interactiveElement === chatEditor) {
				chatEditor.focus();
			}
		});
	}
	if (imageUploadButton && imageUploadInput) {
		imageUploadButton.addEventListener('click', () => {
			const selectedModel: any = getSelectedModelValue();
			if (!isImageUploadEnabled(selectedModel)) {
				if (String(selectedModel || '').trim() === 'deepseek') {
					showEdaToastMessage(window, 'DeepSeek 不支持图片上传。', messageType.error);
				}
				return;
			}
			imageUploadInput.click();
		});
		imageUploadInput.addEventListener('change', async (event?: any) => {
			if (!isImageUploadEnabled(getSelectedModelValue())) {
				imageUploadInput.value = '';
				return;
			}
			const target: any = event.target;
			const fileList: any = target && target.files ? Array.from(target.files) : [];
			await addPendingImages(fileList, 'file');
			imageUploadInput.value = '';
		});
	}
	if (chatSessionAddButton) {
		chatSessionAddButton.addEventListener('click', () => {
			if (isSending || isRestoringSession) {
				return;
			}
			if (!sessionManager.hasAnyChatSession()) {
				return;
			}
			sessionManager.createAndActivateChatSession(CHAT_SESSION_DEFAULT_TITLE);
			hasCompletedRound = false;
			clearPendingImageEntries();
			writeChatInputText('');
			adjustChatInputHeight();
			renderChatSessionDropdownOptions();
			syncChatEmptyStateVisibility();
			updateSendButtonState();
			if (chatEditor) {
				chatEditor.focus();
			}
		});
	}
	if (chatSessionDeleteButton) {
		chatSessionDeleteButton.addEventListener('click', () => {
			if (isSending || isRestoringSession || !sessionManager.hasAnyChatSession() || !sessionManager.getActiveChatSessionId()) {
				return;
			}
			isRestoringSession = sessionManager.deleteActiveChatSession();
			hasCompletedRound = false;
			clearPendingImageEntries();
			writeChatInputText('');
			adjustChatInputHeight();
			renderChatSessionDropdownOptions();
			if (!isRestoringSession) {
				syncChatEmptyStateVisibility();
				updateSendButtonState();
			}
			if (chatEditor) {
				chatEditor.focus();
			}
		});
	}
	if (chatSessionDropdownMenu) {
		chatSessionDropdownMenu.addEventListener('click', (event?: any) => {
			const targetNode: any = event && event.target ? event.target : null;
			const optionElement: any = targetNode && targetNode.closest ? targetNode.closest('.chat-sesson-option') : null;
			if (!optionElement || !chatSessionDropdownMenu.contains(optionElement)) {
				return;
			}
			event.preventDefault();
			if (isSending || isRestoringSession) {
				closeChatSessionDropdown();
				return;
			}
			const sessionId: any = String(optionElement.getAttribute('data-session-id') || '').trim();
			if (!sessionId) {
				closeChatSessionDropdown();
				return;
			}
			isRestoringSession = sessionManager.switchActiveChatSession(sessionId);
			hasCompletedRound = false;
			clearPendingImageEntries();
			writeChatInputText('');
			adjustChatInputHeight();
			renderChatSessionDropdownOptions();
			if (!isRestoringSession) {
				syncChatEmptyStateVisibility();
				updateSendButtonState();
			}
			closeChatSessionDropdown();
		});
	}
	document.addEventListener('click', (event?: any) => {
		if (!chatSessionDropdown) {
			return;
		}
		const targetNode: any = event && event.target ? event.target : null;
		if (targetNode && chatSessionDropdown.contains(targetNode)) {
			return;
		}
		closeChatSessionDropdown();
	});
	document.addEventListener('paste', async (event?: any) => {
		const clipboardData: any = event.clipboardData;
		if (!clipboardData) {
			return;
		}
		const imageFiles: any = collectClipboardImageFiles(clipboardData);
		if (imageFiles.length === 0) {
			return;
		}
		const selectedModel: any = getSelectedModelValue();
		if (!isImageUploadEnabled(selectedModel)) {
			event.preventDefault();
			if (String(selectedModel || '').trim() === 'deepseek') {
				showEdaToastMessage(window, 'DeepSeek 不支持图片上传。', messageType.error);
			}
			return;
		}
		event.preventDefault();
		await addPendingImages(imageFiles, 'paste');
	});
	document.addEventListener('keydown', (event?: any) => {
		if (!event || event.key !== 'Escape') {
			return;
		}
		event.preventDefault();
		closeIFramePageById(IFRAME_ID);
	});
	if (modelSelect) {
		renderModelSelectOptionsByPlatformConfig();
		const savedModel: any = readModelSelection(MODEL_SELECTION_KEY);
		modelSelect.value = savedModel;
		if (!savedModel || !modelSelect.value) {
			modelSelect.selectedIndex = -1;
		}
		renderModelSelectMenu();
		syncModelSelectTrigger();
		adjustModelSelectWidth();
		updateImageUploadAvailability(modelSelect.value);
		modelSelect.addEventListener('change', () => {
			persistModelSelection(MODEL_SELECTION_KEY, modelSelect.value);
			renderModelSelectMenu();
			syncModelSelectTrigger();
			adjustModelSelectWidth();
			updateImageUploadAvailability(modelSelect.value);
		});
		if (modelSelectTrigger) {
			modelSelectTrigger.addEventListener('click', (event?: any) => {
				event.stopPropagation();
				if (modelSelectControl && modelSelectControl.classList.contains('open')) {
					closeModelSelectMenu();
				}
				else {
					openModelSelectMenu();
				}
			});
		}
		if (modelSelectMenu) {
			modelSelectMenu.addEventListener('click', (event?: any) => {
				event.stopPropagation();
			});
		}
		document.addEventListener('click', (event?: any) => {
			if (!modelSelectControl) {
				return;
			}
			const targetNode: any = event.target;
			if (targetNode && modelSelectControl.contains(targetNode)) {
				return;
			}
			closeModelSelectMenu();
		});
		window.addEventListener('resize', () => {
			adjustModelSelectWidth();
			closeModelSelectMenu();
		});
	}
	else {
		updateImageUploadAvailability(readModelSelection(MODEL_SELECTION_KEY));
	}
	window.addEventListener('beforeunload', () => {
		sessionManager.persistChatSessionNow();
	});
	setupThemeSync(applyTheme);
	isRestoringSession = sessionManager.restoreChatSessionFromStorage();
	renderChatSessionDropdownOptions();
	if (!isRestoringSession) {
		if (chatHistoryMessageContainer) {
			chatHistoryMessageContainer.innerHTML = '';
		}
		syncChatEmptyStateVisibility();
	}
	hasCompletedRound = false;
	updateSendButtonState();
	updateChatSessionActionButtonState();
	if (chatEditor) {
		window.setTimeout(() => {
			if (chatEditor) {
				chatEditor.focus();
			}
		}, 500);
	}
})();
