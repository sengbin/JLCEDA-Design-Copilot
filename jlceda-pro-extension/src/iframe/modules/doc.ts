// 文件说明：提供离线 API 文档读取、索引构建与高效模糊检索能力。
import { readExtensionTextFileByCandidates } from './utils';

const OFFLINE_API_DOC_RELATIVE_PATH: any = 'jlceda-pro-api-doc.json';
const OFFLINE_API_DOC_RESOURCE_PATH: any = 'iframe/jlceda-pro-api-doc.json';
const OFFLINE_API_DOC_FETCH_CANDIDATES: any = [
	'/iframe/jlceda-pro-api-doc.json',
	'./jlceda-pro-api-doc.json',
];
const OFFLINE_API_DOC_TYPE: any = 'JLCEDA_PRO_API_REFERENCE';
const OFFLINE_CALLABLE_KINDS: any = new Set([
	'function',
	'method',
	'constructor',
	'callSignature',
	'getter',
	'setter',
]);
const OFFLINE_TYPE_KINDS: any = new Set([
	'class',
	'interface',
	'typeAlias',
	'enum',
	'enumMember',
	'property',
	'indexSignature',
	'variable',
]);
const OFFLINE_QUERY_SYNONYM_GROUPS: any = [
	['sch', 'schematic', '原理图', '电路图'],
	['pcb', '板子', '电路板', '线路板'],
	['symbol', '符号', '器件符号'],
	['footprint', '封装', '焊盘封装'],
	['panel', '面板', '拼板'],
	['library', '库', '元件库'],
	['project', '工程', '项目'],
	['document', '文档', '文件'],
	['net', '网络', '网线'],
	['wire', '导线', '连线'],
	['pin', '引脚', '管脚'],
	['component', '器件', '元件'],
	['create', '新建', '创建'],
	['delete', '删除', '移除'],
	['modify', '修改', '更新'],
	['copy', '复制', '拷贝'],
	['move', '移动', '迁移'],
	['search', '检索', '搜索', '查找'],
];
/**
 * 规范化离线 API 文档检索关键词。
 * @param value - 原始关键词。
 * @returns 小写、去首尾空白后的关键词。
 */
export function normalizeOfflineApiDocKeyword(value?: any) {
	return String(value || '').toLowerCase().trim();
}
/**
 * 压缩关键词中的分隔符，便于模糊匹配。
 * @param value - 原始关键词。
 * @returns 压缩后的关键词。
 */
export function compactOfflineApiDocKeyword(value?: any) {
	return normalizeOfflineApiDocKeyword(value).replace(/[\s._:/\\\-]+/g, '');
}
/**
 * 规范化离线文档中位置对象。
 * @param location - 原始位置对象。
 * @returns 规范化后的位置对象。
 */
function normalizeOfflineLocation(location?: any) {
	const source: any = location && typeof location === 'object' ? location : {};
	return {
		startLine: Number.isFinite(Number(source.startLine)) ? Math.max(1, Math.floor(Number(source.startLine))) : 1,
		startColumn: Number.isFinite(Number(source.startColumn)) ? Math.max(1, Math.floor(Number(source.startColumn))) : 1,
		endLine: Number.isFinite(Number(source.endLine)) ? Math.max(1, Math.floor(Number(source.endLine))) : 1,
		endColumn: Number.isFinite(Number(source.endColumn)) ? Math.max(1, Math.floor(Number(source.endColumn))) : 1,
	};
}
/**
 * 将文本拆分为更易检索的形式（含 CamelCase 展开）。
 * @param value - 原始文本。
 * @returns 归一化后的文本。
 */
function normalizeOfflineSearchText(value?: any) {
	const text: any = String(value || '');
	const camelExpanded: any = text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
	return normalizeOfflineApiDocKeyword(camelExpanded);
}
/**
 * 对检索文本分词。
 * @param value - 原始文本。
 * @returns 分词后的 token 数组。
 */
function tokenizeOfflineApiDocText(value?: any) {
	const normalizedText: any = normalizeOfflineSearchText(value);
	if (!normalizedText) {
		return [];
	}
	const rawTokens: any = normalizedText
		.replace(/[^\w\u4E00-\u9FA5]+/g, ' ')
		.split(/\s+/)
		.map((token: any) => String(token || '').trim())
		.filter((token: any) => token.length >= 2);
	return Array.from(new Set(rawTokens));
}
/**
 * 规范化关键词列表。
 * @param values - 原始关键词列表。
 * @returns 规范化关键词列表。
 */
function normalizeOfflineKeywordList(values?: any) {
	const source: any = Array.isArray(values) ? values : [];
	const outputSet: any = new Set();
	for (let index: any = 0; index < source.length; index += 1) {
		const normalizedText: any = normalizeOfflineSearchText(source[index]);
		if (!normalizedText || normalizedText.length < 2) {
			continue;
		}
		outputSet.add(normalizedText);
	}
	return Array.from(outputSet);
}
/**
 * 扩展查询关键词，补充常见同义词。
 * @param keyword - 原始查询词。
 * @returns 扩展后的关键词列表。
 */
function expandOfflineQueryKeywords(keyword?: any) {
	const candidateSet: any = new Set();
	const normalizedKeyword: any = normalizeOfflineSearchText(keyword);
	if (normalizedKeyword) {
		candidateSet.add(normalizedKeyword);
	}
	const splitKeywordParts: any = String(keyword || '').split(/[\s,，;；、|/\\:：._\-]+/g);
	for (let index: any = 0; index < splitKeywordParts.length; index += 1) {
		const currentPart: any = normalizeOfflineSearchText(splitKeywordParts[index]);
		if (!currentPart || currentPart.length < 2) {
			continue;
		}
		candidateSet.add(currentPart);
		if (currentPart.endsWith('s') && currentPart.length > 3) {
			candidateSet.add(currentPart.slice(0, -1));
		}
	}
	const baseCandidates: any = Array.from(candidateSet);
	for (let index: any = 0; index < baseCandidates.length; index += 1) {
		const currentCandidate: any = baseCandidates[index];
		for (let groupIndex: any = 0; groupIndex < OFFLINE_QUERY_SYNONYM_GROUPS.length; groupIndex += 1) {
			const synonymGroup: any = OFFLINE_QUERY_SYNONYM_GROUPS[groupIndex];
			const normalizedSynonymGroup: any = normalizeOfflineKeywordList(synonymGroup);
			if (!normalizedSynonymGroup.includes(currentCandidate)) {
				continue;
			}
			for (let synonymIndex: any = 0; synonymIndex < normalizedSynonymGroup.length; synonymIndex += 1) {
				candidateSet.add(normalizedSynonymGroup[synonymIndex]);
			}
		}
	}
	return Array.from(candidateSet).filter((item: any) => String(item || '').trim().length >= 2);
}
/**
 * 由关键词列表构建查询 tokens。
 * @param keywordCandidates - 关键词列表。
 * @returns 去重后的 token 列表。
 */
function collectOfflineQueryTokens(keywordCandidates?: any) {
	const source: any = Array.isArray(keywordCandidates) ? keywordCandidates : [];
	const tokenSet: any = new Set();
	for (let index: any = 0; index < source.length; index += 1) {
		const currentTokens: any = tokenizeOfflineApiDocText(source[index]);
		for (let tokenIndex: any = 0; tokenIndex < currentTokens.length; tokenIndex += 1) {
			tokenSet.add(currentTokens[tokenIndex]);
		}
	}
	return Array.from(tokenSet);
}
/**
 * 规范化参数数组。
 * @param parameters - 原始参数数组。
 * @returns 规范化参数数组。
 */
function normalizeOfflineParameters(parameters?: any) {
	const source: any = Array.isArray(parameters) ? parameters : [];
	return source.map((item?: any) => {
		const current: any = item && typeof item === 'object' ? item : {};
		return {
			name: String(current.name || ''),
			type: String(current.type || ''),
			optional: !!current.optional,
			rest: !!current.rest,
			initializer: String(current.initializer || ''),
		};
	});
}
/**
 * 规范化泛型参数数组。
 * @param typeParameters - 原始泛型参数数组。
 * @returns 规范化后的泛型参数数组。
 */
function normalizeOfflineTypeParameters(typeParameters?: any) {
	const source: any = Array.isArray(typeParameters) ? typeParameters : [];
	return source.map((item?: any) => {
		const current: any = item && typeof item === 'object' ? item : {};
		return {
			name: String(current.name || ''),
			constraint: String(current.constraint || ''),
			defaultType: String(current.defaultType || ''),
		};
	});
}
/**
 * 规范化继承关系数组。
 * @param heritage - 原始继承关系数组。
 * @returns 规范化继承关系数组。
 */
function normalizeOfflineHeritage(heritage?: any) {
	const source: any = Array.isArray(heritage) ? heritage : [];
	return source.map((item?: any) => {
		const current: any = item && typeof item === 'object' ? item : {};
		return {
			relation: String(current.relation || ''),
			types: Array.isArray(current.types)
				? current.types.map((entry?: any) => String(entry || ''))
				: [],
		};
	});
}
/**
 * 从 symbols 构建投影数据（当 projections 缺失时使用）。
 * @param symbols - symbols 数组。
 * @returns 投影对象。
 */
function buildOfflineProjectionFromSymbols(symbols?: any) {
	const callableApis: any = [];
	const types: any = [];
	const source: any = Array.isArray(symbols) ? symbols : [];
	for (let index: any = 0; index < source.length; index += 1) {
		const symbol: any = source[index] && typeof source[index] === 'object' ? source[index] : {};
		const kind: any = String(symbol.kind || '');
		const base: any = {
			id: Number(symbol.id),
			name: String(symbol.name || ''),
			fullName: String(symbol.fullName || ''),
			kind,
			ownerFullName: String(symbol.ownerFullName || ''),
			location: normalizeOfflineLocation(symbol.location),
			summary: String(symbol.jsDoc && symbol.jsDoc.summary ? symbol.jsDoc.summary : ''),
		};
		if (OFFLINE_CALLABLE_KINDS.has(kind)) {
			callableApis.push({
				...base,
				signatureText: String(symbol.signatureText || symbol.declarationText || ''),
				parameters: normalizeOfflineParameters(symbol.parameters),
				returnType: String(symbol.returnType || ''),
				typeParameters: normalizeOfflineTypeParameters(symbol.typeParameters),
			});
		}
		if (OFFLINE_TYPE_KINDS.has(kind)) {
			types.push({
				...base,
				typeText: String(symbol.typeText || ''),
				heritage: normalizeOfflineHeritage(symbol.heritage),
				enumValue: String(symbol.enumValue || ''),
			});
		}
	}
	return {
		callableApis,
		types,
	};
}
/**
 * 向索引写入键值映射。
 * @param map - 目标索引。
 * @param key - 索引键。
 * @param entryId - 条目标识。
 */
function appendOfflineEntryToIndex(map?: any, key?: any, entryId?: any) {
	const normalizedKey: any = normalizeOfflineApiDocKeyword(key);
	if (!normalizedKey) {
		return;
	}
	if (typeof map[normalizedKey] === 'undefined') {
		map[normalizedKey] = new Set();
	}
	if (!(map[normalizedKey] instanceof Set)) {
		throw new TypeError(`离线文档索引结构异常：${normalizedKey}`);
	}
	map[normalizedKey].add(entryId);
}
/**
 * 构建离线文档条目。
 * @param projectionItem - 投影项。
 * @param entryType - 条目类型。
 * @returns 条目对象。
 */
function buildOfflineApiSearchEntry(projectionItem?: any, entryType?: any) {
	const source: any = projectionItem && typeof projectionItem === 'object' ? projectionItem : {};
	const name: any = String(source.name || '');
	const fullName: any = String(source.fullName || name);
	const kind: any = String(source.kind || '');
	const ownerFullName: any = String(source.ownerFullName || '');
	const summary: any = String(source.summary || '');
	const signatureText: any = String(source.signatureText || '');
	const returnType: any = String(source.returnType || '');
	const typeText: any = String(source.typeText || '');
	const enumValue: any = String(source.enumValue || '');
	const parameters: any = normalizeOfflineParameters(source.parameters);
	const typeParameters: any = normalizeOfflineTypeParameters(source.typeParameters);
	const heritage: any = normalizeOfflineHeritage(source.heritage);
	const location: any = normalizeOfflineLocation(source.location);
	const searchKeywords: any = normalizeOfflineKeywordList(source.searchKeywords);
	const searchParts: any = [
		entryType,
		kind,
		name,
		fullName,
		ownerFullName,
		summary,
		signatureText,
		returnType,
		typeText,
		enumValue,
		searchKeywords.join(' '),
	].concat(parameters.map((item: any) => {
		return [item.name, item.type, item.initializer].join(' ');
	})).concat(typeParameters.map((item: any) => {
		return [item.name, item.constraint, item.defaultType].join(' ');
	})).concat(heritage.map((item: any) => {
		return [item.relation].concat(item.types).join(' ');
	}));
	const searchText: any = searchParts.join('\n');
	const searchTextNormalized: any = normalizeOfflineSearchText(searchText);
	const searchTextCompact: any = compactOfflineApiDocKeyword(searchTextNormalized);
	const tokens: any = tokenizeOfflineApiDocText(searchText);
	return {
		symbolId: Number(source.id) || 0,
		entryType,
		kind,
		name,
		fullName,
		ownerFullName,
		summary,
		signatureText,
		returnType,
		typeText,
		enumValue,
		parameters,
		typeParameters,
		heritage,
		location,
		searchKeywords,
		searchTextNormalized,
		searchTextCompact,
		searchTokens: tokens,
	};
}
/**
 * 构建检索运行时索引。
 * @param docData - 离线文档数据。
 * @returns 检索运行时对象。
 */
function buildOfflineApiSearchRuntime(docData?: any) {
	const source: any = docData && typeof docData === 'object' ? docData : {};
	const symbols: any = Array.isArray(source.symbols) ? source.symbols : [];
	const fallbackProjection: any = buildOfflineProjectionFromSymbols(symbols);
	const projections: any = source.projections && typeof source.projections === 'object'
		? source.projections
		: {};
	const callableProjection: any = Array.isArray(projections.callableApis)
		? projections.callableApis
		: fallbackProjection.callableApis;
	const typeProjection: any = Array.isArray(projections.types)
		? projections.types
		: fallbackProjection.types;
	const entries: any = [];
	const deduplicatedKeys: any = new Set();
	const idIndex: any = Object.create(null);
	const nameIndex: any = Object.create(null);
	const fullNameIndex: any = Object.create(null);
	const compactIndex: any = Object.create(null);
	const tokenIndex: any = Object.create(null);
	const keywordIndex: any = Object.create(null);
	// 追加条目并建立索引。
	function appendEntry(projectionItem?: any, entryType?: any) {
		const entry: any = buildOfflineApiSearchEntry(projectionItem, entryType);
		if (!entry.name && !entry.fullName) {
			return;
		}
		const uniqueKey: any = [
			entry.entryType,
			normalizeOfflineApiDocKeyword(entry.fullName || entry.name),
			normalizeOfflineApiDocKeyword(entry.kind),
			String(entry.symbolId || 0),
		].join('::');
		if (deduplicatedKeys.has(uniqueKey)) {
			return;
		}
		deduplicatedKeys.add(uniqueKey);
		const entryId: any = entries.length + 1;
		entries.push({
			entryId,
			...entry,
		});
		idIndex[entryId] = true;
		appendOfflineEntryToIndex(nameIndex, entry.name, entryId);
		appendOfflineEntryToIndex(fullNameIndex, entry.fullName, entryId);
		appendOfflineEntryToIndex(compactIndex, entry.searchTextCompact, entryId);
		for (let tokenIndexValue: any = 0; tokenIndexValue < entry.searchTokens.length; tokenIndexValue += 1) {
			appendOfflineEntryToIndex(tokenIndex, entry.searchTokens[tokenIndexValue], entryId);
		}
		for (let keywordIndexValue: any = 0; keywordIndexValue < entry.searchKeywords.length; keywordIndexValue += 1) {
			appendOfflineEntryToIndex(keywordIndex, entry.searchKeywords[keywordIndexValue], entryId);
		}
	}
	for (let index: any = 0; index < callableProjection.length; index += 1) {
		appendEntry(callableProjection[index], 'callable');
	}
	for (let index: any = 0; index < typeProjection.length; index += 1) {
		appendEntry(typeProjection[index], 'type');
	}
	return {
		documentType: String(source.documentType || ''),
		schemaVersion: String(source.schemaVersion || ''),
		generatedAt: String(source.generatedAt || ''),
		sourcePath: String(source.source && source.source.filePath ? source.source.filePath : ''),
		summary: source.summary && typeof source.summary === 'object' ? source.summary : {},
		entries,
		idIndex,
		nameIndex,
		fullNameIndex,
		compactIndex,
		tokenIndex,
		keywordIndex,
	};
}
/**
 * 从索引中收集候选条目编号。
 * @param runtime - 检索运行时。
 * @param keywordLower - 规范化关键词。
 * @param keywordCompact - 压缩关键词。
 * @param queryTokens - 查询 tokens。
 * @returns 候选条目编号数组。
 */
function collectOfflineApiCandidateIds(runtime?: any, keywordLower?: any, keywordCompact?: any, queryTokens?: any, keywordCandidates?: any) {
	const candidateSet: any = new Set();
	const runtimeObject: any = runtime && typeof runtime === 'object' ? runtime : {};
	const normalizedKeywordCandidates: any = normalizeOfflineKeywordList(keywordCandidates);
	function mergeIndex(indexObject?: any, keyText?: any) {
		const key: any = normalizeOfflineApiDocKeyword(keyText);
		if (!key || !indexObject || typeof indexObject !== 'object') {
			return;
		}
		const idSet: any = indexObject[key];
		if (!idSet || typeof idSet.forEach !== 'function') {
			return;
		}
		idSet.forEach((idValue?: any) => {
			candidateSet.add(idValue);
		});
	}
	mergeIndex(runtimeObject.nameIndex, keywordLower);
	mergeIndex(runtimeObject.fullNameIndex, keywordLower);
	mergeIndex(runtimeObject.compactIndex, keywordCompact);
	mergeIndex(runtimeObject.keywordIndex, keywordLower);
	for (let index: any = 0; index < queryTokens.length; index += 1) {
		mergeIndex(runtimeObject.tokenIndex, queryTokens[index]);
	}
	for (let index: any = 0; index < normalizedKeywordCandidates.length; index += 1) {
		mergeIndex(runtimeObject.nameIndex, normalizedKeywordCandidates[index]);
		mergeIndex(runtimeObject.fullNameIndex, normalizedKeywordCandidates[index]);
		mergeIndex(runtimeObject.keywordIndex, normalizedKeywordCandidates[index]);
		mergeIndex(runtimeObject.compactIndex, compactOfflineApiDocKeyword(normalizedKeywordCandidates[index]));
	}
	if (candidateSet.size > 0) {
		return Array.from(candidateSet);
	}
	const allIds: any = Object.keys(runtimeObject.idIndex || {});
	return allIds.map((idValue?: any) => Number(idValue)).filter((idValue?: any) => Number.isFinite(idValue));
}
/**
 * 判断压缩关键词是否为目标文本的子序列。
 * @param queryCompact - 压缩查询词。
 * @param targetCompact - 压缩目标文本。
 * @returns 是否满足子序列关系。
 */
function isOfflineCompactSubsequence(queryCompact?: any, targetCompact?: any) {
	if (!queryCompact || !targetCompact) {
		return false;
	}
	if (queryCompact.length > targetCompact.length) {
		return false;
	}
	let queryIndex: any = 0;
	let targetIndex: any = 0;
	while (queryIndex < queryCompact.length && targetIndex < targetCompact.length) {
		if (queryCompact[queryIndex] === targetCompact[targetIndex]) {
			queryIndex += 1;
		}
		targetIndex += 1;
	}
	return queryIndex >= queryCompact.length;
}
/**
 * 计算 token 重叠得分。
 * @param queryTokens - 查询 tokens。
 * @param entryTokens - 条目 tokens。
 * @returns token 匹配分数。
 */
function computeOfflineTokenScore(queryTokens?: any, entryTokens?: any) {
	if (!Array.isArray(queryTokens) || queryTokens.length < 1) {
		return 0;
	}
	if (!Array.isArray(entryTokens) || entryTokens.length < 1) {
		return 0;
	}
	const tokenSet: any = new Set(entryTokens);
	let hitCount: any = 0;
	for (let index: any = 0; index < queryTokens.length; index += 1) {
		if (tokenSet.has(queryTokens[index])) {
			hitCount += 1;
		}
	}
	if (hitCount < 1) {
		return 0;
	}
	return hitCount * 28 + Math.floor((hitCount / queryTokens.length) * 40);
}
/**
 * 计算条目匹配得分。
 * @param entry - 离线文档条目。
 * @param keywordLower - 规范化关键词。
 * @param keywordCompact - 压缩关键词。
 * @param queryTokens - 查询 tokens。
 * @returns 匹配分数。
 */
function scoreOfflineApiEntry(entry?: any, keywordLower?: any, keywordCompact?: any, queryTokens?: any, keywordCandidates?: any, keywordCompacts?: any) {
	const current: any = entry && typeof entry === 'object' ? entry : {};
	const nameLower: any = normalizeOfflineApiDocKeyword(current.name);
	const fullNameLower: any = normalizeOfflineApiDocKeyword(current.fullName);
	const kindLower: any = normalizeOfflineApiDocKeyword(current.kind);
	const summaryLower: any = normalizeOfflineApiDocKeyword(current.summary);
	const signatureLower: any = normalizeOfflineApiDocKeyword(current.signatureText);
	const searchLower: any = normalizeOfflineApiDocKeyword(current.searchTextNormalized);
	const entrySearchKeywordSet: any = new Set(normalizeOfflineKeywordList(current.searchKeywords));
	const compactText: any = compactOfflineApiDocKeyword(current.searchTextCompact || searchLower);
	const normalizedKeywordCandidates: any = normalizeOfflineKeywordList(keywordCandidates);
	const normalizedKeywordCompacts: any = Array.isArray(keywordCompacts)
		? keywordCompacts.map((item: any) => compactOfflineApiDocKeyword(item)).filter((item: any) => !!item)
		: [];
	if (!searchLower) {
		return 0;
	}
	let score: any = 0;
	if (keywordLower === nameLower) {
		score += 980;
	}
	if (keywordLower === fullNameLower) {
		score += 940;
	}
	if (keywordLower && nameLower.includes(keywordLower)) {
		score += nameLower.startsWith(keywordLower) ? 520 : 360;
	}
	if (keywordLower && fullNameLower.includes(keywordLower)) {
		score += fullNameLower.startsWith(keywordLower) ? 420 : 300;
	}
	if (keywordLower && kindLower === keywordLower) {
		score += 180;
	}
	if (keywordLower && signatureLower.includes(keywordLower)) {
		score += 120;
	}
	if (keywordLower && summaryLower.includes(keywordLower)) {
		score += 90;
	}
	if (keywordLower && searchLower.includes(keywordLower)) {
		score += 70;
	}
	if (keywordCompact && compactText.includes(keywordCompact)) {
		score += 240;
	}
	if (keywordCompact && isOfflineCompactSubsequence(keywordCompact, compactText)) {
		score += 60;
	}
	let candidateScore: any = 0;
	for (let index: any = 0; index < normalizedKeywordCandidates.length; index += 1) {
		const currentKeyword: any = normalizedKeywordCandidates[index];
		if (!currentKeyword || currentKeyword === keywordLower) {
			continue;
		}
		if (currentKeyword === nameLower) {
			candidateScore = Math.max(candidateScore, 680);
		}
		if (currentKeyword === fullNameLower) {
			candidateScore = Math.max(candidateScore, 620);
		}
		if (nameLower.includes(currentKeyword)) {
			candidateScore = Math.max(candidateScore, nameLower.startsWith(currentKeyword) ? 420 : 280);
		}
		if (fullNameLower.includes(currentKeyword)) {
			candidateScore = Math.max(candidateScore, fullNameLower.startsWith(currentKeyword) ? 340 : 240);
		}
		if (signatureLower.includes(currentKeyword)) {
			candidateScore = Math.max(candidateScore, 140);
		}
		if (summaryLower.includes(currentKeyword)) {
			candidateScore = Math.max(candidateScore, 120);
		}
		if (entrySearchKeywordSet.has(currentKeyword)) {
			candidateScore = Math.max(candidateScore, 360);
		}
	}
	let compactCandidateScore: any = 0;
	for (let index: any = 0; index < normalizedKeywordCompacts.length; index += 1) {
		const currentCompactKeyword: any = normalizedKeywordCompacts[index];
		if (!currentCompactKeyword || currentCompactKeyword === keywordCompact) {
			continue;
		}
		if (compactText.includes(currentCompactKeyword)) {
			compactCandidateScore = Math.max(compactCandidateScore, 120);
		}
		if (isOfflineCompactSubsequence(currentCompactKeyword, compactText)) {
			compactCandidateScore = Math.max(compactCandidateScore, 80);
		}
	}
	score += candidateScore;
	score += compactCandidateScore;
	score += computeOfflineTokenScore(queryTokens, current.searchTokens);
	if (queryTokens.length > 1) {
		const dotJoinedQuery: any = normalizeOfflineApiDocKeyword(queryTokens.join('.'));
		if (dotJoinedQuery && fullNameLower.includes(dotJoinedQuery)) {
			score += 120;
		}
	}
	return score;
}
/**
 * 构建检索输出条目。
 * @param entry - 条目对象。
 * @param score - 匹配分数。
 * @returns 输出条目。
 */
function buildOfflineApiOutputMatch(entry?: any, score?: any) {
	const current: any = entry && typeof entry === 'object' ? entry : {};
	return {
		type: String(current.entryType || ''),
		kind: String(current.kind || ''),
		name: String(current.name || ''),
		fullName: String(current.fullName || ''),
		ownerFullName: String(current.ownerFullName || ''),
		summary: String(current.summary || ''),
		signatureText: String(current.signatureText || ''),
		returnType: String(current.returnType || ''),
		typeText: String(current.typeText || ''),
		enumValue: String(current.enumValue || ''),
		parameters: normalizeOfflineParameters(current.parameters),
		typeParameters: normalizeOfflineTypeParameters(current.typeParameters),
		heritage: normalizeOfflineHeritage(current.heritage),
		location: normalizeOfflineLocation(current.location),
		symbolId: Number(current.symbolId) || 0,
		score,
	};
}
/**
 * 校验离线文档根结构。
 * @param parsed - JSON 解析结果。
 * @returns 校验结果。
 */
function validateOfflineApiDocShape(parsed?: any) {
	if (!parsed || typeof parsed !== 'object') {
		return {
			ok: false,
			error: `离线文档 JSON 根节点不是对象：${OFFLINE_API_DOC_RELATIVE_PATH}。`,
		};
	}
	if (String(parsed.documentType || '') !== OFFLINE_API_DOC_TYPE) {
		return {
			ok: false,
			error: `离线文档类型不正确，期望 ${OFFLINE_API_DOC_TYPE}：${OFFLINE_API_DOC_RELATIVE_PATH}。`,
		};
	}
	if (!Array.isArray(parsed.symbols)) {
		return {
			ok: false,
			error: `离线文档缺少 symbols 数组：${OFFLINE_API_DOC_RELATIVE_PATH}。`,
		};
	}
	return {
		ok: true,
	};
}
/**
 * 创建离线 API 文档检索器。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 提供离线文档检索能力的对象。
 */
export function createOfflineApiDocSearcher(runtimeWindow?: any) {
	let offlineApiDocTextCache: any = '';
	let offlineApiDocTextSource: any = '';
	let offlineApiDocLoadError: any = '';
	let offlineApiDocParsedCache: any = null;
	let offlineApiDocParseError: any = '';
	let offlineApiDocRuntimeCache: any = null;
	// 读取离线文档文本。
	async function loadOfflineApiDocText() {
		if (offlineApiDocTextCache) {
			return {
				ok: true,
				text: offlineApiDocTextCache,
				source: offlineApiDocTextSource || OFFLINE_API_DOC_RELATIVE_PATH,
			};
		}
		if (offlineApiDocLoadError) {
			return {
				ok: false,
				error: offlineApiDocLoadError,
			};
		}
		const extensionResult: any = await readExtensionTextFileByCandidates(runtimeWindow, [
			OFFLINE_API_DOC_RESOURCE_PATH,
			OFFLINE_API_DOC_RELATIVE_PATH,
		]);
		if (extensionResult && extensionResult.ok) {
			const normalizedText: any = String(extensionResult.text || '').trim();
			if (normalizedText) {
				offlineApiDocTextCache = normalizedText;
				offlineApiDocTextSource = String(extensionResult.source || OFFLINE_API_DOC_RELATIVE_PATH);
				return {
					ok: true,
					text: offlineApiDocTextCache,
					source: offlineApiDocTextSource,
				};
			}
		}
		const runtimeFetch: any = runtimeWindow && typeof runtimeWindow.fetch === 'function'
			? runtimeWindow.fetch.bind(runtimeWindow)
			: (typeof fetch === 'function' ? fetch : null);
		if (runtimeFetch) {
			for (let index: any = 0; index < OFFLINE_API_DOC_FETCH_CANDIDATES.length; index += 1) {
				const candidate: any = OFFLINE_API_DOC_FETCH_CANDIDATES[index];
				try {
					const response: any = await runtimeFetch(candidate, { cache: 'no-cache' });
					if (!response.ok) {
						continue;
					}
					const text: any = await response.text();
					const normalizedText: any = String(text || '').trim();
					if (!normalizedText) {
						continue;
					}
					offlineApiDocTextCache = normalizedText;
					offlineApiDocTextSource = candidate;
					return {
						ok: true,
						text: offlineApiDocTextCache,
						source: offlineApiDocTextSource,
					};
				}
				catch { }
			}
		}
		offlineApiDocLoadError = `无法读取本地离线文档：${OFFLINE_API_DOC_RELATIVE_PATH}（扩展资源路径 ${OFFLINE_API_DOC_RESOURCE_PATH}）。`;
		return {
			ok: false,
			error: offlineApiDocLoadError,
		};
	}
	// 解析离线文档对象。
	async function loadOfflineApiDocData() {
		if (offlineApiDocParsedCache) {
			return {
				ok: true,
				data: offlineApiDocParsedCache,
			};
		}
		if (offlineApiDocParseError) {
			return {
				ok: false,
				error: offlineApiDocParseError,
			};
		}
		const loadedText: any = await loadOfflineApiDocText();
		if (!loadedText.ok) {
			return {
				ok: false,
				error: loadedText.error || '离线文档读取失败。',
			};
		}
		let parsed: any = null;
		try {
			parsed = JSON.parse(String(loadedText.text || ''));
		}
		catch {
			offlineApiDocParseError = `离线文档不是有效的 JSON 格式：${OFFLINE_API_DOC_RELATIVE_PATH}。`;
			return {
				ok: false,
				error: offlineApiDocParseError,
			};
		}
		const shapeValidation: any = validateOfflineApiDocShape(parsed);
		if (!shapeValidation.ok) {
			offlineApiDocParseError = shapeValidation.error;
			return {
				ok: false,
				error: offlineApiDocParseError,
			};
		}
		offlineApiDocParsedCache = {
			...parsed,
			source: parsed.source && typeof parsed.source === 'object'
				? parsed.source
				: {
						filePath: loadedText.source,
					},
		};
		return {
			ok: true,
			data: offlineApiDocParsedCache,
		};
	}
	// 构建离线文档检索运行时。
	async function loadOfflineApiDocRuntime() {
		if (offlineApiDocRuntimeCache) {
			return {
				ok: true,
				runtime: offlineApiDocRuntimeCache,
			};
		}
		const loadedData: any = await loadOfflineApiDocData();
		if (!loadedData.ok) {
			return {
				ok: false,
				error: loadedData.error || '离线文档解析失败。',
			};
		}
		offlineApiDocRuntimeCache = buildOfflineApiSearchRuntime(loadedData.data);
		return {
			ok: true,
			runtime: offlineApiDocRuntimeCache,
		};
	}
	// 在离线文档中执行高效模糊检索。
	async function searchOfflineApiDoc(args?: any) {
		const inputArgs: any = args && typeof args === 'object' ? args : {};
		const keyword: any = String(inputArgs.keyword || '').trim();
		if (!keyword) {
			return {
				ok: false,
				error: '缺少 keyword 参数。',
			};
		}
		const maxResultsValue: any = Number(inputArgs.maxResults);
		const maxResults: any = Number.isFinite(maxResultsValue)
			? Math.max(1, Math.min(30, Math.floor(maxResultsValue)))
			: 8;
		const runtimeResult: any = await loadOfflineApiDocRuntime();
		if (!runtimeResult.ok) {
			return {
				ok: false,
				error: runtimeResult.error || '离线文档运行时构建失败。',
			};
		}
		const runtime: any = runtimeResult.runtime;
		const keywordCandidates: any = expandOfflineQueryKeywords(keyword);
		const keywordLower: any = keywordCandidates.length > 0
			? String(keywordCandidates[0] || '')
			: normalizeOfflineApiDocKeyword(keyword);
		const keywordCompact: any = compactOfflineApiDocKeyword(keywordLower || keyword);
		const keywordCompacts: any = keywordCandidates.map((item: any) => compactOfflineApiDocKeyword(item));
		const queryTokens: any = collectOfflineQueryTokens(keywordCandidates);
		const candidateIds: any = collectOfflineApiCandidateIds(runtime, keywordLower, keywordCompact, queryTokens, keywordCandidates);
		const scoredItems: any = [];
		for (let index: any = 0; index < candidateIds.length; index += 1) {
			const candidateId: any = candidateIds[index];
			const entry: any = runtime.entries[candidateId - 1];
			if (!entry) {
				continue;
			}
			const score: any = scoreOfflineApiEntry(entry, keywordLower, keywordCompact, queryTokens, keywordCandidates, keywordCompacts);
			if (score <= 0) {
				continue;
			}
			scoredItems.push({
				score,
				entry,
			});
		}
		scoredItems.sort((left?: any, right?: any) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			const leftName: any = normalizeOfflineApiDocKeyword(left.entry.fullName || left.entry.name);
			const rightName: any = normalizeOfflineApiDocKeyword(right.entry.fullName || right.entry.name);
			if (leftName < rightName) {
				return -1;
			}
			if (leftName > rightName) {
				return 1;
			}
			return 0;
		});
		const outputMatches: any = scoredItems.slice(0, maxResults).map((item: any) => {
			return buildOfflineApiOutputMatch(item.entry, item.score);
		});
		return {
			ok: true,
			keyword,
			docPath: OFFLINE_API_DOC_RELATIVE_PATH,
			docFormat: 'jlceda-pro-api-reference',
			documentType: runtime.documentType,
			schemaVersion: runtime.schemaVersion,
			source: runtime.sourcePath,
			generatedAt: runtime.generatedAt,
			queryKeywords: keywordCandidates,
			totalEntries: runtime.entries.length,
			totalMatches: scoredItems.length,
			returnedMatches: outputMatches.length,
			searchStats: {
				candidateCount: candidateIds.length,
				scannedCount: candidateIds.length,
				expandedKeywordCount: keywordCandidates.length,
				indexUsed: candidateIds.length < runtime.entries.length,
			},
			matches: outputMatches,
		};
	}
	return {
		searchOfflineApiDoc,
	};
}
