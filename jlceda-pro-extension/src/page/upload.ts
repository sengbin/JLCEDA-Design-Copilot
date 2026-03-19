// 文件说明：封装图片与文档上传相关的数据处理与消息内容组装逻辑。
// 文档附件数量上限。
export const DOCUMENT_ATTACHMENT_LIMIT = 10;
/**
 * 将 Blob 读取为 DataURL。
 * @param blob - 图片 Blob/File 对象。
 * @returns DataURL 字符串。
 */
export function readBlobAsDataUrl(blob?: any) {
	return new Promise((resolve?: any, reject?: any) => {
		const reader: any = new FileReader();
		reader.onload = function () {
			resolve(String(reader.result || ''));
		};
		reader.onerror = function () {
			reject(reader.error || new Error('【诊断信息】读取图片失败'));
		};
		reader.readAsDataURL(blob);
	});
}
/**
 * 根据 MIME 类型推断图片扩展名。
 * @param mimeType - MIME 类型。
 * @returns 图片扩展名。
 */
export function guessImageExtension(mimeType?: any) {
	const normalizedType: any = String(mimeType || '').toLowerCase();
	if (normalizedType === 'image/jpeg') {
		return 'jpg';
	}
	if (normalizedType === 'image/webp') {
		return 'webp';
	}
	if (normalizedType === 'image/gif') {
		return 'gif';
	}
	if (normalizedType === 'image/bmp') {
		return 'bmp';
	}
	if (normalizedType === 'image/svg+xml') {
		return 'svg';
	}
	return 'png';
}
/**
 * 克隆并清洗图片条目。
 * @param entries - 原始图片条目数组。
 * @returns 清洗后的图片条目数组。
 */
export function cloneImageEntries(entries?: any) {
	const sourceEntries: any = Array.isArray(entries) ? entries : [];
	return sourceEntries
		.filter((item?: any) => {
			return item && typeof item === 'object' && item.dataUrl;
		})
		.map((item?: any) => {
			return {
				id: String(item.id || ''),
				name: String(item.name || '').trim(),
				dataUrl: String(item.dataUrl || ''),
				mimeType: String(item.mimeType || '').trim(),
			};
		});
}
/**
 * 生成图片条目唯一标识。
 * @returns 唯一标识字符串。
 */
export function createImageEntryId() {
	return `image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
/**
 * 判断是否为剪贴板常见通用文件名（通常代表直接截图）。
 * @param fileName - 原始文件名。
 * @returns 是否为通用截图名。
 */
export function isGenericClipboardImageName(fileName?: any) {
	const normalizedName: any = String(fileName || '').trim().toLowerCase();
	if (!normalizedName) {
		return true;
	}
	if (/^image(?:\s*\(\d+\))?\.(?:png|jpe?g|webp|gif|bmp|svg)$/i.test(normalizedName)) {
		return true;
	}
	if (/^pasted\s*image(?:\s*\d+)?(?:\.[a-z0-9]+)?$/i.test(normalizedName)) {
		return true;
	}
	return false;
}
/**
 * 解析上传图片显示名称。
 * @param fileObject - 上传文件对象。
 * @param index - 文件索引。
 * @param sourceType - 来源类型（paste/file）。
 * @param batchToken - 同批次令牌，用于稳定命名。
 * @param pasteImageNumberStart - 剪贴板截图命名起始编号。
 * @returns 图片名称。
 */
export function resolveImageEntryName(fileObject?: any, index?: any, sourceType?: any, batchToken?: any, pasteImageNumberStart?: any) {
	const mimeType: any = String(fileObject && fileObject.type ? fileObject.type : 'image/png').toLowerCase();
	const extension: any = guessImageExtension(mimeType);
	const rawName: any = String(fileObject && fileObject.name ? fileObject.name : '').trim();
	const normalizedSourceType: any = String(sourceType || '').trim().toLowerCase();
	const safeBatchToken: any = String(batchToken || Date.now()).replace(/[^\w-]/g, '');
	const displayIndex: any = Number(index) + 1;
	const pasteStartNumber: any = Number.isFinite(Number(pasteImageNumberStart))
		? Math.max(1, Math.floor(Number(pasteImageNumberStart)))
		: 1;
	if (normalizedSourceType === 'paste' && isGenericClipboardImageName(rawName)) {
		return `屏幕截图 ${pasteStartNumber + Number(index)}`;
	}
	if (rawName) {
		return rawName;
	}
	const fallbackPrefix: any = normalizedSourceType === 'paste' ? '粘贴图片' : '图片';
	return `${fallbackPrefix}-${safeBatchToken}-${displayIndex}.${extension}`;
}
/**
 * 将上传图片转换为内部条目结构。
 * @param fileObject - 上传文件对象。
 * @param index - 文件索引。
 * @param sourceType - 来源类型（paste/file）。
 * @param batchToken - 同批次令牌，用于稳定命名。
 * @param pasteImageNumberStart - 剪贴板截图命名起始编号。
 * @returns 标准化图片条目。
 */
export async function convertImageFileToEntry(fileObject?: any, index?: any, sourceType?: any, batchToken?: any, pasteImageNumberStart?: any) {
	const mimeType: any = String(fileObject && fileObject.type ? fileObject.type : 'image/png').toLowerCase();
	const imageName: any = resolveImageEntryName(fileObject, index, sourceType, batchToken, pasteImageNumberStart);
	const dataUrl: any = await readBlobAsDataUrl(fileObject);
	return {
		id: createImageEntryId(),
		name: imageName,
		dataUrl,
		mimeType: mimeType || 'image/png',
	};
}
/**
 * 构建用户消息在模型接口中的内容结构。
 * @param userText - 用户输入文本。
 * @param imageEntries - 图片条目数组。
 * @param imagePayloadMode - 图片负载模式。
 * @param documentEntries - 文档条目数组。
 * @returns 模型接口所需消息内容。
 */
export function buildUserMessageContentForApi(userText?: any, imageEntries?: any, imagePayloadMode?: any, documentEntries?: any) {
	const normalizedText: any = String(userText || '').trim();
	const normalizedImages: any = cloneImageEntries(imageEntries);
	const normalizedDocs: any = cloneDocumentEntries(documentEntries);
	const lines: any = [];
	if (normalizedText) {
		lines.push(normalizedText);
	}
	if (normalizedImages.length > 0) {
		lines.push('附加图片：');
		for (let index: any = 0; index < normalizedImages.length; index += 1) {
			const imageEntry: any = normalizedImages[index];
			lines.push(`- ${imageEntry.name || (`图片${index + 1}`)}`);
		}
	}
	// 将文档内容拼接到消息文本中，供所有 API 格式通用。
	const docTextBlocks: any = [];
	if (normalizedDocs.length > 0) {
		lines.push('附加文档：');
		for (let index: any = 0; index < normalizedDocs.length; index += 1) {
			const docEntry: any = normalizedDocs[index];
			lines.push(`- ${docEntry.name || (`文档${index + 1}`)}`);
		}
		for (let index: any = 0; index < normalizedDocs.length; index += 1) {
			const docEntry: any = normalizedDocs[index];
			const docName: any = docEntry.name || (`文档${index + 1}`);
			docTextBlocks.push(`---\n文件: ${docName}\n---\n${docEntry.content}`);
		}
	}
	const summaryText: any = lines.join('\n').trim();
	const fullTextWithDocs: any = docTextBlocks.length > 0
		? [summaryText, ...docTextBlocks].join('\n\n').trim()
		: summaryText;
	if (!imagePayloadMode || normalizedImages.length === 0) {
		return fullTextWithDocs;
	}
	const content: any = [];
	for (let index: any = 0; index < normalizedImages.length; index += 1) {
		const imageEntry: any = normalizedImages[index];
		if (!imageEntry.dataUrl) {
			continue;
		}
		const imageContent: any = {
			type: imagePayloadMode === 'input_image' ? 'input_image' : 'image_url',
		};
		if (imagePayloadMode === 'input_image') {
			imageContent.image_url = imageEntry.dataUrl;
		}
		else {
			imageContent.image_url = {
				url: imageEntry.dataUrl,
			};
		}
		if (imageEntry.name) {
			if (typeof imageContent.image_url === 'object') {
				imageContent.image_url.name = imageEntry.name;
			}
		}
		if (imageEntry.mimeType) {
			if (typeof imageContent.image_url === 'object') {
				imageContent.image_url.mime_type = imageEntry.mimeType;
			}
		}
		content.push(imageContent);
	}
	if (fullTextWithDocs) {
		content.push({
			type: imagePayloadMode === 'input_image' ? 'input_text' : 'text',
			text: fullTextWithDocs,
		});
	}
	if (content.length === 0) {
		content.push({
			type: imagePayloadMode === 'input_image' ? 'input_text' : 'text',
			text: fullTextWithDocs || '[图片]',
		});
	}
	return content;
}
/**
 * 将 Blob 读取为文本。
 * @param blob - 文件 Blob/File 对象。
 * @returns UTF-8 文本字符串。
 */
export function readBlobAsText(blob?: any) {
	return new Promise((resolve?: any, reject?: any) => {
		const reader: any = new FileReader();
		reader.onload = function () {
			resolve(String(reader.result || ''));
		};
		reader.onerror = function () {
			reject(reader.error || new Error('【诊断信息】读取文档失败'));
		};
		reader.readAsText(blob, 'utf-8');
	});
}
/**
 * 生成文档条目唯一标识。
 * @returns 唯一标识字符串。
 */
export function createDocumentEntryId() {
	return `document-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
/**
 * 克隆并清洗文档条目。
 * @param entries - 原始文档条目数组。
 * @returns 清洗后的文档条目数组。
 */
export function cloneDocumentEntries(entries?: any) {
	const sourceEntries: any = Array.isArray(entries) ? entries : [];
	return sourceEntries
		.filter((item?: any) => {
			return item && typeof item === 'object' && typeof item.content === 'string';
		})
		.map((item?: any) => {
			return {
				id: String(item.id || ''),
				name: String(item.name || '').trim(),
				content: String(item.content || ''),
				mimeType: String(item.mimeType || '').trim(),
			};
		});
}
/**
 * 判断文档扩展名是否为纯文本可读格式。
 * @param fileName - 文件名。
 * @returns 是否为纯文本格式。
 */
/**
 * 将上传文档文件转换为内部条目结构。
 * @param fileObject - 上传文件对象。
 * @returns 标准化文档条目。
 */
export async function convertDocumentFileToEntry(fileObject?: any) {
	const mimeType: any = String(fileObject && fileObject.type ? fileObject.type : 'text/plain').toLowerCase();
	const fileName: any = String(fileObject && fileObject.name ? fileObject.name : '').trim() || '文档';
	const content: any = await readBlobAsText(fileObject);
	return {
		id: createDocumentEntryId(),
		name: fileName,
		content: String(content || ''),
		mimeType: mimeType || 'text/plain',
	};
}
/**
 * 收集剪贴板中的图片文件。
 * @param clipboardData - 剪贴板数据对象。
 * @returns 图片文件数组。
 */
export function collectClipboardImageFiles(clipboardData?: any) {
	const imageFiles: any = [];
	if (!clipboardData) {
		return imageFiles;
	}
	const fileList: any = clipboardData.files ? Array.from(clipboardData.files) : [];
	for (let index: any = 0; index < fileList.length; index += 1) {
		const fileObject: any = fileList[index];
		if (!fileObject || String(fileObject.type || '').toLowerCase().indexOf('image/') !== 0) {
			continue;
		}
		imageFiles.push(fileObject);
	}
	if (imageFiles.length > 0) {
		return imageFiles;
	}
	const itemList: any = clipboardData.items ? Array.from(clipboardData.items) : [];
	for (let index: any = 0; index < itemList.length; index += 1) {
		const item: any = itemList[index];
		if (!item || item.kind !== 'file' || String(item.type || '').toLowerCase().indexOf('image/') !== 0) {
			continue;
		}
		const fileObject: any = item.getAsFile();
		if (fileObject) {
			imageFiles.push(fileObject);
		}
	}
	return imageFiles;
}
