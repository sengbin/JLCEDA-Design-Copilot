// 文件说明：任务列表工具 —— 接收结构化 todoList 参数并返回规范化结果，供前端独立面板渲染。

/** 任务状态类型。 */
export type TodoStatus = 'not-started' | 'in-progress' | 'completed';

/** 单条任务项。 */
export interface TodoItem {
	id: number;
	title: string;
	status: TodoStatus;
}

const TODO_STATUS_SET: Set<string> = new Set(['not-started', 'in-progress', 'completed']);

// 判断值是否为普通对象。
function isRecordObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 归一化并校验单条任务项。
function normalizeTodoItem(rawItem: unknown, index: number): { ok: true; item: TodoItem } | { ok: false; error: string } {
	if (!isRecordObject(rawItem)) {
		return { ok: false, error: `todoList[${String(index)}] 必须为对象。` };
	}

	const idValue: unknown = rawItem.id;
	if (typeof idValue !== 'number' || !Number.isInteger(idValue) || idValue <= 0) {
		return { ok: false, error: `todoList[${String(index)}].id 必须为正整数。` };
	}

	const titleText: string = String(rawItem.title || '').trim();
	if (!titleText) {
		return { ok: false, error: `todoList[${String(index)}].title 不能为空。` };
	}

	const statusText: string = String(rawItem.status || '').trim();
	if (!TODO_STATUS_SET.has(statusText)) {
		return {
			ok: false,
			error: `todoList[${String(index)}].status 非法，仅支持 not-started/in-progress/completed。`,
		};
	}

	return {
		ok: true,
		item: {
			id: idValue,
			title: titleText,
			status: statusText as TodoStatus,
		},
	};
}

// 统计任务汇总信息。
function buildTodoSummary(todoList: TodoItem[]): {
	total: number;
	notStarted: number;
	inProgress: number;
	completed: number;
} {
	let notStarted = 0;
	let inProgress = 0;
	let completed = 0;

	for (let index = 0; index < todoList.length; index += 1) {
		const status = todoList[index].status;
		if (status === 'not-started') {
			notStarted += 1;
			continue;
		}
		if (status === 'in-progress') {
			inProgress += 1;
			continue;
		}
		completed += 1;
	}

	return {
		total: todoList.length,
		notStarted,
		inProgress,
		completed,
	};
}

/**
 * 创建 todo_list 工具处理器。
 * @returns 工具处理器。
 */
export function createTodoListHandler(): {
	handleTodoListTask: (payload: unknown) => Promise<unknown>;
} {
	// 仅在当前运行时会话内保存最近一次任务列表快照。
	let latestTodoList: TodoItem[] = [];
	let latestUpdatedAt = 0;

	// 处理 todo_list 工具调用。
	async function handleTodoListTask(payload: unknown): Promise<unknown> {
		if (!isRecordObject(payload)) {
			return { ok: false, error: 'todo_list 参数必须为对象。' };
		}

		const rawTodoList: unknown = payload.todoList;
		if (!Array.isArray(rawTodoList)) {
			return { ok: false, error: 'todo_list.todoList 必须是数组类型。' };
		}
		if (rawTodoList.length === 0) {
			return { ok: false, error: 'todoList 不能为空。' };
		}

		const normalizedTodoList: TodoItem[] = [];
		const idSet: Set<number> = new Set();

		for (let index = 0; index < rawTodoList.length; index += 1) {
			const normalizedResult = normalizeTodoItem(rawTodoList[index], index);
			if (!normalizedResult.ok) {
				return { ok: false, error: normalizedResult.error };
			}
			if (idSet.has(normalizedResult.item.id)) {
				return { ok: false, error: `todoList[${String(index)}].id 重复。` };
			}
			idSet.add(normalizedResult.item.id);
			normalizedTodoList.push(normalizedResult.item);
		}

		latestTodoList = normalizedTodoList;
		latestUpdatedAt = Date.now();
		const explanationText: string = String(payload.explanation || '').trim();
		const summary = buildTodoSummary(normalizedTodoList);

		return {
			ok: true,
			updatedAt: latestUpdatedAt,
			todoList: latestTodoList.map(item => ({ ...item })),
			summary,
			explanation: explanationText,
		};
	}

	return { handleTodoListTask };
}
