// ------------------------------------------------------------------------
// 名称：聊天虚拟列表模块入口
// 说明：统一导出 chat-vlist 模块的所有公共类型和工厂函数。
// 作者：Lion
// 邮箱：chengbin@3578.cn
// 日期：2026-04-02
// 备注：chat.ts 只需从此文件导入，不直接依赖子模块。
// ------------------------------------------------------------------------

export type { ChatVListEngine } from './adapter';
export { createChatVListEngine } from './adapter';
export type { ChatItemRenderer } from './renderer';
export { createChatItemRenderer } from './renderer';
export type { ChatVListStore } from './store';
export { createChatVListStore } from './store';
export type {
	ChatMessageRole,
	ChatMessageVariant,
	ChatProcessGroup,
	ChatRenderItem,
	ChatVListDeps,
} from './types';
