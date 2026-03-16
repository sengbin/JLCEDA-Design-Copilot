// 文件说明：封装聊天页主题配色解析、计算与同步应用逻辑。
export interface RgbColor {
	r: number;
	g: number;
	b: number;
}
/**
 * 限制颜色分量到 0-255。
 * @param value - 原始颜色分量。
 * @returns 限制后的颜色分量。
 */
export function clampColorValue(value: unknown): number {
	const numberValue: any = Number(value);
	if (!Number.isFinite(numberValue)) {
		return 0;
	}
	if (numberValue < 0) {
		return 0;
	}
	if (numberValue > 255) {
		return 255;
	}
	return Math.round(numberValue);
}
/**
 * 解析 CSS rgb/rgba 颜色文本。
 * @param colorText - 颜色文本。
 * @returns RGB 对象。
 */
export function parseRgbColor(colorText: unknown): RgbColor | null {
	const text: any = String(colorText || '').trim();
	if (!text) {
		return null;
	}
	const match: any = text.match(/^rgba?\(([^)]+)\)$/i);
	if (!match || !match[1]) {
		return null;
	}
	const parts: any = match[1].split(',');
	if (parts.length < 3) {
		return null;
	}
	const r: any = Number(parts[0]);
	const g: any = Number(parts[1]);
	const b: any = Number(parts[2]);
	if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
		return null;
	}
	return { r: clampColorValue(r), g: clampColorValue(g), b: clampColorValue(b) };
}
/**
 * RGB 转 CSS 文本。
 * @param rgb - RGB 对象。
 * @returns CSS 文本。
 */
export function rgbToCss(rgb: RgbColor | null): string {
	if (!rgb) {
		return '';
	}
	return `rgb(${clampColorValue(rgb.r)}, ${clampColorValue(rgb.g)}, ${clampColorValue(rgb.b)})`;
}
/**
 * 混合两个 RGB 颜色。
 * @param colorA - 颜色A。
 * @param colorB - 颜色B。
 * @param ratio - 混合比（0-1）。
 * @returns 混合结果。
 */
export function mixRgb(colorA: RgbColor | null, colorB: RgbColor | null, ratio: unknown): RgbColor | null {
	if (!colorA || !colorB) {
		return colorA || colorB || null;
	}
	const weight: any = Math.max(0, Math.min(1, Number(ratio) || 0));
	return {
		r: (colorA.r * (1 - weight)) + (colorB.r * weight),
		g: (colorA.g * (1 - weight)) + (colorB.g * weight),
		b: (colorA.b * (1 - weight)) + (colorB.b * weight),
	};
}
/**
 * 计算 RGB 亮度。
 * @param rgb - RGB 对象。
 * @returns 亮度。
 */
export function getRgbLuminance(rgb: RgbColor | null): number {
	if (!rgb) {
		return 0;
	}
	return (0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b);
}
/**
 * 判断颜色是否偏暗。
 * @param rgb - RGB 对象。
 * @returns 是否偏暗。
 */
export function isDarkRgb(rgb: RgbColor | null): boolean {
	if (!rgb) {
		return false;
	}
	return getRgbLuminance(rgb) < 140;
}
/**
 * 从 class 名检测主题。
 * @param classNameText - class 文本。
 * @returns 主题名。
 */
export function detectThemeFromClassName(classNameText: unknown): string {
	const className: any = String(classNameText || '').toLowerCase();
	if (!className) {
		return '';
	}
	if (className.includes('dark') || className.includes('night')) {
		return 'dark';
	}
	if (className.includes('light') || className.includes('day')) {
		return 'light';
	}
	return '';
}
/**
 * 规范化主题值。
 * @param themeValue - 原始主题值。
 * @returns 规范化主题名。
 */
export function normalizeThemeValue(themeValue: unknown): string {
	const themeText: any = String(themeValue || '').trim().toLowerCase();
	if (!themeText) {
		return '';
	}
	if (themeText.includes('dark') || themeText.includes('night')) {
		return 'dark';
	}
	if (themeText.includes('light') || themeText.includes('day')) {
		return 'light';
	}
	return '';
}
/**
 * 基于主题枚举规范化主题值。
 * @param themeValue - 原始主题值。
 * @param themeEnum - 主题枚举对象。
 * @returns 规范化主题名。
 */
export function resolveThemeValue(themeValue: unknown, themeEnum: unknown): string {
	const themeEnumAny: any = themeEnum as any;
	if (themeEnum) {
		if (themeValue === themeEnumAny.DARK) {
			return 'dark';
		}
		if (themeValue === themeEnumAny.LIGHT) {
			return 'light';
		}
	}
	return normalizeThemeValue(themeValue);
}
function pushPalettePairByElement(element: Element | null, runtimeWindow: Window & typeof globalThis, palettePairs: Array<{
	bg: RgbColor;
	text: RgbColor;
}>): void {
	if (!element) {
		return;
	}
	const style: any = runtimeWindow.getComputedStyle(element);
	if (!style) {
		return;
	}
	const bg: any = parseRgbColor(style.backgroundColor);
	const text: any = parseRgbColor(style.color);
	if (bg && text) {
		palettePairs.push({ bg, text });
	}
}
/**
 * 读取宿主页面主题色板。
 * @param themeName - 目标主题名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 色板对象。
 */
export function readHostPalette(themeName: string, runtimeWindow: Window & typeof globalThis = window): {
	bg: RgbColor;
	text: RgbColor;
} | null {
	try {
		const parentWindow: any = runtimeWindow.parent || runtimeWindow;
		const parentDocument: any = parentWindow.document;
		const docElement: any = parentDocument && parentDocument.documentElement;
		const bodyElement: any = parentDocument && parentDocument.body;
		const frameElement: any = runtimeWindow.frameElement;
		const frameParentElement: any = frameElement && frameElement.parentElement;
		const palettePairs: Array<{
			bg: RgbColor;
			text: RgbColor;
		}> = [];
		pushPalettePairByElement(frameParentElement, parentWindow, palettePairs);
		let walkElement: any = frameParentElement ? frameParentElement.parentElement : null;
		let depth: any = 0;
		while (walkElement && depth < 8) {
			pushPalettePairByElement(walkElement, parentWindow, palettePairs);
			walkElement = walkElement.parentElement;
			depth += 1;
		}
		pushPalettePairByElement(bodyElement, parentWindow, palettePairs);
		pushPalettePairByElement(docElement, parentWindow, palettePairs);
		if (palettePairs.length > 0) {
			const isDarkTheme: any = themeName === 'dark';
			if (isDarkTheme) {
				const darkPair: any = palettePairs.find((pair) => {
					const bgLuminance = getRgbLuminance(pair.bg);
					const textLuminance = getRgbLuminance(pair.text);
					return bgLuminance >= 20 && bgLuminance <= 110 && textLuminance >= 140;
				});
				if (darkPair) {
					return darkPair;
				}
				const fallbackDarkPair: any = palettePairs.find((pair) => {
					return getRgbLuminance(pair.bg) < 130;
				});
				if (fallbackDarkPair) {
					return fallbackDarkPair;
				}
			}
			if (themeName === 'light') {
				const lightPair: any = palettePairs.find((pair) => {
					const bgLuminance = getRgbLuminance(pair.bg);
					const textLuminance = getRgbLuminance(pair.text);
					return bgLuminance >= 185 && textLuminance <= 120;
				});
				if (lightPair) {
					return lightPair;
				}
				const fallbackLightPair: any = palettePairs.find((pair) => {
					return getRgbLuminance(pair.bg) >= 130;
				});
				if (fallbackLightPair) {
					return fallbackLightPair;
				}
			}
			return palettePairs[0];
		}
	}
	catch { }
	if (themeName === 'dark') {
		return {
			bg: { r: 47, g: 52, b: 60 },
			text: { r: 221, g: 228, b: 236 },
		};
	}
	if (themeName === 'light') {
		return {
			bg: { r: 245, g: 247, b: 251 },
			text: { r: 31, g: 41, b: 55 },
		};
	}
	return null;
}
/**
 * 通过 EDA API 读取当前主题。
 * @param applyTheme - 主题应用函数。
 * @returns 同步可得的主题名称。
 */
export function detectThemeFromEdaApi(applyTheme: unknown): string {
	const applyThemeFn: any = typeof applyTheme === 'function' ? applyTheme : null;
	try {
		const parentWindow: any = window.parent || window;
		const topWindow: any = window.top || window;
		const edaInstance: any = (window as any).eda || parentWindow.eda || topWindow.eda;
		if (!edaInstance || !edaInstance.sys_Window || typeof edaInstance.sys_Window.getCurrentTheme !== 'function') {
			return '';
		}
		const themeValue: any = edaInstance.sys_Window.getCurrentTheme();
		const themeEnum: any = edaInstance.ESYS_Theme || parentWindow.ESYS_Theme || topWindow.ESYS_Theme;
		if (themeValue && typeof themeValue.then === 'function') {
			themeValue.then((resolvedValue?: any) => {
				const resolvedTheme: any = resolveThemeValue(resolvedValue, themeEnum);
				if (resolvedTheme && applyThemeFn) {
					applyThemeFn(resolvedTheme);
				}
			}).catch(() => { });
			return '';
		}
		const normalizedTheme: any = resolveThemeValue(themeValue, themeEnum);
		if (normalizedTheme) {
			return normalizedTheme;
		}
	}
	catch { }
	return '';
}
/**
 * 综合宿主环境信息检测主题。
 * @param applyTheme - 主题应用函数。
 * @returns 主题名称。
 */
export function detectThemeFromEda(applyTheme: unknown): string {
	const edaTheme: any = detectThemeFromEdaApi(applyTheme);
	if (edaTheme) {
		return edaTheme;
	}
	try {
		const parentWindow: any = window.parent || window;
		const parentDocument: any = parentWindow.document;
		const documentElement: any = parentDocument.documentElement;
		const bodyElement: any = parentDocument.body;
		const classTheme: any = detectThemeFromClassName((documentElement && documentElement.className) || '')
			|| detectThemeFromClassName((bodyElement && bodyElement.className) || '');
		if (classTheme) {
			return classTheme;
		}
		const docStyle: any = parentWindow.getComputedStyle(documentElement);
		if (docStyle && typeof docStyle.colorScheme === 'string') {
			const scheme: any = docStyle.colorScheme.toLowerCase();
			if (scheme.includes('dark')) {
				return 'dark';
			}
			if (scheme.includes('light')) {
				return 'light';
			}
		}
		const bodyStyle: any = bodyElement ? parentWindow.getComputedStyle(bodyElement) : null;
		const bodyBg: any = bodyStyle ? bodyStyle.backgroundColor : '';
		const docBg: any = docStyle ? docStyle.backgroundColor : '';
		const bgColor: any = bodyBg || docBg;
		if (bgColor) {
			return isDarkRgb(parseRgbColor(bgColor)) ? 'dark' : 'light';
		}
	}
	catch { }
	const hostPalette: any = readHostPalette('');
	if (hostPalette && hostPalette.bg) {
		return isDarkRgb(hostPalette.bg) ? 'dark' : 'light';
	}
	try {
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}
	}
	catch { }
	return 'dark';
}
/**
 * 建立主题同步监听。
 * @param applyTheme - 主题应用函数。
 */
export function setupThemeSync(applyTheme: unknown): void {
	const applyThemeFn: any = typeof applyTheme === 'function' ? applyTheme : null;
	if (!applyThemeFn) {
		return;
	}
	const updateTheme: any = function () {
		applyThemeFn(detectThemeFromEda(applyThemeFn));
	};
	updateTheme();
	try {
		const parentWindow: any = window.parent || window;
		const parentDocument: any = parentWindow.document;
		const observer: any = new MutationObserver(() => {
			updateTheme();
		});
		if (parentDocument && parentDocument.documentElement) {
			observer.observe(parentDocument.documentElement, {
				attributes: true,
				attributeFilter: ['class', 'style', 'data-theme'],
			});
		}
		if (parentDocument && parentDocument.body) {
			observer.observe(parentDocument.body, {
				attributes: true,
				attributeFilter: ['class', 'style', 'data-theme'],
			});
		}
	}
	catch { }
	try {
		if (window.matchMedia) {
			const media: any = window.matchMedia('(prefers-color-scheme: dark)');
			const handler: any = function () {
				updateTheme();
			};
			if (media.addEventListener) {
				media.addEventListener('change', handler);
			}
			else if (media.addListener) {
				media.addListener(handler);
			}
		}
	}
	catch { }
	const intervalId: any = window.setInterval(() => {
		updateTheme();
	}, 1000);
	window.addEventListener('beforeunload', () => {
		window.clearInterval(intervalId);
	});
}
/**
 * 应用页面主题。
 * @param themeName - 主题名称。
 */
export function applyTheme(themeName: unknown): void {
	const normalizedThemeValue: any = normalizeThemeValue(themeName);
	const normalizedTheme: any = normalizedThemeValue === 'light' ? 'light' : 'dark';
	document.documentElement.setAttribute('data-theme', normalizedTheme);
}
