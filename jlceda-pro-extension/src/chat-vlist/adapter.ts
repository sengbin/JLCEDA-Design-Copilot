// ------------------------------------------------------------------------
// 名称：聊天虚拟列表引擎
// 说明：基于 absolute positioning 实现真虚拟列表。
//       任意时刻 DOM 中只存在可视区 ± 缓冲区的消息节点，
//       其余节点不在 DOM 中，由顶部/底部 spacer 撑起滚动高度。
//       引擎持有 ChatVListStore + ChatItemRenderer，
//       监听 store onChange / scroll 事件后重新计算可视范围并更新 DOM。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-04-02
// 备注：引擎外部接口见 ChatVListEngine，供 chat.ts 直接调用。
// ------------------------------------------------------------------------

import type { ChatVListStore } from './store';
import type { ChatProcessGroup, ChatVListDeps } from './types';
import { createChatItemRenderer } from './renderer';

// 顶级节点：可能是一条消息，也可能是一个过程分组。
// 排列在 contentHost 中的直接子节点均为该类型。
type TopLevelEntry
	= | { kind: 'item'; itemId: string }
		| { kind: 'group'; groupId: string };

/**
 * 虚拟列表引擎对外接口。
 */
export interface ChatVListEngine {
	/**
	 * 滚动到最底部（有新消息追加时由 chat.ts 主动调用）。
	 * @param force - true=强制到底部，false=仅在已贴底时才跟随。
	 */
	scrollToBottom: (force: boolean) => void;

	/**
	 * 通知引擎：某个流式消息节点的内容已更新，触发局部重渲染。
	 * 不需要完整重算可见范围，仅刷新该节点的 DOM 内容。
	 * @param itemId - 消息项 id。
	 */
	notifyItemUpdated: (itemId: string) => void;

	/**
	 * 通知引擎：某个过程分组的状态已更新（open/loading/title 变化）。
	 * @param groupId - 分组 id。
	 */
	notifyGroupUpdated: (groupId: string) => void;

	/** 立即重算可见范围并刷新 DOM（store 批量操作后手动调用）。 */
	flush: () => void;

	/**
	 * 对已缓存的节点补充应用 foldOpen 覆盖（不重建内容）。
	 * 用于 applyFoldStateAfterSessionRestore 场景：节点可能在 patchItemFoldOpen 调用前
	 * 已因 mid-batch RAF 被创建并缓存，foldOpen 未能在 getOrCreateItemNode 时生效。
	 * @param itemId - 项 id。
	 */
	applyItemFoldOverride: (itemId: string) => void;

	/**
	 * 触发指定过程分组滚动区跟随到底部（分组子节点内容更新时调用）。
	 * @param groupId - 分组 id。
	 */
	followGroupScroll: (groupId: string) => void;

	/** 销毁引擎，移除所有监听器，清空 DOM。 */
	destroy: () => void;

	/**
	 * 获取指定 item 对应的 DOM 节点（如果当前在可视区内）。
	 * 供 chat.ts 流式输出期间直接操作节点。
	 * @param itemId - 项 id。
	 */
	getItemNode: (itemId: string) => HTMLElement | null;
}

/** 估算每条消息的初始高度（px），高度测量前用于计算 spacer。 */
const ESTIMATED_ITEM_HEIGHT = 80;

/** 可视区上下各预渲染的缓冲高度（px）。 */
const BUFFER_PX = 600;

/** 用于标记节点当前"在引擎中"的属性。 */
const ENGINE_ATTR = 'data-cvl';

/**
 * 创建聊天虚拟列表引擎实例。
 * @param scrollViewport - OverlayScrollbars 的 viewport 元素（提供 scrollTop/clientHeight）。
 * @param contentHost - 消息直接父容器（.chat-history-content）。
 * @param store - 渲染状态数据层。
 * @param deps - chat.ts 注入的渲染依赖。
 */
export function createChatVListEngine(
	scrollViewport: HTMLElement,
	contentHost: HTMLElement,
	store: ChatVListStore,
	deps: ChatVListDeps,
): ChatVListEngine {
	const itemRenderer = createChatItemRenderer(deps);

	// 测量并缓存每个顶级条目的高度（已挂载节点的真实高度）。
	const heightMap = new Map<string, number>(); // key = "item:id" 或 "group:id"

	// 当前已挂载到 contentHost 的顶级条目 key 集合（顺序集合用数组）。
	const mountedKeys = new Set<string>();

	// 每个分组绑定的 ResizeObserver，分组尺寸变化时自动失效高度缓存。
	const groupResizeObservers = new Map<string, ResizeObserver>();

	// 顶部/底部 spacer 节点，撑起虚拟高度。
	const topSpacer = document.createElement('div');
	topSpacer.style.cssText = 'pointer-events:none;';
	const bottomSpacer = document.createElement('div');
	bottomSpacer.style.cssText = 'pointer-events:none;';

	// contentHost 使用相对定位，所有子节点绝对定位。
	contentHost.style.position = 'relative';
	contentHost.appendChild(topSpacer);
	contentHost.appendChild(bottomSpacer);

	// 是否已销毁。
	let destroyed = false;

	// 是否贴底（用于自动跟随新消息）。
	let stickToBottom = true;

	// 将 store 数据展开成 TopLevelEntry 列表（GroupId 在前，组内 item 跟随在 group 内部）。
	function buildTopLevelEntries(): TopLevelEntry[] {
		const entries: TopLevelEntry[] = [];
		const items = store.getItems();
		const groups = store.getGroups();
		// 构建 groupId → group 快速查找。
		const groupById = new Map<string, ChatProcessGroup>();
		for (let gi = 0; gi < groups.length; gi += 1) {
			groupById.set(groups[gi].id, groups[gi]);
		}
		// 已归组的 item id 集合，防止重复插入。
		const groupedItemIds = new Set<string>();
		for (let gi = 0; gi < groups.length; gi += 1) {
			const g = groups[gi];
			for (let ii = 0; ii < g.itemIds.length; ii += 1) {
				groupedItemIds.add(g.itemIds[ii]);
			}
		}
		// 按消息顺序排列：遇到分组的第一个 item 时先插入 group 条目，游离 item 直接插入。
		const emittedGroupIds = new Set<string>();
		for (let i = 0; i < items.length; i += 1) {
			const item = items[i];
			if (item.groupId) {
				if (!emittedGroupIds.has(item.groupId)) {
					entries.push({ kind: 'group', groupId: item.groupId });
					emittedGroupIds.add(item.groupId);
				}
				// 组内 item 不作为顶级条目插入（它们在 group contentNode 内部）。
			}
			else {
				entries.push({ kind: 'item', itemId: item.id });
			}
		}
		return entries;
	}

	// 获取顶级条目 key（用于 heightMap 和 mountedKeys）。
	function entryKey(entry: TopLevelEntry): string {
		return entry.kind === 'item' ? `item:${entry.itemId}` : `group:${entry.groupId}`;
	}

	// 获取顶级条目对应的 DOM 节点（可能未挂载）。
	function getEntryNode(entry: TopLevelEntry): HTMLElement | null {
		if (entry.kind === 'item') {
			const item = store.getItemById(entry.itemId);
			if (!item) {
				return null;
			}
			return itemRenderer.getOrCreateItemNode(item);
		}
		const group = store.getGroupById(entry.groupId);
		if (!group) {
			return null;
		}
		const groupNode = itemRenderer.getOrCreateGroupNode(group);
		// 首次获取分组节点时绑定 ResizeObserver：展开/折叠分组或组内折叠块时自动失效高度缓存。
		// ResizeObserver 仅在真正发生尺寸变化时回调，不需要在回调内比较数值；
		// 只要 heightMap 里有缓存就清除并触发重渲，避免 contentRect（内容盒）与
		// offsetHeight（边框盒）数值不同造成每次回调都判为"高度变化"的无限循环。
		if (!groupResizeObservers.has(group.id)) {
			const capturedGroupId = group.id;
			const ro = new ResizeObserver(() => {
				if (heightMap.has(`group:${capturedGroupId}`)) {
					heightMap.delete(`group:${capturedGroupId}`);
					scheduleRender();
				}
			});
			ro.observe(groupNode);
			groupResizeObservers.set(group.id, ro);
		}
		// 确保组内所有 item 节点已挂入 groupContentNode，并移除不再属于本组的旧节点。
		const contentNode = itemRenderer.getGroupContentNode(group.id);
		if (contentNode) {
			// 构建当前有效子节点集合。
			const validChildNodes = new Set<HTMLElement>();
			let anyChildAdded = false;
			for (let i = 0; i < group.itemIds.length; i += 1) {
				const childItem = store.getItemById(group.itemIds[i]);
				if (!childItem) {
					continue;
				}
				const childNode = itemRenderer.getOrCreateItemNode(childItem);
				validChildNodes.add(childNode);
				if (childNode.parentNode !== contentNode) {
					// 清除引擎为独立条目设置的绝对定位，归组后使用文档流布局。
					childNode.style.position = '';
					childNode.style.top = '';
					childNode.style.left = '';
					childNode.style.right = '';
					childNode.style.visibility = '';
					contentNode.appendChild(childNode);
					anyChildAdded = true;
				}
			}
			// 移除已不再属于本组的旧子节点（如 running 指示器被删除后遗留的节点）。
			const childrenToRemove: HTMLElement[] = [];
			for (let i = 0; i < contentNode.childNodes.length; i += 1) {
				const child = contentNode.childNodes[i];
				if (child instanceof HTMLElement && !validChildNodes.has(child)) {
					childrenToRemove.push(child);
				}
			}
			for (let i = 0; i < childrenToRemove.length; i += 1) {
				contentNode.removeChild(childrenToRemove[i]);
			}
			// 有新子节点加入时，触发分组滚动跟随底部。
			if (anyChildAdded) {
				itemRenderer.getGroupScrollFollower(group.id)?.();
			}
		}
		return groupNode;
	}

	// 计算各条目的 top 偏移量（不含 spacer），返回 { tops, totalHeight }。
	function computeLayout(entries: TopLevelEntry[]): { tops: number[]; totalHeight: number } {
		const tops: number[] = [];
		let cursor = 0;
		for (let i = 0; i < entries.length; i += 1) {
			tops.push(cursor);
			const key = entryKey(entries[i]);
			const h = heightMap.get(key) ?? ESTIMATED_ITEM_HEIGHT;
			cursor += h;
		}
		return { tops, totalHeight: cursor };
	}

	// 找到可见范围内的条目下标区间 [startIdx, endIdx)。
	function computeVisibleRange(entries: TopLevelEntry[], tops: number[]): { start: number; end: number } {
		const scrollTop = scrollViewport.scrollTop;
		const viewHeight = scrollViewport.clientHeight;
		const visibleTop = scrollTop - BUFFER_PX;
		const visibleBottom = scrollTop + viewHeight + BUFFER_PX;

		let start = 0;
		let end = entries.length;

		// 二分查找起始下标。
		let lo = 0;
		let hi = entries.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const itemBottom = tops[mid] + (heightMap.get(entryKey(entries[mid])) ?? ESTIMATED_ITEM_HEIGHT);
			if (itemBottom < visibleTop) {
				lo = mid + 1;
			}
			else {
				hi = mid - 1;
			}
		}
		start = lo;

		// 线性查找结束下标。
		end = start;
		while (end < entries.length && tops[end] < visibleBottom) {
			end += 1;
		}

		return { start, end };
	}

	// 主渲染函数：计算可见范围，挂载/卸载节点，更新 spacer。
	function render(): void {
		if (destroyed) {
			return;
		}
		const entries = buildTopLevelEntries();
		if (entries.length === 0) {
			topSpacer.style.height = '0px';
			bottomSpacer.style.height = '0px';
			contentHost.style.height = '0px';
			// 移除所有已挂载节点。
			mountedKeys.forEach((key) => {
				const node = contentHost.querySelector(`[${ENGINE_ATTR}="${CSS.escape(key)}"]`);
				if (node) {
					contentHost.removeChild(node);
				}
			});
			mountedKeys.clear();
			return;
		}

		// 预先挂载以测量高度。
		// 若节点已在可视区（mountedKeys 中），直接原地测量，不执行 remove/append，
		// 避免从 DOM 移除再插入导致 CSS 动画（旋转图标等）被重置而产生抖动。
		for (let i = 0; i < entries.length; i += 1) {
			const key = entryKey(entries[i]);
			if (!heightMap.has(key)) {
				const node = getEntryNode(entries[i]);
				if (node) {
					const alreadyMounted = mountedKeys.has(key);
					if (!alreadyMounted) {
						node.style.position = 'absolute';
						node.style.visibility = 'hidden';
						node.setAttribute(ENGINE_ATTR, key);
						contentHost.appendChild(node);
					}
					const h = node.offsetHeight;
					if (h > 0) {
						heightMap.set(key, h);
					}
					if (!alreadyMounted) {
						contentHost.removeChild(node);
						mountedKeys.delete(key);
					}
				}
			}
		}

		const { tops, totalHeight } = computeLayout(entries);
		const { start, end } = computeVisibleRange(entries, tops);

		// 新可见集合。
		const nextVisible = new Set<string>();
		for (let i = start; i < end; i += 1) {
			nextVisible.add(entryKey(entries[i]));
		}

		// 卸载不再可见的节点。
		mountedKeys.forEach((key) => {
			if (!nextVisible.has(key)) {
				const node = contentHost.querySelector(`[${ENGINE_ATTR}="${CSS.escape(key)}"]`);
				if (node && node.parentNode === contentHost) {
					contentHost.removeChild(node);
				}
				mountedKeys.delete(key);
			}
		});

		// 挂载新可见节点并设置绝对定位。
		for (let i = start; i < end; i += 1) {
			const entry = entries[i];
			const key = entryKey(entry);
			const top = tops[i];
			const node = getEntryNode(entry);
			if (!node) {
				continue;
			}
			node.setAttribute(ENGINE_ATTR, key);
			node.style.position = 'absolute';
			node.style.left = '0';
			node.style.right = '0';
			node.style.top = `${top}px`;
			node.style.visibility = '';
			if (node.parentNode !== contentHost) {
				contentHost.appendChild(node);
			}
			// 挂载后重新测量（initial estimate 可能不准）。
			const realH = node.offsetHeight;
			if (realH > 0) {
				heightMap.set(key, realH);
			}
			mountedKeys.add(key);
		}

		// 更新总高度，让 contentHost 撑开正确高度，实现正确的滚动条范围。
		contentHost.style.height = `${totalHeight}px`;
		topSpacer.style.height = '0px';
		bottomSpacer.style.height = '0px';

		// 贴底跟随。
		if (stickToBottom) {
			scrollViewport.scrollTop = scrollViewport.scrollHeight;
		}
	}

	// 用 requestAnimationFrame 节流渲染，避免连续 onChange 触发多次 render。
	let rafPending = false;
	function scheduleRender(): void {
		if (rafPending || destroyed) {
			return;
		}
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			render();
		});
	}

	// 监听 store 变化。
	store.setOnChange((_changedIds) => {
		scheduleRender();
	});

	// 监听滚动，更新贴底状态并重算可见范围。
	function handleScroll(): void {
		const distFromBottom = scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight;
		stickToBottom = distFromBottom <= 4;
		scheduleRender();
	}
	scrollViewport.addEventListener('scroll', handleScroll, { passive: true });

	// 首次渲染。
	scheduleRender();

	return {
		scrollToBottom(force) {
			if (force) {
				stickToBottom = true;
				scrollViewport.scrollTop = scrollViewport.scrollHeight;
			}
			else if (stickToBottom) {
				scrollViewport.scrollTop = scrollViewport.scrollHeight;
			}
		},

		notifyItemUpdated(itemId) {
			const item = store.getItemById(itemId);
			if (!item) {
				return;
			}
			itemRenderer.refreshItemContent(item);
			// 高度可能因内容更新而变化，清除缓存让下次 render 重新测量。
			heightMap.delete(`item:${itemId}`);
			scheduleRender();
		},

		notifyGroupUpdated(groupId) {
			const group = store.getGroupById(groupId);
			if (!group) {
				return;
			}
			itemRenderer.refreshGroupNode(group);
			heightMap.delete(`group:${groupId}`);
			scheduleRender();
		},

		followGroupScroll(groupId) {
			if (groupId) {
				itemRenderer.getGroupScrollFollower(groupId)?.();
			}
		},

		applyItemFoldOverride(itemId) {
			const item = store.getItemById(itemId);
			if (!item) {
				return;
			}
			itemRenderer.applyFoldOverride(item);
		},

		flush() {
			render();
		},

		destroy() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			scrollViewport.removeEventListener('scroll', handleScroll);
			// 断开所有分组 ResizeObserver。
			groupResizeObservers.forEach(ro => ro.disconnect());
			groupResizeObservers.clear();
			// 移除所有已挂载节点。
			mountedKeys.forEach((key) => {
				const node = contentHost.querySelector(`[${ENGINE_ATTR}="${CSS.escape(key)}"]`);
				if (node && node.parentNode === contentHost) {
					contentHost.removeChild(node);
				}
			});
			mountedKeys.clear();
			topSpacer.remove();
			bottomSpacer.remove();
			contentHost.style.position = '';
			contentHost.style.height = '';
			itemRenderer.clear();
			heightMap.clear();
		},

		getItemNode(itemId) {
			const key = `item:${itemId}`;
			if (!mountedKeys.has(key)) {
				return null;
			}
			const node = contentHost.querySelector(`[${ENGINE_ATTR}="${CSS.escape(key)}"]`);
			return node instanceof HTMLElement ? node : null;
		},
	};
}
