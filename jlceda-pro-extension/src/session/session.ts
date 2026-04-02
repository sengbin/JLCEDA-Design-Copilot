// 文件说明：提供聊天会话持久化、恢复与会话切换相关能力。
/**
 * 会话管理器初始化参数。
 */
export interface ChatSessionManagerOptions {
	/** 本地存储键名。 */
	storageKey: string;
	/** 持久化消息最大条数。 */
	maxMessages: number;
	/** 默认会话标题。 */
	defaultSessionTitle?: string;
	/** 运行时窗口对象。 */
	runtimeWindow: Window;
	/** 聊天历史容器。 */
	chatHistory: HTMLElement | null;
	/** 上下文消息数组引用。 */
	agentMessages: Array<Record<string, unknown>>;
	/** 显示消息数组引用。 */
	chatDisplayMessages: Array<Record<string, unknown>>;
	/** 图片条目克隆函数。 */
	cloneImageEntries: (entries: unknown) => Array<Record<string, unknown>>;
	/** 安全 JSON 序列化函数。 */
	safeJsonStringify: (value: unknown) => string;
	/** 聊天内容标准化函数。 */
	normalizeMessageContentForChat: (content: unknown, allowImagePart: boolean) => unknown;
	/** 推理内容读取函数。 */
	readReasoningContent: (message: unknown) => string;
	/** 消息追加函数。 */
	appendMessage: (role: string, text: unknown, variant?: string) => unknown;
	/** 聊天区滚动同步函数。 */
	scrollChatHistoryIfAllowed: () => void;
	/** 恢复完成后回调。 */
	onAfterRestore: () => void;
	/** EDA API 解析函数。 */
	resolveApiMemberInAnyRoot: (apiPath: string) => {
		context?: unknown;
		value?: unknown;
	} | null;
	/** 运行提示隐藏函数。 */
	hideRunningIndicator: () => void;
	/** 清空运行时渲染数据回调（清空虚拟列表 store 等）。 */
	onClearRuntimeData?: () => void;
}
/**
 * 会话管理器对外能力。
 */
export interface ChatSessionManager {
	/**
	 * 读取会话摘要列表。
	 * @returns 会话摘要数组。
	 */
	listChatSessions: () => Array<{
		id: string;
		title: string;
		updatedAt: number;
	}>;
	/**
	 * 是否存在任意会话。
	 * @returns 是否存在。
	 */
	hasAnyChatSession: () => boolean;
	/**
	 * 读取当前激活会话 ID。
	 * @returns 会话 ID。
	 */
	getActiveChatSessionId: () => string;
	/**
	 * 创建并激活一个空会话。
	 * @param title - 会话标题。
	 * @returns 新会话摘要。
	 */
	createAndActivateChatSession: (title?: string) => {
		id: string;
		title: string;
		updatedAt: number;
	};
	/**
	 * 切换到指定会话。
	 * @param sessionId - 目标会话 ID。
	 * @returns 是否已启动异步恢复。
	 */
	switchActiveChatSession: (sessionId: string) => boolean;
	/**
	 * 删除当前激活会话。
	 * @returns 是否已启动异步恢复。
	 */
	deleteActiveChatSession: () => boolean;
	/**
	 * 发送前确保存在激活会话，并按用户首条消息更新会话标题。
	 * @param userText - 用户输入文本。
	 * @returns 会话准备结果。
	 */
	ensureActiveChatSessionForUserMessage: (userText: string) => {
		sessionId: string;
		title: string;
		created: boolean;
		titleUpdated: boolean;
	};
	/**
	 * 按会话 ID 更新会话标题。
	 * @param sessionId - 目标会话 ID。
	 * @param nextTitle - 新标题。
	 * @returns 是否更新成功。
	 */
	updateChatSessionTitleById: (sessionId: string, nextTitle: string) => boolean;
	/**
	 * 写入一条显示消息记录。
	 * @param role - 角色。
	 * @param text - 文本。
	 * @param variant - 变体。
	 * @returns 记录索引。
	 */
	pushDisplayMessageRecord: (role: unknown, text: unknown, variant: unknown) => number;
	/**
	 * 根据消息节点同步显示记录。
	 * @param messageNode - 消息节点。
	 * @param role - 角色。
	 * @param text - 文本。
	 * @param variant - 变体。
	 */
	syncDisplayRecordByMessageNode: (messageNode: unknown, role: unknown, text: unknown, variant: unknown) => void;
	/**
	 * 按消息节点写入过程分组标题。
	 * @param messageNode - 消息节点。
	 * @param title - 标题文本。
	 */
	setProcessTitleByNode: (messageNode: unknown, title: string) => void;
	/**
	 * 按消息节点读取过程分组标题。
	 * @param messageNode - 消息节点。
	 * @returns 标题文本。
	 */
	getProcessTitleByNode: (messageNode: unknown) => string;
	/** 节流写入会话。 */
	schedulePersistChatSession: () => void;
	/** 立即写入会话。 */
	persistChatSessionNow: () => void;
	/** 清除持久化会话。 */
	clearPersistedChatSession: () => void;
	/**
	 * 从本地恢复会话（分批异步恢复）。
	 * @returns 是否已启动恢复任务。
	 */
	restoreChatSessionFromStorage: () => boolean;
	/**
	 * 弹出删除会话确认对话框。
	 * @returns 是否确认。
	 */
	requestDeleteSessionConfirmation: () => Promise<boolean>;
	/** 清空聊天历史与上下文。 */
	clearChatHistoryAndContext: () => void;
}
/**
 * 创建聊天会话管理器。
 * @param options - 初始化参数。
 * @returns 会话管理器。
 */
export function createChatSessionManager(options: ChatSessionManagerOptions): ChatSessionManager {
	const storageKey: any = String(options && options.storageKey ? options.storageKey : '').trim();
	const maxMessages: any = Math.max(1, Number(options && options.maxMessages ? options.maxMessages : 120) || 120);
	const defaultSessionTitle: any = String(options && options.defaultSessionTitle ? options.defaultSessionTitle : '新对话').trim() || '新对话';
	const runtimeWindow: any = options && options.runtimeWindow ? options.runtimeWindow : window;
	const chatHistory: any = options && options.chatHistory ? options.chatHistory : null;
	const agentMessages: any = Array.isArray(options && options.agentMessages) ? options.agentMessages : [];
	const chatDisplayMessages: any = Array.isArray(options && options.chatDisplayMessages) ? options.chatDisplayMessages : [];
	const cloneImageEntries: any = options && typeof options.cloneImageEntries === 'function'
		? options.cloneImageEntries
		: () => [];
	const safeJsonStringify: any = options && typeof options.safeJsonStringify === 'function'
		? options.safeJsonStringify
		: (value: unknown) => JSON.stringify(value);
	const normalizeMessageContentForChat: any = options && typeof options.normalizeMessageContentForChat === 'function'
		? options.normalizeMessageContentForChat
		: (content: unknown) => String(content || '').trim();
	const readReasoningContent: any = options && typeof options.readReasoningContent === 'function'
		? options.readReasoningContent
		: () => '';
	const appendMessage: any = options && typeof options.appendMessage === 'function'
		? options.appendMessage
		: () => null;
	const scrollChatHistoryIfAllowed: any = options && typeof options.scrollChatHistoryIfAllowed === 'function'
		? options.scrollChatHistoryIfAllowed
		: () => { };
	const onAfterRestore: any = options && typeof options.onAfterRestore === 'function'
		? options.onAfterRestore
		: () => { };
	const resolveApiMemberInAnyRoot: any = options && typeof options.resolveApiMemberInAnyRoot === 'function'
		? options.resolveApiMemberInAnyRoot
		: () => null;
	const hideRunningIndicator: any = options && typeof options.hideRunningIndicator === 'function'
		? options.hideRunningIndicator
		: () => { };
	let isRestoringChatHistory: any = false;
	let chatSessionPersistTimerId: any = 0;
	let restoreBatchTimerId: any = 0;
	let restoreTaskId: any = 0;
	const RESTORE_RENDER_BATCH_SIZE: any = 4;
	interface PersistedSessionRecord {
		id: string;
		title: string;
		createdAt: number;
		updatedAt: number;
		displayMessages: Array<Record<string, unknown>>;
		agentMessages: Array<Record<string, unknown>>;
	}
	const chatSessions: Array<PersistedSessionRecord> = [];
	let activeSessionId: any = '';
	// 生成会话唯一 ID。
	function createSessionId(): string {
		return `chat-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}
	// 规范化会话标题。
	function normalizeSessionTitle(title: unknown): string {
		const normalizedTitle: any = String(title || '').replace(/\s+/g, ' ').trim();
		return normalizedTitle || defaultSessionTitle;
	}
	// 从用户输入中提取会话标题。
	function deriveSessionTitleFromUserText(userText: unknown): string {
		const normalized: any = String(userText || '').replace(/\r\n/g, '\n');
		const lineList: any = normalized
			.split('\n')
			.map((line: any) => line.trim())
			.filter((line: any) => !!line);
		if (lineList.length === 0) {
			return defaultSessionTitle;
		}
		const firstLine: any = lineList[0];
		if (firstLine.length <= 18) {
			return firstLine;
		}
		return `${firstLine.slice(0, 18).trim()}...`;
	}
	// 复制会话摘要供外部展示。
	function cloneSessionSummary(record: PersistedSessionRecord): {
		id: string;
		title: string;
		updatedAt: number;
	} {
		return {
			id: String(record && record.id ? record.id : ''),
			title: normalizeSessionTitle(record && record.title),
			updatedAt: Number(record && record.updatedAt ? record.updatedAt : 0) || Date.now(),
		};
	}
	// 查询会话索引。
	function findSessionIndexById(sessionId: unknown): number {
		const targetId: any = String(sessionId || '').trim();
		if (!targetId) {
			return -1;
		}
		for (let index: any = 0; index < chatSessions.length; index += 1) {
			if (String(chatSessions[index].id || '').trim() === targetId) {
				return index;
			}
		}
		return -1;
	}
	// 读取当前激活会话对象。
	function readActiveSessionRecord(): PersistedSessionRecord | null {
		const activeIndex: any = findSessionIndexById(activeSessionId);
		if (activeIndex < 0) {
			return null;
		}
		return chatSessions[activeIndex] || null;
	}
	// 将会话移动到列表首位。
	function moveSessionToTop(sessionId: string): void {
		const sessionIndex: any = findSessionIndexById(sessionId);
		if (sessionIndex <= 0) {
			return;
		}
		const target: any = chatSessions.splice(sessionIndex, 1)[0];
		chatSessions.unshift(target);
	}
	// 清空运行时消息与历史区。
	function clearRuntimeChatData(): void {
		cancelRestoreTask();
		hideRunningIndicator();
		if (chatHistory) {
			chatHistory.innerHTML = '';
		}
		if (options.onClearRuntimeData) {
			options.onClearRuntimeData();
		}
		chatDisplayMessages.length = 0;
		agentMessages.length = 0;
	}
	// 规范化展示消息数组。
	function normalizeDisplayMessagesForStorage(input: unknown): Array<Record<string, unknown>> {
		const source: any = Array.isArray(input) ? input : [];
		const output: Array<Record<string, unknown>> = [];
		for (let index: any = 0; index < source.length; index += 1) {
			const item: any = source[index];
			if (!item || typeof item !== 'object') {
				continue;
			}
			const role: any = String((item as Record<string, unknown>).role || '').trim() === 'user' ? 'user' : 'ai';
			const text: any = String((item as Record<string, unknown>).text || '').trim();
			const variant: any = String((item as Record<string, unknown>).variant || '').trim();
			if (!text && !variant) {
				continue;
			}
			const processTitle: any = String((item as Record<string, unknown>).processTitle || '').trim();
			const record: Record<string, unknown> = { role, text, variant };
			if (processTitle) {
				record.processTitle = processTitle;
			}
			output.push(record);
		}
		return output.slice(-maxMessages);
	}
	// 规范化上下文消息数组。
	function normalizeAgentMessagesForStorage(input: unknown): Array<Record<string, unknown>> {
		const source: any = Array.isArray(input) ? input : [];
		const output: Array<Record<string, unknown>> = [];
		for (let index: any = 0; index < source.length; index += 1) {
			const item: any = source[index];
			if (!item || typeof item !== 'object') {
				continue;
			}
			const role: any = String((item as Record<string, unknown>).role || '').trim();
			if (role !== 'user' && role !== 'assistant') {
				continue;
			}
			const normalizedItem: Record<string, unknown> = {
				role,
				content: String((item as Record<string, unknown>).content || '').trim(),
			};
			if (role === 'assistant') {
				normalizedItem.reasoning_content = String((item as Record<string, unknown>).reasoning_content || '').trim();
			}
			output.push(normalizedItem);
		}
		return output.slice(-maxMessages);
	}
	// 基于当前运行时消息更新激活会话快照。
	function syncActiveSessionSnapshotFromRuntime(): void {
		if (!activeSessionId) {
			return;
		}
		let activeRecord: any = readActiveSessionRecord();
		if (!activeRecord) {
			activeRecord = {
				id: activeSessionId,
				title: defaultSessionTitle,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				displayMessages: [],
				agentMessages: [],
			};
			chatSessions.unshift(activeRecord);
		}
		activeRecord.displayMessages = normalizeDisplayMessagesForStorage(chatDisplayMessages);
		activeRecord.agentMessages = buildPersistedAgentMessagesSnapshot();
		activeRecord.updatedAt = Date.now();
		moveSessionToTop(activeRecord.id);
	}
	// 将当前会话集合持久化到本地。
	function persistAllSessionsNow(): void {
		if (!storageKey) {
			return;
		}
		if (chatSessions.length === 0) {
			try {
				runtimeWindow.localStorage.removeItem(storageKey);
			}
			catch { }
			return;
		}
		const payload: any = {
			version: 2,
			activeSessionId,
			sessions: chatSessions.map((record) => {
				return {
					id: String(record && record.id ? record.id : ''),
					title: normalizeSessionTitle(record && record.title),
					createdAt: Number(record && record.createdAt ? record.createdAt : Date.now()) || Date.now(),
					updatedAt: Number(record && record.updatedAt ? record.updatedAt : Date.now()) || Date.now(),
					displayMessages: normalizeDisplayMessagesForStorage(record && record.displayMessages),
					agentMessages: normalizeAgentMessagesForStorage(record && record.agentMessages),
				};
			}),
		};
		try {
			runtimeWindow.localStorage.setItem(storageKey, safeJsonStringify(payload));
		}
		catch { }
	}
	// 创建会话记录对象。
	function createSessionRecord(title: unknown): PersistedSessionRecord {
		const now: any = Date.now();
		return {
			id: createSessionId(),
			title: normalizeSessionTitle(title),
			createdAt: now,
			updatedAt: now,
			displayMessages: [],
			agentMessages: [],
		};
	}
	// 清理会话恢复分批定时器。
	function clearRestoreBatchTimer(): void {
		if (!restoreBatchTimerId) {
			return;
		}
		runtimeWindow.clearTimeout(restoreBatchTimerId);
		restoreBatchTimerId = 0;
	}
	// 取消当前正在进行的会话恢复任务。
	function cancelRestoreTask(): void {
		clearRestoreBatchTimer();
		restoreTaskId += 1;
		isRestoringChatHistory = false;
	}
	// 将消息内容规整为可持久化文本。
	function normalizeDisplayMessageText(role: unknown, text: unknown): string {
		const normalizedRole: any = String(role || '').trim();
		if (normalizedRole === 'user' && text && typeof text === 'object' && !Array.isArray(text)) {
			const payloadText: any = String((text as Record<string, unknown>).text || '').trim();
			const payloadImages: any = cloneImageEntries((text as Record<string, unknown>).images);
			const payloadDocs: any = Array.isArray((text as Record<string, unknown>).documents)
				? ((text as Record<string, unknown>).documents as Array<Record<string, unknown>>).filter((item: any) => item && typeof item.name === 'string')
				: [];
			if (payloadImages.length === 0 && payloadDocs.length === 0) {
				return payloadText;
			}
			const imageLines: any = payloadImages.map((item: any) => {
				const imageName = String(item && item.name ? item.name : '').trim();
				return `[图片]${imageName ? (` ${imageName}`) : ''}`;
			});
			const docLines: any = payloadDocs.map((item: any) => {
				const docName = String(item && item.name ? item.name : '').trim();
				return `[文档]${docName ? (` ${docName}`) : ''}`;
			});
			return [payloadText].concat(imageLines).concat(docLines).filter((lineText?: any) => {
				return !!String(lineText || '').trim();
			}).join('\n');
		}
		return String(text || '').trim();
	}
	// 更新指定索引的可持久化显示消息记录。
	function updateDisplayMessageRecord(index: number, role: unknown, text: unknown, variant: unknown): void {
		if (!Number.isFinite(index) || index < 0 || index >= chatDisplayMessages.length) {
			return;
		}
		const normalizedRole: any = String(role || '').trim() === 'user' ? 'user' : 'ai';
		// 保留已写入的 processTitle，避免文本更新时覆盖掉该字段。
		const existingProcessTitle: any = String((chatDisplayMessages[index] as Record<string, unknown>).processTitle || '').trim();
		chatDisplayMessages[index] = {
			role: normalizedRole,
			variant: String(variant || '').trim(),
			text: normalizeDisplayMessageText(normalizedRole, text),
		};
		if (existingProcessTitle) {
			(chatDisplayMessages[index] as Record<string, unknown>).processTitle = existingProcessTitle;
		}
	}
	// 构建可持久化的上下文消息快照。
	function buildPersistedAgentMessagesSnapshot(): Array<Record<string, unknown>> {
		const output: Array<Record<string, unknown>> = [];
		const startIndex: any = Math.max(0, agentMessages.length - maxMessages);
		for (let index: any = startIndex; index < agentMessages.length; index += 1) {
			const item: any = agentMessages[index];
			if (!item || (item.role !== 'user' && item.role !== 'assistant')) {
				continue;
			}
			const normalizedContent: any = normalizeMessageContentForChat(item.content, false);
			const contentText: any = String(normalizedContent || '').trim();
			const messageItem: Record<string, unknown> = {
				role: item.role,
				content: contentText,
			};
			if (item.role === 'assistant') {
				const reasoningText: any = readReasoningContent(item);
				if (reasoningText) {
					messageItem.reasoning_content = reasoningText;
				}
			}
			if (contentText || messageItem.reasoning_content) {
				output.push(messageItem);
			}
		}
		return output;
	}
	// 解析可用的 EDA 确认对话框 API。
	function resolveEdaConfirmationDialogApi(): {
		context?: unknown;
		value?: unknown;
	} | null {
		const dialogApi: any = resolveApiMemberInAnyRoot('sys_Dialog.showConfirmationMessage');
		if (dialogApi && typeof dialogApi.value === 'function') {
			return dialogApi;
		}
		const messageBoxApi: any = resolveApiMemberInAnyRoot('sys_MessageBox.showConfirmationMessage');
		if (messageBoxApi && typeof messageBoxApi.value === 'function') {
			return messageBoxApi;
		}
		return null;
	}
	function pushDisplayMessageRecord(role: unknown, text: unknown, variant: unknown): number {
		const normalizedRole: any = String(role || '').trim() === 'user' ? 'user' : 'ai';
		chatDisplayMessages.push({
			role: normalizedRole,
			variant: String(variant || '').trim(),
			text: normalizeDisplayMessageText(normalizedRole, text),
		});
		return chatDisplayMessages.length - 1;
	}
	function listChatSessions(): Array<{
		id: string;
		title: string;
		updatedAt: number;
	}> {
		return chatSessions.map((record?: any) => cloneSessionSummary(record));
	}
	function hasAnyChatSession(): boolean {
		return chatSessions.length > 0;
	}
	function getActiveChatSessionId(): string {
		return String(activeSessionId || '');
	}
	function schedulePersistChatSession(): void {
		if (isRestoringChatHistory || chatSessionPersistTimerId) {
			return;
		}
		chatSessionPersistTimerId = runtimeWindow.setTimeout(() => {
			chatSessionPersistTimerId = 0;
			persistChatSessionNow();
		}, 100);
	}
	function clearPersistedChatSession(): void {
		if (chatSessionPersistTimerId) {
			runtimeWindow.clearTimeout(chatSessionPersistTimerId);
			chatSessionPersistTimerId = 0;
		}
		chatSessions.length = 0;
		activeSessionId = '';
		persistAllSessionsNow();
	}
	function persistChatSessionNow(): void {
		if (isRestoringChatHistory || !storageKey) {
			return;
		}
		syncActiveSessionSnapshotFromRuntime();
		persistAllSessionsNow();
	}
	function syncDisplayRecordByMessageNode(messageNode: unknown, role: unknown, text: unknown, variant: unknown): void {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const indexText: any = String(messageNode.getAttribute('data-display-index') || '').trim();
		if (!indexText) {
			return;
		}
		const indexValue: any = Number(indexText);
		if (!Number.isFinite(indexValue) || indexValue < 0) {
			return;
		}
		updateDisplayMessageRecord(indexValue, role, text, variant);
		if (!isRestoringChatHistory) {
			schedulePersistChatSession();
		}
	}
	// 写入过程分组标题到消息节点对应的显示记录。
	function setProcessTitleByNode(messageNode: unknown, title: unknown): void {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return;
		}
		const indexText: any = String(messageNode.getAttribute('data-display-index') || '').trim();
		if (!indexText) {
			return;
		}
		const indexValue: any = Number(indexText);
		if (!Number.isFinite(indexValue) || indexValue < 0 || indexValue >= chatDisplayMessages.length) {
			return;
		}
		const newTitle: any = String(title || '').trim();
		const currentTitle: any = String((chatDisplayMessages[indexValue] as Record<string, unknown>).processTitle || '').trim();
		if (newTitle === currentTitle) {
			return;
		}
		(chatDisplayMessages[indexValue] as Record<string, unknown>).processTitle = newTitle;
		if (!isRestoringChatHistory) {
			schedulePersistChatSession();
		}
	}
	// 读取消息节点对应的过程分组标题。
	function getProcessTitleByNode(messageNode: unknown): string {
		if (!messageNode || !(messageNode instanceof HTMLElement)) {
			return '';
		}
		const indexText: any = String(messageNode.getAttribute('data-display-index') || '').trim();
		if (!indexText) {
			return '';
		}
		const indexValue: any = Number(indexText);
		if (!Number.isFinite(indexValue) || indexValue < 0 || indexValue >= chatDisplayMessages.length) {
			return '';
		}
		return String((chatDisplayMessages[indexValue] as Record<string, unknown>).processTitle || '').trim();
	}
	// 将指定会话恢复到运行时消息与页面。
	function restoreSessionRecordToRuntime(sessionRecord: PersistedSessionRecord | null): boolean {
		if (!sessionRecord) {
			return false;
		}
		const normalizedDisplayMessages: any = normalizeDisplayMessagesForStorage(sessionRecord.displayMessages)
			.map((item) => {
				return {
					role: String(item && item.role ? item.role : 'ai') === 'user' ? 'user' : 'ai',
					text: String(item && item.text ? item.text : '').trim(),
					variant: String(item && item.variant ? item.variant : '').trim(),
					processTitle: String(item && item.processTitle ? item.processTitle : '').trim(),
				};
			})
			.filter((item) => {
				return !!item.text || !!item.variant;
			});
		const normalizedAgentMessages: any = normalizeAgentMessagesForStorage(sessionRecord.agentMessages);
		cancelRestoreTask();
		const currentRestoreTaskId: any = restoreTaskId + 1;
		restoreTaskId = currentRestoreTaskId;
		isRestoringChatHistory = true;
		chatDisplayMessages.length = 0;
		agentMessages.length = 0;
		if (chatHistory) {
			chatHistory.innerHTML = '';
		}
		if (options.onClearRuntimeData) {
			options.onClearRuntimeData();
		}
		if (normalizedDisplayMessages.length === 0 && normalizedAgentMessages.length === 0) {
			isRestoringChatHistory = false;
			return false;
		}
		let restoredDisplayCursor: any = 0;
		let restoredAgentCursor: any = 0;
		// 恢复结束时收尾并触发后置回调。
		function finishRestoreIfActive() {
			if (restoreTaskId !== currentRestoreTaskId) {
				return;
			}
			isRestoringChatHistory = false;
			onAfterRestore();
			scrollChatHistoryIfAllowed();
		}
		// 调度下一批恢复任务，确保每批后让出主线程。
		function scheduleRestoreBatch(batchTask: () => void): void {
			if (restoreTaskId !== currentRestoreTaskId) {
				return;
			}
			clearRestoreBatchTimer();
			restoreBatchTimerId = runtimeWindow.setTimeout(() => {
				restoreBatchTimerId = 0;
				if (restoreTaskId !== currentRestoreTaskId) {
					return;
				}
				batchTask();
			}, 0);
		}
		// 分批恢复展示消息，保证页面先可交互再逐条可见。
		function restoreDisplayMessagesBatch() {
			if (restoreTaskId !== currentRestoreTaskId) {
				return;
			}
			const endIndex: any = Math.min(restoredDisplayCursor + RESTORE_RENDER_BATCH_SIZE, normalizedDisplayMessages.length);
			for (; restoredDisplayCursor < endIndex; restoredDisplayCursor += 1) {
				const item: any = normalizedDisplayMessages[restoredDisplayCursor];
				appendMessage(item.role, item.text, item.variant);
				// 恢复过程分组标题到显示记录，displayIndex 即刚写入的最后一条。
				if (item.processTitle) {
					const displayIndex: number = chatDisplayMessages.length - 1;
					if (displayIndex >= 0) {
						(chatDisplayMessages[displayIndex] as Record<string, unknown>).processTitle = String(item.processTitle).trim();
					}
				}
			}
			scrollChatHistoryIfAllowed();
			if (restoredDisplayCursor < normalizedDisplayMessages.length) {
				scheduleRestoreBatch(restoreDisplayMessagesBatch);
				return;
			}
			scheduleRestoreBatch(restoreAgentMessagesBatch);
		}
		// 分批恢复上下文消息，避免大数组一次性压入阻塞。
		function restoreAgentMessagesBatch() {
			if (restoreTaskId !== currentRestoreTaskId) {
				return;
			}
			const endIndex: any = Math.min(restoredAgentCursor + RESTORE_RENDER_BATCH_SIZE, normalizedAgentMessages.length);
			for (; restoredAgentCursor < endIndex; restoredAgentCursor += 1) {
				agentMessages.push(normalizedAgentMessages[restoredAgentCursor]);
			}
			if (restoredAgentCursor < normalizedAgentMessages.length) {
				scheduleRestoreBatch(restoreAgentMessagesBatch);
				return;
			}
			finishRestoreIfActive();
		}
		scheduleRestoreBatch(restoreDisplayMessagesBatch);
		return true;
	}
	// 解析本地会话存储并注入当前管理器状态。
	function loadPersistedSessionsFromStorage(): void {
		chatSessions.length = 0;
		activeSessionId = '';
		if (!storageKey) {
			return;
		}
		let parsed: Record<string, unknown> | null = null;
		try {
			const raw: any = runtimeWindow.localStorage.getItem(storageKey);
			if (!raw) {
				return;
			}
			parsed = JSON.parse(raw);
		}
		catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object') {
			return;
		}
		const normalizedRecords: Array<PersistedSessionRecord> = [];
		if (Number(parsed.version) === 2 && Array.isArray(parsed.sessions)) {
			for (let index: any = 0; index < parsed.sessions.length; index += 1) {
				const item: any = parsed.sessions[index];
				if (!item || typeof item !== 'object') {
					continue;
				}
				const sessionId: any = String((item as Record<string, unknown>).id || '').trim();
				if (!sessionId) {
					continue;
				}
				normalizedRecords.push({
					id: sessionId,
					title: normalizeSessionTitle((item as Record<string, unknown>).title),
					createdAt: Number((item as Record<string, unknown>).createdAt || Date.now()) || Date.now(),
					updatedAt: Number((item as Record<string, unknown>).updatedAt || Date.now()) || Date.now(),
					displayMessages: normalizeDisplayMessagesForStorage((item as Record<string, unknown>).displayMessages),
					agentMessages: normalizeAgentMessagesForStorage((item as Record<string, unknown>).agentMessages),
				});
			}
			activeSessionId = String(parsed.activeSessionId || '').trim();
		}
		else {
			const legacyDisplayMessages: any = normalizeDisplayMessagesForStorage(parsed.displayMessages);
			const legacyAgentMessages: any = normalizeAgentMessagesForStorage(parsed.agentMessages);
			if (legacyDisplayMessages.length > 0 || legacyAgentMessages.length > 0) {
				const migratedSession: any = createSessionRecord(defaultSessionTitle);
				migratedSession.displayMessages = legacyDisplayMessages;
				migratedSession.agentMessages = legacyAgentMessages;
				normalizedRecords.push(migratedSession);
				activeSessionId = migratedSession.id;
			}
		}
		normalizedRecords.sort((left?: any, right?: any) => {
			return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
		});
		for (let index: any = 0; index < normalizedRecords.length; index += 1) {
			chatSessions.push(normalizedRecords[index]);
		}
		if (chatSessions.length === 0) {
			activeSessionId = '';
			return;
		}
		if (findSessionIndexById(activeSessionId) < 0) {
			activeSessionId = chatSessions[0].id;
		}
	}
	function restoreChatSessionFromStorage(): boolean {
		loadPersistedSessionsFromStorage();
		const activeRecord: any = readActiveSessionRecord();
		if (!activeRecord) {
			return false;
		}
		return restoreSessionRecordToRuntime(activeRecord);
	}
	function createAndActivateChatSession(title?: string): {
		id: string;
		title: string;
		updatedAt: number;
	} {
		persistChatSessionNow();
		const defaultSummaryTitle: any = normalizeSessionTitle(title || defaultSessionTitle);
		activeSessionId = '';
		clearRuntimeChatData();
		persistAllSessionsNow();
		return {
			id: '',
			title: defaultSummaryTitle,
			updatedAt: Date.now(),
		};
	}
	function switchActiveChatSession(sessionId: string): boolean {
		const nextSessionId: any = String(sessionId || '').trim();
		if (!nextSessionId) {
			return false;
		}
		const nextIndex: any = findSessionIndexById(nextSessionId);
		if (nextIndex < 0) {
			return false;
		}
		persistChatSessionNow();
		activeSessionId = nextSessionId;
		moveSessionToTop(activeSessionId);
		persistAllSessionsNow();
		return restoreSessionRecordToRuntime(readActiveSessionRecord());
	}
	function deleteActiveChatSession(): boolean {
		const currentIndex: any = findSessionIndexById(activeSessionId);
		if (currentIndex < 0) {
			return false;
		}
		chatSessions.splice(currentIndex, 1);
		if (chatSessions.length === 0) {
			activeSessionId = '';
			clearRuntimeChatData();
			persistAllSessionsNow();
			return false;
		}
		activeSessionId = chatSessions[0].id;
		persistAllSessionsNow();
		return restoreSessionRecordToRuntime(readActiveSessionRecord());
	}
	function ensureActiveChatSessionForUserMessage(userText: string): {
		sessionId: string;
		title: string;
		created: boolean;
		titleUpdated: boolean;
	} {
		const derivedTitle: any = deriveSessionTitleFromUserText(userText);
		let created: any = false;
		let titleUpdated: any = false;
		let activeRecord: any = readActiveSessionRecord();
		if (!activeRecord) {
			activeRecord = createSessionRecord(derivedTitle);
			chatSessions.unshift(activeRecord);
			activeSessionId = activeRecord.id;
			created = true;
		}
		else {
			const runtimeHasMessages: any = chatDisplayMessages.length > 0 || agentMessages.length > 0
				|| normalizeDisplayMessagesForStorage(activeRecord.displayMessages).length > 0
				|| normalizeAgentMessagesForStorage(activeRecord.agentMessages).length > 0;
			if (!runtimeHasMessages && normalizeSessionTitle(activeRecord.title) === defaultSessionTitle) {
				const nextTitle: any = normalizeSessionTitle(derivedTitle);
				if (nextTitle !== normalizeSessionTitle(activeRecord.title)) {
					activeRecord.title = nextTitle;
					titleUpdated = true;
				}
			}
		}
		activeRecord.updatedAt = Date.now();
		moveSessionToTop(activeRecord.id);
		persistAllSessionsNow();
		return {
			sessionId: activeRecord.id,
			title: normalizeSessionTitle(activeRecord.title),
			created,
			titleUpdated,
		};
	}
	// 按会话 ID 更新标题并持久化。
	function updateChatSessionTitleById(sessionId: string, nextTitle: string): boolean {
		const targetSessionId: any = String(sessionId || '').trim();
		if (!targetSessionId) {
			return false;
		}
		const targetTitleRaw: any = String(nextTitle || '').replace(/\s+/g, ' ').trim();
		if (!targetTitleRaw) {
			return false;
		}
		const sessionIndex: any = findSessionIndexById(targetSessionId);
		if (sessionIndex < 0) {
			return false;
		}
		const targetRecord: any = chatSessions[sessionIndex];
		const normalizedTargetTitle: any = normalizeSessionTitle(targetTitleRaw);
		if (normalizedTargetTitle === normalizeSessionTitle(targetRecord.title)) {
			return false;
		}
		targetRecord.title = normalizedTargetTitle;
		targetRecord.updatedAt = Date.now();
		moveSessionToTop(targetRecord.id);
		persistAllSessionsNow();
		return true;
	}
	function requestDeleteSessionConfirmation(): Promise<boolean> {
		return new Promise((resolve?: any) => {
			const confirmApi: any = resolveEdaConfirmationDialogApi();
			if (!confirmApi || typeof confirmApi.value !== 'function') {
				resolve(false);
				return;
			}
			try {
				confirmApi.value.call(confirmApi.context, '确定删除当前对话及其历史记录吗？', '删除对话', '确认', '取消', (mainButtonClicked: unknown) => {
					resolve(Boolean(mainButtonClicked));
				});
			}
			catch {
				resolve(false);
			}
		});
	}
	function clearChatHistoryAndContext(): void {
		clearRuntimeChatData();
		const activeRecord: any = readActiveSessionRecord();
		if (!activeRecord) {
			persistAllSessionsNow();
			return;
		}
		activeRecord.displayMessages = [];
		activeRecord.agentMessages = [];
		activeRecord.updatedAt = Date.now();
		moveSessionToTop(activeRecord.id);
		persistAllSessionsNow();
	}
	return {
		listChatSessions,
		hasAnyChatSession,
		getActiveChatSessionId,
		createAndActivateChatSession,
		switchActiveChatSession,
		deleteActiveChatSession,
		ensureActiveChatSessionForUserMessage,
		updateChatSessionTitleById,
		pushDisplayMessageRecord,
		syncDisplayRecordByMessageNode,
		setProcessTitleByNode,
		getProcessTitleByNode,
		schedulePersistChatSession,
		persistChatSessionNow,
		clearPersistedChatSession,
		restoreChatSessionFromStorage,
		requestDeleteSessionConfirmation,
		clearChatHistoryAndContext,
	};
}
