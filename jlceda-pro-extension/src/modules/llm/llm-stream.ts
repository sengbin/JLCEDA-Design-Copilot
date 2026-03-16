// 文件说明：封装 SSE 事件解析与模型流式工具调用增量处理逻辑。
import { safeJsonStringify } from '../utils';
// 合并工具调用参数的流式文本。
function mergeToolCallText(existingText?: any, incomingText?: any) {
	const currentText: any = String(existingText || '');
	const nextText: any = String(incomingText || '');
	if (!nextText) {
		return currentText;
	}
	if (!currentText) {
		return nextText;
	}
	if (currentText === nextText) {
		return currentText;
	}
	if (nextText.indexOf(currentText) === 0) {
		return nextText;
	}
	if (currentText.indexOf(nextText) === 0) {
		return currentText;
	}
	return currentText + nextText;
}
// 规范化工具调用参数分片。
function normalizeToolCallArgumentsChunk(value?: any) {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'object') {
		return safeJsonStringify(value);
	}
	return String(value);
}
/**
 * 解析单个 SSE（Server-Sent Events）事件块，提取事件类型与数据载荷。
 *
 * 处理规则：
 * 1. 事件块按换行拆分，读取最后一个 `event:` 行作为事件类型；
 * 2. 收集所有 `data:` 行并按换行拼接为 payload 文本；
 * 3. 当没有 `data:`、payload 为空、或 payload 为 `[DONE]` 时返回 null。
 *
 * 典型输入示例：
 * event: response.output_text.delta
 * data: `{"delta":"你好"}`
 *
 * @param eventBlock - 单个 SSE 事件块原始文本（通常由空行分隔后的片段）。
 * @returns 返回解析结果对象：
 * - eventType：事件类型，可能为空字符串（当事件块未提供 event 行时）；
 * - payloadText：由全部 data 行合并后的文本；
 * 若事件块无有效可处理数据，则返回 null。
 */
export function parseSseEventBlock(eventBlock: string): {
	eventType: string;
	payloadText: string;
} | null {
	const safeEventBlock: any = String(eventBlock || '');
	if (!safeEventBlock) {
		return null;
	}
	const eventLines: any = safeEventBlock.split('\n');
	let eventType: any = '';
	for (const eventLine of eventLines) {
		if (eventLine.startsWith('event:')) {
			eventType = eventLine.slice(6).trim();
		}
	}
	const dataLines: any = safeEventBlock
		.split('\n')
		.filter((line: any) => line.startsWith('data:'))
		.map((line: any) => line.slice(5).trim());
	if (dataLines.length === 0) {
		return null;
	}
	const payloadText: any = dataLines.join('\n');
	if (!payloadText || payloadText === '[DONE]') {
		return null;
	}
	return {
		eventType,
		payloadText,
	};
}
/**
 * 构建工具调用增量项。
 * @param source - 源数据。
 * @param explicitIndex - 显式索引。
 * @returns 增量项或 null。
 */
export function buildToolCallDeltaItem(source?: any, explicitIndex?: any) {
	const sourceObject: any = source && typeof source === 'object' ? source : {};
	const explicitIndexValue: any = Number(explicitIndex);
	const sourceIndexValue: any = Number(sourceObject.index);
	const outputIndexValue: any = Number(sourceObject.output_index);
	const itemIndexValue: any = Number(sourceObject.item_index);
	let targetIndex: any = -1;
	if (Number.isFinite(explicitIndexValue) && explicitIndexValue >= 0) {
		targetIndex = Math.floor(explicitIndexValue);
	}
	else if (Number.isFinite(sourceIndexValue) && sourceIndexValue >= 0) {
		targetIndex = Math.floor(sourceIndexValue);
	}
	else if (Number.isFinite(outputIndexValue) && outputIndexValue >= 0) {
		targetIndex = Math.floor(outputIndexValue);
	}
	else if (Number.isFinite(itemIndexValue) && itemIndexValue >= 0) {
		targetIndex = Math.floor(itemIndexValue);
	}
	const functionObject: any = sourceObject.function && typeof sourceObject.function === 'object'
		? sourceObject.function
		: null;
	const functionName: any = String(sourceObject.name
		|| (functionObject && functionObject.name)
		|| '').trim();
	const functionArguments: any = normalizeToolCallArgumentsChunk(sourceObject.arguments !== undefined
		? sourceObject.arguments
		: (functionObject && functionObject.arguments));
	const output: any = {
		id: String(sourceObject.id
			|| sourceObject.call_id
			|| sourceObject.item_id
			|| '').trim(),
		type: 'function',
		function: {
			name: functionName,
			arguments: functionArguments,
		},
	};
	if (targetIndex >= 0) {
		output.index = targetIndex;
	}
	if (!output.id && !output.function.name && !output.function.arguments) {
		return null;
	}
	return output;
}
/**
 * 从 responses 事件中提取工具调用增量。
 * @param chunkObject - 事件数据对象。
 * @param normalizedEvent - 标准化事件名。
 * @returns 工具调用增量列表。
 */
export function extractResponsesToolCallDeltas(chunkObject?: any, normalizedEvent?: any) {
	const deltas: any = [];
	if (!chunkObject || typeof chunkObject !== 'object') {
		return deltas;
	}
	// 推入单个来源的工具调用增量。
	function pushFromSource(sourceValue?: any, explicitIndex?: any) {
		const built: any = buildToolCallDeltaItem(sourceValue, explicitIndex);
		if (built) {
			deltas.push(built);
		}
	}
	if (Array.isArray(chunkObject.tool_calls)) {
		for (let index: any = 0; index < chunkObject.tool_calls.length; index += 1) {
			pushFromSource(chunkObject.tool_calls[index], index);
		}
	}
	const deltaObject: any = chunkObject.delta && typeof chunkObject.delta === 'object' ? chunkObject.delta : null;
	if (deltaObject && Array.isArray(deltaObject.tool_calls)) {
		for (let index: any = 0; index < deltaObject.tool_calls.length; index += 1) {
			pushFromSource(deltaObject.tool_calls[index], index);
		}
	}
	const eventText: any = String(normalizedEvent || '').trim().toLowerCase();
	if (eventText.indexOf('response.function_call_arguments') === 0) {
		pushFromSource({
			id: chunkObject.item_id || chunkObject.call_id || chunkObject.id,
			name: chunkObject.name,
			arguments: chunkObject.delta || chunkObject.arguments || chunkObject.arguments_delta,
			index: chunkObject.output_index,
		}, chunkObject.output_index);
	}
	if (chunkObject.item && typeof chunkObject.item === 'object') {
		const itemType: any = String(chunkObject.item.type || '').trim().toLowerCase();
		if (itemType.includes('function_call')) {
			pushFromSource(chunkObject.item, chunkObject.output_index);
		}
	}
	if (Array.isArray(chunkObject.output)) {
		for (let index: any = 0; index < chunkObject.output.length; index += 1) {
			const outputItem: any = chunkObject.output[index];
			if (!outputItem || typeof outputItem !== 'object') {
				continue;
			}
			const outputType: any = String(outputItem.type || '').trim().toLowerCase();
			if (outputType.includes('function_call')) {
				pushFromSource(outputItem, index);
			}
		}
	}
	return deltas;
}
/**
 * 合并工具调用增量到目标数组。
 * @param toolCalls - 目标工具调用数组。
 * @param deltaToolCalls - 增量工具调用数组。
 */
export function mergeToolCallDelta(toolCalls?: any, deltaToolCalls?: any) {
	for (let index: any = 0; index < deltaToolCalls.length; index += 1) {
		const deltaCall: any = deltaToolCalls[index] || {};
		const targetIndex: any = typeof deltaCall.index === 'number' ? deltaCall.index : index;
		if (!toolCalls[targetIndex]) {
			toolCalls[targetIndex] = {
				id: '',
				type: 'function',
				function: {
					name: '',
					arguments: '',
				},
			};
		}
		const merged: any = toolCalls[targetIndex];
		if (deltaCall.id) {
			merged.id = String(deltaCall.id);
		}
		if (deltaCall.type) {
			merged.type = String(deltaCall.type);
		}
		const fn: any = deltaCall.function || {};
		if (typeof fn.name === 'string' && fn.name) {
			merged.function.name = mergeToolCallText(merged.function.name, fn.name);
		}
		if (typeof fn.arguments === 'string' && fn.arguments) {
			merged.function.arguments = mergeToolCallText(merged.function.arguments, fn.arguments);
		}
	}
}
