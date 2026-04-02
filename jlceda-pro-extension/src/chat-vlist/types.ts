// ------------------------------------------------------------------------
// 名称：聊天虚拟列表数据层类型定义
// 说明：定义聊天消息渲染记录、过程分组记录及相关枚举和接口。
//       所有渲染状态以数据驱动，DOM 是纯派生物，不作为状态来源。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-04-02
// 备注：此模块不依赖任何 DOM API，可独立测试。
// ------------------------------------------------------------------------

/**
 * 消息角色。
 */
export type ChatMessageRole = 'user' | 'ai';

/**
 * 消息变体，对应 chat.ts 中 variant 参数的全部取值。
 */
export type ChatMessageVariant
	= | 'reasoning'
		| 'tool-exec'
		| 'running'
		| 'round-separator'
		| 'round-model'
		| 'model-loop-error'
		| undefined;

/**
 * 单条可渲染的聊天消息记录。
 * 用于驱动虚拟列表的 renderItem 函数，所有渲染所需状态均在此结构中。
 */
export interface ChatRenderItem {
	/** 唯一 ID，在当次页面生命周期内不变。 */
	id: string;
	/** 消息角色。 */
	role: ChatMessageRole;
	/** 显示变体（undefined 表示普通 AI 回复）。 */
	variant: ChatMessageVariant;
	/**
	 * 消息文本，用户消息可能是富消息对象。
	 * 类型使用 unknown 避免引入循环依赖，实际使用时按 chat.ts 约定处理。
	 */
	text: unknown;
	/**
	 * 在 chatDisplayMessages 数组中的索引，用于 data-display-index 属性。
	 * -1 表示无对应持久化记录（如 round-separator）。
	 */
	displayIndex: number;
	/**
	 * round-model 节点对应的轮次起始 agentMessages 索引。
	 * 仅 variant === 'round-model' 时有效，其余为 -1。
	 */
	roundStartIdx: number;
	/**
	 * 所属过程分组 ID，null 表示不属于任何分组。
	 * 分组 ID 用于将连续的 reasoning/tool-exec 消息归入同一组。
	 */
	groupId: string | null;
	/**
	 * 折叠块展开状态领制字段，仅对 variant === 'reasoning' | 'tool-exec' 有效。
	 * undefined 表示不领制（由 setMessageContent 自行决定初始展开状态）。
	 */
	foldOpen?: boolean;
}

/**
 * 过程分组（process fold group）元数据。
 * 每个分组对应一个 .chat-process-group 容器。
 */
export interface ChatProcessGroup {
	/** 分组唯一 ID。 */
	id: string;
	/** 分组标题（由 todoPanelCurrentTaskTitle 在首条消息时写入）。 */
	title: string;
	/** 分组是否展开。 */
	open: boolean;
	/** 分组是否处于加载中状态（显示旋转图标）。 */
	loading: boolean;
	/** 分组内所有消息项的 id 列表（顺序即渲染顺序）。 */
	itemIds: string[];
}

/**
 * 虚拟列表渲染引擎所需的外部依赖（由 chat.ts 注入）。
 */
export interface ChatVListDeps {
	/** 渲染一条消息节点并填充内容（等同于原 setMessageContent）。 */
	renderMessageContent: (node: HTMLElement, item: ChatRenderItem) => void;
	/** 为消息节点内的折叠内容区绑定 OverlayScrollbars（等同于原 bindOverlayScrollControllersInMessage）。 */
	bindScrollbars: (node: HTMLElement) => void;
	/** 为过程分组滚动宿主节点初始化 OverlayScrollbars，返回内容体节点和跟随底部函数。 */
	createGroupScrollbar: (scrollHostElement: HTMLElement) => { contentBody: HTMLElement | null; followToBottom: () => void } | null;
}
