// 文件说明：提供工具参数 JSON 自动修复能力，处理常见缺失花括号与键名引号问题。
// 规范化参数文本。
function normalizeRepairSourceText(rawText?: any) {
	return String(rawText || '').trim();
}
// 预览文本（限制长度，避免日志过大）。
function toPreviewText(sourceText?: any, maxLength?: any) {
	const limit: any = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0
		? Math.floor(Number(maxLength))
		: 500;
	return String(sourceText || '').slice(0, limit);
}
// 尝试解析 JSON，返回统一结果。
function tryParseJson(sourceText?: any) {
	try {
		return {
			ok: true,
			parsed: JSON.parse(String(sourceText || '')),
			error: '',
		};
	}
	catch (error: any) {
		return {
			ok: false,
			parsed: null,
			error: error && error.message ? String(error.message) : 'JSON 解析失败。',
		};
	}
}
// 查找 args 数组范围（返回 [ 开始位置与 ] 结束位置）。
function findArgsArrayRange(sourceText?: any) {
	const text: any = String(sourceText || '');
	const matchResult: any = /"args"\s*:\s*\[/i.exec(text);
	if (!matchResult) {
		return null;
	}
	const arrayStart: any = matchResult.index + matchResult[0].length - 1;
	let depth: any = 0;
	let inString: any = false;
	let escaped: any = false;
	for (let index: any = arrayStart; index < text.length; index += 1) {
		const currentChar: any = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (currentChar === '\\') {
			escaped = true;
			continue;
		}
		if (currentChar === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (currentChar === '[') {
			depth += 1;
			continue;
		}
		if (currentChar === ']') {
			depth -= 1;
			if (depth === 0) {
				return {
					arrayStart,
					arrayEnd: index,
				};
			}
		}
	}
	return null;
}
// 获取 args 首个元素边界（start 为首字符，end 为逗号位置或 ] 位置）。
function findFirstArrayElementBoundary(sourceText?: any, arrayStart?: any, arrayEnd?: any) {
	const text: any = String(sourceText || '');
	let start: any = arrayStart + 1;
	while (start < arrayEnd && /\s/.test(text[start])) {
		start += 1;
	}
	if (start >= arrayEnd) {
		return null;
	}
	let objectDepth: any = 0;
	let arrayDepth: any = 0;
	let inString: any = false;
	let escaped: any = false;
	for (let index: any = start; index < arrayEnd; index += 1) {
		const currentChar: any = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (currentChar === '\\') {
			escaped = true;
			continue;
		}
		if (currentChar === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (currentChar === '{') {
			objectDepth += 1;
			continue;
		}
		if (currentChar === '}') {
			if (objectDepth > 0) {
				objectDepth -= 1;
			}
			continue;
		}
		if (currentChar === '[') {
			arrayDepth += 1;
			continue;
		}
		if (currentChar === ']') {
			if (arrayDepth > 0) {
				arrayDepth -= 1;
			}
			continue;
		}
		if (currentChar === ',' && objectDepth === 0 && arrayDepth === 0) {
			return {
				start,
				end: index,
			};
		}
	}
	return {
		start,
		end: arrayEnd,
	};
}
// 判断指定位置是否是键值对开头。
function isObjectKeyValueStartAt(sourceText?: any, startIndex?: any) {
	const text: any = String(sourceText || '').slice(Math.max(0, Number(startIndex) || 0));
	return /^"?[A-Z_]\w*"?\s*:/i.test(text);
}
// 在指定位置前插入文本。
function insertTextAt(sourceText?: any, index?: any, insertion?: any) {
	const text: any = String(sourceText || '');
	const insertIndex: any = Math.max(0, Math.min(text.length, Number(index) || 0));
	return text.slice(0, insertIndex) + String(insertion || '') + text.slice(insertIndex);
}
// 尝试按规则修复对象键名前缺失引号（示例：libraryUuid": -> "libraryUuid":）。
function fixMissingOpeningQuoteForObjectKey(sourceText?: any) {
	const replacedText: any = String(sourceText || '').replace(/([{[,\s]\s*)([A-Z_]\w*)(")\s*:/gi, '$1"$2":');
	return {
		changed: replacedText !== sourceText,
		text: replacedText,
	};
}
// 尝试按规则修复对象键名未加双引号（示例：libraryUuid: -> "libraryUuid":）。
function fixMissingQuotesForObjectKey(sourceText?: any) {
	const replacedText: any = String(sourceText || '').replace(/([{[,\s]\s*)([A-Z_]\w*)\s*:/gi, '$1"$2":');
	return {
		changed: replacedText !== sourceText,
		text: replacedText,
	};
}
// 尝试在 args 数组第一个对象前补充缺失左花括号（示例："args":["k": -> "args":[{"k":）。
function fixMissingLeftBraceForFirstArgsObject(sourceText?: any) {
	const range: any = findArgsArrayRange(sourceText);
	if (!range) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const firstBoundary: any = findFirstArrayElementBoundary(sourceText, range.arrayStart, range.arrayEnd);
	if (!firstBoundary) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const firstChar: any = String(sourceText || '')[firstBoundary.start] || '';
	if (firstChar === '{') {
		return {
			changed: false,
			text: sourceText,
		};
	}
	if (!isObjectKeyValueStartAt(sourceText, firstBoundary.start)) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const replacedText: any = insertTextAt(sourceText, firstBoundary.start, '{');
	return {
		changed: replacedText !== sourceText,
		text: replacedText,
	};
}
// 尝试在 args 数组后续元素中补充缺失左花括号（示例：...,line":[...]} -> ...,{"line":[...]}）。
function fixMissingLeftBraceForArgsObjectAfterComma(sourceText?: any) {
	const range: any = findArgsArrayRange(sourceText);
	if (!range) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const fullText: any = String(sourceText || '');
	const beforeText: any = fullText.slice(0, range.arrayStart + 1);
	const argsInnerText: any = fullText.slice(range.arrayStart + 1, range.arrayEnd);
	const afterText: any = fullText.slice(range.arrayEnd);
	let replacedInnerText: any = '';
	let lastIndex: any = 0;
	let changed: any = false;
	let objectDepth: any = 0;
	let arrayDepth: any = 0;
	let inString: any = false;
	let escaped: any = false;
	for (let index: any = 0; index < argsInnerText.length; index += 1) {
		const currentChar: any = argsInnerText[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (currentChar === '\\') {
			escaped = true;
			continue;
		}
		if (currentChar === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (currentChar === '{') {
			objectDepth += 1;
			continue;
		}
		if (currentChar === '}') {
			if (objectDepth > 0) {
				objectDepth -= 1;
			}
			continue;
		}
		if (currentChar === '[') {
			arrayDepth += 1;
			continue;
		}
		if (currentChar === ']') {
			if (arrayDepth > 0) {
				arrayDepth -= 1;
			}
			continue;
		}
		if (currentChar !== ',') {
			continue;
		}
		if (objectDepth !== 0 || arrayDepth !== 0) {
			continue;
		}
		let lookaheadIndex: any = index + 1;
		while (lookaheadIndex < argsInnerText.length && /\s/.test(argsInnerText[lookaheadIndex])) {
			lookaheadIndex += 1;
		}
		if (lookaheadIndex >= argsInnerText.length) {
			continue;
		}
		const nextChar: any = argsInnerText[lookaheadIndex];
		if (nextChar === '{' || nextChar === '[' || nextChar === '-' || /\d/.test(nextChar)) {
			continue;
		}
		const lookaheadText: any = argsInnerText.slice(lookaheadIndex);
		if (!/^"?[A-Z_]\w*"?\s*:/i.test(lookaheadText)) {
			continue;
		}
		replacedInnerText += `${argsInnerText.slice(lastIndex, lookaheadIndex)}{`;
		lastIndex = lookaheadIndex;
		changed = true;
	}
	if (changed) {
		replacedInnerText += argsInnerText.slice(lastIndex);
	}
	else {
		replacedInnerText = argsInnerText;
	}
	const replacedText: any = beforeText + replacedInnerText + afterText;
	return {
		changed: changed && replacedText !== sourceText,
		text: replacedText,
	};
}
// 尝试修复 args 首对象被误写为双中括号包裹（示例："args":[["key":"v"}] -> "args":[{"key":"v"}]）。
function fixWrappedFirstArgsObjectByArrayBrackets(sourceText?: any) {
	const range: any = findArgsArrayRange(sourceText);
	if (!range) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const text: any = String(sourceText || '');
	let firstCharIndex: any = range.arrayStart + 1;
	while (firstCharIndex < range.arrayEnd && /\s/.test(text[firstCharIndex])) {
		firstCharIndex += 1;
	}
	if (firstCharIndex >= range.arrayEnd || text[firstCharIndex] !== '[') {
		return {
			changed: false,
			text: sourceText,
		};
	}
	let depth: any = 0;
	let inString: any = false;
	let escaped: any = false;
	let closeBracketIndex: any = -1;
	for (let index: any = firstCharIndex; index <= range.arrayEnd; index += 1) {
		const currentChar: any = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (currentChar === '\\') {
			escaped = true;
			continue;
		}
		if (currentChar === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (currentChar === '[') {
			depth += 1;
			continue;
		}
		if (currentChar === ']') {
			depth -= 1;
			if (depth === 0) {
				closeBracketIndex = index;
				break;
			}
		}
	}
	if (closeBracketIndex < 0) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	let innerStartIndex: any = firstCharIndex + 1;
	while (innerStartIndex < closeBracketIndex && /\s/.test(text[innerStartIndex])) {
		innerStartIndex += 1;
	}
	let innerEndIndex: any = closeBracketIndex - 1;
	while (innerEndIndex > innerStartIndex && /\s/.test(text[innerEndIndex])) {
		innerEndIndex -= 1;
	}
	if (innerStartIndex >= closeBracketIndex || innerEndIndex <= innerStartIndex) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const innerStartChar: any = text[innerStartIndex];
	const innerEndChar: any = text[innerEndIndex];
	if (innerStartChar === '{') {
		return {
			changed: false,
			text: sourceText,
		};
	}
	if (innerEndChar !== '}') {
		return {
			changed: false,
			text: sourceText,
		};
	}
	if (!isObjectKeyValueStartAt(text, innerStartIndex)) {
		return {
			changed: false,
			text: sourceText,
		};
	}
	const replacedText: any = `${text.slice(0, firstCharIndex)
	}{${
		text.slice(firstCharIndex + 1, closeBracketIndex)
	}}${
		text.slice(closeBracketIndex + 1)}`;
	return {
		changed: replacedText !== sourceText,
		text: replacedText,
	};
}
/**
 * 自动修复工具调用参数 JSON。
 * @param rawArgumentsText - 原始工具参数文本。
 * @returns 修复结果对象，包含是否修复成功、修复后文本、解析结果与错误信息。
 */
export function autoRepairToolArgumentsJson(rawArgumentsText?: any) {
	const sourceText: any = normalizeRepairSourceText(rawArgumentsText);
	const originalPreview: any = toPreviewText(sourceText, 500);
	if (!sourceText) {
		return {
			ok: false,
			repairAttempted: false,
			error: '参数文本为空。',
			originalPreview,
			repairedPreview: '',
			appliedRules: [],
		};
	}
	const firstParseResult: any = tryParseJson(sourceText);
	if (firstParseResult.ok) {
		return {
			ok: true,
			repairAttempted: false,
			parsed: firstParseResult.parsed,
			repairedText: sourceText,
			originalPreview,
			repairedPreview: toPreviewText(sourceText, 500),
			appliedRules: [],
		};
	}
	let currentText: any = sourceText;
	const appliedRules: any = [];
	const stepList: any = [
		{ key: 'fixMissingOpeningQuoteForObjectKey', fn: fixMissingOpeningQuoteForObjectKey },
		{ key: 'fixMissingQuotesForObjectKey', fn: fixMissingQuotesForObjectKey },
		{ key: 'fixMissingLeftBraceForFirstArgsObject', fn: fixMissingLeftBraceForFirstArgsObject },
		{ key: 'fixMissingLeftBraceForArgsObjectAfterComma', fn: fixMissingLeftBraceForArgsObjectAfterComma },
		{ key: 'fixWrappedFirstArgsObjectByArrayBrackets', fn: fixWrappedFirstArgsObjectByArrayBrackets },
	];
	for (let index: any = 0; index < stepList.length; index += 1) {
		const currentStep: any = stepList[index];
		const stepResult: any = currentStep.fn(currentText);
		if (stepResult.changed) {
			currentText = stepResult.text;
			appliedRules.push(currentStep.key);
		}
	}
	if (appliedRules.length === 0) {
		return {
			ok: false,
			repairAttempted: false,
			error: `未匹配到定向修复规则。原始解析错误：${firstParseResult.error}`,
			originalPreview,
			repairedPreview: toPreviewText(currentText, 500),
			appliedRules,
		};
	}
	const finalParseResult: any = tryParseJson(currentText);
	if (finalParseResult.ok) {
		return {
			ok: true,
			repairAttempted: true,
			parsed: finalParseResult.parsed,
			repairedText: currentText,
			originalPreview,
			repairedPreview: toPreviewText(currentText, 500),
			appliedRules,
		};
	}
	return {
		ok: false,
		repairAttempted: true,
		error: finalParseResult.error || '修复后仍不是有效 JSON。',
		originalPreview,
		repairedPreview: toPreviewText(currentText, 500),
		appliedRules,
	};
}
