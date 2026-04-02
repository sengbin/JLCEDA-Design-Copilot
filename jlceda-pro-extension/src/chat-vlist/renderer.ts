// ------------------------------------------------------------------------
// 名称：聊天虚拟列表 DOM 渲染器
// 说明：负责将 ChatRenderItem 映射为 DOM 节点，并管理过程分组容器。
//       渲染器只负责"给定一条数据，返回/更新对应的 DOM 节点"，
//       不持有列表布局逻辑，布局由 adapter.ts 中的引擎负责。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-04-02
// 备注：所有 DOM 创建逻辑从 chat.ts 中提取，保持与原实现一致。
// ------------------------------------------------------------------------

import type { ChatProcessGroup, ChatRenderItem, ChatVListDeps } from './types';

/**
 * 为渲染项创建/更新 DOM 节点的渲染器。
 */
export interface ChatItemRenderer {
	/**
	 * 获取或创建给定渲染项对应的消息根节点。
	 * 若节点已存在则仅更新内容，否则新建。
	 * @param item - 渲染项。
	 * @returns 消息根节点。
	 */
	getOrCreateItemNode: (item: ChatRenderItem) => HTMLElement;

	/**
	 * 强制重新渲染指定项的内容（用于流式追加后的更新）。
	 * @param item - 渲染项。
	 */
	refreshItemContent: (item: ChatRenderItem) => void;

	/**
	 * 获取或创建过程分组容器节点（.chat-process-group）。
	 * @param group - 分组数据。
	 * @returns 分组容器节点。
	 */
	getOrCreateGroupNode: (group: ChatProcessGroup) => HTMLElement;

	/**
	 * 更新过程分组容器的外观（标题、展开状态、加载状态）。
	 * @param group - 分组数据。
	 */
	refreshGroupNode: (group: ChatProcessGroup) => void;

	/**
	 * 获取分组内容区节点（.process-group-content），用于将消息节点插入其中。
	 * @param groupId - 分组 id。
	 * @returns 内容区节点，分组不存在时返回 null。
	 */
	getGroupContentNode: (groupId: string) => HTMLElement | null;

	/**
	 * 获取分组滚动跟随函数，新增子节点后调用以触发滚动到底部。
	 * @param groupId - 分组 id。
	 * @returns 跟随底部函数，分组不存在时返回 null。
	 */
	getGroupScrollFollower: (groupId: string) => (() => void) | null;

	/**
	 * 释放指定 item 对应的缓存（item 从列表中永久删除时调用）。
	 * @param itemId - 项 id。
	 */
	recycleItem: (itemId: string) => void;

	/**
	 * 释放指定 group 对应的缓存（group 从列表中永久删除时调用）。
	 * @param groupId - 分组 id。
	 */
	recycleGroup: (groupId: string) => void;

	/**
	 * 对已缓存节点补充应用 foldOpen 覆盖（不重建内容）。
	 * 用于节点在 patchItemFoldOpen 调用前已被创建并缓存的情况。
	 * @param item - 渲染项。
	 */
	applyFoldOverride: (item: ChatRenderItem) => void;

	/** 释放所有缓存节点。 */
	clear: () => void;
}

/**
 * 创建聊天 DOM 渲染器实例。
 * @param deps - chat.ts 注入的渲染依赖。
 */
export function createChatItemRenderer(deps: ChatVListDeps): ChatItemRenderer {
	// item id → 消息根节点。
	const itemNodeMap = new Map<string, HTMLElement>();
	// group id → { wrapperNode, detailsNode, contentNode, itemsNode, followToBottom, summaryTitleNode, loadingNode }
	const groupNodeMap = new Map<string, {
		wrapperNode: HTMLElement;
		detailsNode: HTMLDetailsElement;
		contentNode: HTMLElement;
		itemsNode: HTMLElement;
		followToBottom: () => void;
		summaryTitleNode: HTMLElement;
		loadingNode: HTMLElement;
	}>();

	// 创建消息根节点（不附加到文档）。
	function createMessageRootNode(item: ChatRenderItem): HTMLElement {
		const node = document.createElement('div');
		const classList = ['chat-message', item.role === 'user' ? 'user' : 'ai'];
		if (item.variant) {
			classList.push(String(item.variant));
		}
		node.className = classList.join(' ');
		if (item.displayIndex >= 0) {
			node.setAttribute('data-display-index', String(item.displayIndex));
		}
		if (item.variant === 'round-model' && item.roundStartIdx >= 0) {
			node.setAttribute('data-round-start', String(item.roundStartIdx));
		}
		return node;
	}

	// 创建过程分组容器节点（不附加到文档）。
	function buildGroupElements(group: ChatProcessGroup): {
		wrapperNode: HTMLElement;
		detailsNode: HTMLDetailsElement;
		contentNode: HTMLElement;
		itemsNode: HTMLElement;
		followToBottom: () => void;
		summaryTitleNode: HTMLElement;
		loadingNode: HTMLElement;
	} {
		const wrapperNode = document.createElement('div');
		wrapperNode.className = 'chat-process-group';

		const detailsNode = document.createElement('details') as HTMLDetailsElement;
		detailsNode.className = 'process-group-fold';
		detailsNode.open = group.open;

		const summaryNode = document.createElement('summary');
		summaryNode.className = 'process-group-summary';

		const iconWrapNode = document.createElement('span');
		iconWrapNode.className = 'process-group-icon-wrap';
		iconWrapNode.setAttribute('aria-hidden', 'true');

		const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		chevronSvg.setAttribute('class', 'process-group-icon-chevron');
		chevronSvg.setAttribute('viewBox', '0 0 14 7');
		chevronSvg.setAttribute('focusable', 'false');
		const chevronUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		chevronUse.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#icon-chevron-down');
		chevronSvg.appendChild(chevronUse);
		iconWrapNode.appendChild(chevronSvg);

		const summaryTitleNode = document.createElement('span');
		summaryTitleNode.className = 'process-group-title';
		summaryTitleNode.textContent = group.title || '执行过程';

		const loadingNode = document.createElement('span');
		loadingNode.className = 'process-group-loading-indicator';
		loadingNode.setAttribute('aria-hidden', 'true');
		loadingNode.innerHTML = '<svg class="process-group-loading-icon" viewBox="0 0 12 12" focusable="false"><use xlink:href="#icon-spinner-half"></use></svg>';

		summaryNode.appendChild(iconWrapNode);
		summaryNode.appendChild(summaryTitleNode);
		summaryNode.appendChild(loadingNode);

		const contentNode = document.createElement('div');
		contentNode.className = 'process-group-content';

		// 创建可滚动宿主（OverlayScrollbars 挂载目标）。
		const scrollHostNode = document.createElement('div');
		scrollHostNode.className = 'process-group-scroll-host';
		contentNode.appendChild(scrollHostNode);

		// 初始化滚动条，获取实际追加目标和跟随底部函数；初始化失败则直接使用滚动宿主。
		const scrollResult = deps.createGroupScrollbar(scrollHostNode);
		const itemsNode = scrollResult?.contentBody ?? scrollHostNode;
		const followToBottom = scrollResult ? scrollResult.followToBottom : () => {};

		detailsNode.appendChild(summaryNode);
		detailsNode.appendChild(contentNode);
		wrapperNode.appendChild(detailsNode);

		return { wrapperNode, detailsNode, contentNode, itemsNode, followToBottom, summaryTitleNode, loadingNode };
	}

	// 当 item.foldOpen 字段有值时，覆盖 details.open（用于会话恢复后的初始折叠状态）。
	function applyFoldOpenOverride(node: HTMLElement, item: ChatRenderItem): void {
		if (item.foldOpen === undefined) {
			return;
		}
		const detailsEl = node.querySelector<HTMLDetailsElement>('details.fold-block');
		if (detailsEl) {
			detailsEl.open = item.foldOpen;
		}
	}

	return {
		getOrCreateItemNode(item) {
			let node = itemNodeMap.get(item.id);
			if (!node) {
				node = createMessageRootNode(item);
				deps.renderMessageContent(node, item);
				applyFoldOpenOverride(node, item);
				itemNodeMap.set(item.id, node);
			}
			return node;
		},

		refreshItemContent(item) {
			const node = itemNodeMap.get(item.id);
			if (!node) {
				return;
			}
			// 更新 round-model 的 data-round-start（流式结束后可能才写入）。
			if (item.variant === 'round-model' && item.roundStartIdx >= 0) {
				node.setAttribute('data-round-start', String(item.roundStartIdx));
			}
			deps.renderMessageContent(node, item);
			applyFoldOpenOverride(node, item);
		},

		getOrCreateGroupNode(group) {
			let cached = groupNodeMap.get(group.id);
			if (!cached) {
				cached = buildGroupElements(group);
				groupNodeMap.set(group.id, cached);
			}
			return cached.wrapperNode;
		},

		refreshGroupNode(group) {
			const cached = groupNodeMap.get(group.id);
			if (!cached) {
				return;
			}
			cached.detailsNode.open = group.open;
			cached.detailsNode.classList.toggle('is-loading', group.loading);
			cached.summaryTitleNode.textContent = group.title || '执行过程';
		},

		getGroupContentNode(groupId) {
			const cached = groupNodeMap.get(groupId);
			return cached ? cached.itemsNode : null;
		},

		getGroupScrollFollower(groupId) {
			const cached = groupNodeMap.get(groupId);
			return cached ? cached.followToBottom : null;
		},

		recycleItem(itemId) {
			itemNodeMap.delete(itemId);
		},

		applyFoldOverride(item) {
			const node = itemNodeMap.get(item.id);
			if (!node) {
				return;
			}
			applyFoldOpenOverride(node, item);
		},

		recycleGroup(groupId) {
			groupNodeMap.delete(groupId);
		},

		clear() {
			itemNodeMap.clear();
			groupNodeMap.clear();
		},
	};
}
