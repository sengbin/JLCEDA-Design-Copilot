// ------------------------------------------------------------------------
// 名称：聊天虚拟列表渲染状态存储
// 说明：维护所有 ChatRenderItem 与 ChatProcessGroup 的数据层状态。
//       不持有任何 DOM 引用，渲染状态以此为唯一来源。
//       提供增删改查接口，所有变更通过 onChange 回调通知外层。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-04-02
// 备注：无
// ------------------------------------------------------------------------

import type { ChatMessageRole, ChatMessageVariant, ChatProcessGroup, ChatRenderItem } from './types';

// 自增 ID 计数器，保证同一页面生命周期内唯一。
let idCounter = 0;

// 生成消息项唯一 ID。
function nextItemId(): string {
	idCounter += 1;
	return `ci-${idCounter}`;
}

// 生成过程分组唯一 ID。
function nextGroupId(): string {
	idCounter += 1;
	return `cg-${idCounter}`;
}

/**
 * 聊天渲染状态存储。
 * 所有变更操作均同步执行，通过 onChange 通知外层引擎更新视图。
 */
export interface ChatVListStore {
	// -------------------- 查询 --------------------

	/** 获取所有渲染项列表（按顺序）。 */
	getItems: () => readonly ChatRenderItem[];
	/** 按 id 查找渲染项。 */
	getItemById: (id: string) => ChatRenderItem | undefined;
	/** 按 id 查找过程分组。 */
	getGroupById: (groupId: string) => ChatProcessGroup | undefined;
	/** 获取所有过程分组（按创建顺序）。 */
	getGroups: () => readonly ChatProcessGroup[];

	// -------------------- 消息增删 --------------------

	/**
	 * 追加一条消息，返回新建项 id。
	 * @param role - 角色。
	 * @param variant - 变体。
	 * @param text - 消息内容。
	 * @param displayIndex - 对应 chatDisplayMessages 的索引，-1 表示无。
	 * @param roundStartIdx - round-model 时的轮次起始索引，其余传 -1。
	 */
	appendItem: (
		role: ChatMessageRole,
		variant: ChatMessageVariant,
		text: unknown,
		displayIndex: number,
		roundStartIdx: number,
	) => string;

	/**
	 * 更新指定项的 text（流式追加场景）。
	 * @param id - 项 id。
	 * @param text - 新内容。
	 */
	updateItemText: (id: string, text: unknown) => void;

	/** 清空所有消息项和过程分组。 */
	clearAll: () => void;

	// -------------------- 过程分组 --------------------

	/**
	 * 按 id 删除一条消息项（如 running indicator 移除时使用）。
	 * @param itemId - 项 id。
	 */
	removeItem: (itemId: string) => void;

	/**
	 * 创建一个新的过程分组，返回分组 id。
	 * @param title - 分组标题。
	 */
	createGroup: (title: string) => string;

	/**
	 * 将指定消息项加入指定分组。
	 * 若项已属于某分组则先从旧组移除。
	 * @param itemId - 消息项 id。
	 * @param groupId - 目标分组 id。
	 */
	assignItemToGroup: (itemId: string, groupId: string) => void;

	/**
	 * 更新分组属性（open / loading / title 任意组合）。
	 * @param groupId - 分组 id。
	 * @param patch - 要更新的字段。
	 */
	patchGroup: (groupId: string, patch: Partial<Pick<ChatProcessGroup, 'open' | 'loading' | 'title'>>) => void;

	/**
	 * 设置指定消息项的折叠展开状态（会话恢复后领制 fold.open）。
	 * @param itemId - 消息项 id。
	 * @param foldOpen - 展开为 true，折叠为 false。
	 */
	patchItemFoldOpen: (itemId: string, foldOpen: boolean) => void;

	// -------------------- 变更通知 --------------------

	/**
	 * 注册状态变更回调（最多一个）。
	 * @param fn - 回调函数，收到变动的 item ids 集合（空集合表示全量刷新）。
	 */
	setOnChange: (fn: (changedIds: ReadonlySet<string>) => void) => void;
}

/**
 * 创建聊天渲染状态存储实例。
 */
export function createChatVListStore(): ChatVListStore {
	const items: ChatRenderItem[] = [];
	const itemMap = new Map<string, ChatRenderItem>();
	const groups: ChatProcessGroup[] = [];
	const groupMap = new Map<string, ChatProcessGroup>();
	let onChange: ((changedIds: ReadonlySet<string>) => void) | null = null;

	// 触发变更通知，传入受影响的 item ids。
	function notify(changedIds: ReadonlySet<string>): void {
		if (onChange) {
			onChange(changedIds);
		}
	}

	// 全量刷新通知（空集合）。
	function notifyAll(): void {
		notify(new Set<string>());
	}

	return {
		getItems: () => items,
		getItemById: id => itemMap.get(id),
		getGroupById: groupId => groupMap.get(groupId),
		getGroups: () => groups,

		appendItem(role, variant, text, displayIndex, roundStartIdx) {
			const id = nextItemId();
			const item: ChatRenderItem = {
				id,
				role,
				variant,
				text,
				displayIndex,
				roundStartIdx,
				groupId: null,
			};
			items.push(item);
			itemMap.set(id, item);
			notify(new Set([id]));
			return id;
		},

		updateItemText(id, text) {
			const item = itemMap.get(id);
			if (!item) {
				return;
			}
			item.text = text;
			notify(new Set([id]));
		},

		clearAll() {
			items.length = 0;
			itemMap.clear();
			groups.length = 0;
			groupMap.clear();
			notifyAll();
		},

		removeItem(itemId) {
			const idx = items.findIndex(it => it.id === itemId);
			if (idx < 0) {
				return;
			}
			const item = items[idx];
			// 从所属分组移除。
			if (item.groupId) {
				const grp = groupMap.get(item.groupId);
				if (grp) {
					const gi = grp.itemIds.indexOf(itemId);
					if (gi >= 0) {
						grp.itemIds.splice(gi, 1);
					}
				}
			}
			items.splice(idx, 1);
			itemMap.delete(itemId);
			notifyAll();
		},

		createGroup(title) {
			const id = nextGroupId();
			const group: ChatProcessGroup = {
				id,
				title,
				open: true,
				loading: false,
				itemIds: [],
			};
			groups.push(group);
			groupMap.set(id, group);
			// 分组本身不是 item，全量通知让引擎重排。
			notifyAll();
			return id;
		},

		assignItemToGroup(itemId, groupId) {
			const item = itemMap.get(itemId);
			const group = groupMap.get(groupId);
			if (!item || !group) {
				return;
			}
			// 从旧分组移除。
			if (item.groupId && item.groupId !== groupId) {
				const oldGroup = groupMap.get(item.groupId);
				if (oldGroup) {
					const idx = oldGroup.itemIds.indexOf(itemId);
					if (idx >= 0) {
						oldGroup.itemIds.splice(idx, 1);
					}
				}
			}
			item.groupId = groupId;
			if (!group.itemIds.includes(itemId)) {
				group.itemIds.push(itemId);
			}
			notifyAll();
		},

		patchGroup(groupId, patch) {
			const group = groupMap.get(groupId);
			if (!group) {
				return;
			}
			if (patch.open !== undefined) {
				group.open = patch.open;
			}
			if (patch.loading !== undefined) {
				group.loading = patch.loading;
			}
			if (patch.title !== undefined) {
				group.title = patch.title;
			}
			// 分组状态变化影响其全部 item 的容器外观。
			notify(new Set(group.itemIds));
		},

		patchItemFoldOpen(itemId, foldOpen) {
			const item = itemMap.get(itemId);
			if (!item) {
				return;
			}
			item.foldOpen = foldOpen;
			notify(new Set([itemId]));
		},

		setOnChange(fn) {
			onChange = fn;
		},
	};
}
