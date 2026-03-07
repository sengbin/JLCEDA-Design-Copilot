import path from 'node:path';
import fs from 'fs-extra';

/**
 * 将数字格式化为两位字符串。
 *
 * @param value - 数值
 * @returns 两位字符串
 */
function formatTwoDigits(value: number): string {
	return value.toString().padStart(2, '0');
}

/**
 * 格式化构建时间字符串。
 *
 * @param date - 时间对象
 * @returns 构建时间字符串
 */
function formatBuildTime(date: Date): string {
	const year = date.getFullYear();
	const month = formatTwoDigits(date.getMonth() + 1);
	const day = formatTwoDigits(date.getDate());
	const hour = formatTwoDigits(date.getHours());
	const minute = formatTwoDigits(date.getMinutes());
	const second = formatTwoDigits(date.getSeconds());
	return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 更新中文语言包中的构建时间。
 */
function updateBuildTime(): void {
	const localeFilePath = path.resolve(__dirname, '../locales/zh-Hans.json');
	if (!fs.existsSync(localeFilePath)) {
		throw new Error(`未找到语言包文件：${localeFilePath}`);
	}

	const localeFileContent = fs.readFileSync(localeFilePath, { encoding: 'utf-8' });
	let localeData: Record<string, unknown>;
	try {
		localeData = JSON.parse(localeFileContent) as Record<string, unknown>;
	}
	catch (error) {
		throw new Error(`解析语言包 JSON 失败：${String(error)}`);
	}

	if (Array.isArray(localeData) || localeData === null) {
		throw new Error(`语言包内容格式错误：${localeFilePath}`);
	}

	localeData['Build Time'] = `构建时间：${formatBuildTime(new Date())}`;
	fs.writeFileSync(localeFilePath, `${JSON.stringify(localeData, null, '\t')}\n`, { encoding: 'utf-8' });
}

updateBuildTime();
