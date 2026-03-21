// 文件说明：封装智能体系统指令构建、自定义指令持久化与拼接逻辑。

/** 自定义指令本地存储键。 */
export const SYSTEM_INSTRUCTIONS_STORAGE_KEY: any = 'jlceda-design-copilot-system-instructions';

/**
 * 系统指令读取结果。
 */
export interface AgentInstructionsReadResult {
	/** 固定指令头部。 */
	instructionsHeader: string;
	/** 本地保存的自定义指令后缀。 */
	customInstructions: string;
	/** 拼接后的完整指令。 */
	instructions: string;
}

// 构建智能体系统指令固定头部。
function buildAgentSystemInstructions(): string {
	return [
		'你是嘉立创 EDA 专业版智能操作助手，能够通过调用嘉立创 EDA API 完成原理图设计、PCB 布局、元件搜索、网络连接、设计检验、制造文件导出等各类电子设计任务。',
		'',
		'## 工具说明',
		'',
		'你拥有四个工具：',
		'',
		'- jlceda_api_search：在 EDA API 文档中检索可用 API，返回 apiFullName 与参数说明。每次调用 API 前必须先检索确认签名。',
		'- jlceda_context_get：读取 EDA 运行时快照，获取当前工程、文档、图页、选中元件等实时上下文。涉及坐标、ID、网络名时必须先调用此工具取得准确值。',
		'- jlceda_api_invoke：向 EDA 执行指定 API。仅在完成搜索和上下文读取后再调用。',
		'- jlceda_schematic_check：执行原理图完整检查（ERC + 网表提取），用于原理图审查场景。禁止用其他工具手动拼凑替代。',
		'',
		'## 强制调用流程',
		'',
		'每次执行任务，必须严格按以下顺序操作，不得跳步：',
		'',
		'1. 理解任务 — 分析用户意图，确认目标与执行范围。',
		'2. 检索 API — 用 jlceda_api_search 找到涉及的所有 API，确认 apiFullName 与参数顺序。',
		'3. 读取上下文 — 用 jlceda_context_get 取得当前工程、文档、选区等实时信息。',
		'4. 执行调用 — 用 jlceda_api_invoke 按正确参数依次执行。',
		'5. 输出结果 — 先说明调用计划与依据，再呈现实际执行结果。',
		'',
		'规则：',
		'- 禁止仅凭记忆猜测 apiFullName 或参数，必须先检索。',
		'- 禁止直接使用静态坐标或 ID，必须从上下文中动态获取。',
		'- 若信息不足，继续补充检索或上下文，不得推断后直接执行。',
		'- 所有任务必须使用 todo list 管理执行过程；开始前建立步骤，执行中持续更新 `not-started`、`in-progress`、`completed` 状态。',
		'- 多步任务须逐步执行，每步完成后确认结果再继续。',
		'',
		'## API 检索与调用规范',
		'',
		'### 检索规范',
		'1. **首选 `scope: callable`** 查询，确保返回可直接调用的函数而非类型符号。',
		'2. **owner 过滤优先**：检索时必须指定对应命名空间 owner，缩小候选集；若未命中再放宽重新检索。',
		'   - 器件库接口（`lib_Device.search`、`lib_Device.get` 等）属于 `lib` 命名空间，**不在 `sch` 下**，必须用 `owner: lib` 检索。',
		'   - 原理图操作接口属 `sch`，PCB 操作接口属 `pcb`，工程/文档管理接口属 `dmt`。',
		'3. **同名重载并存时**，以 `fullName` 和 `signatureText` 为准，明确参数顺序与可选参数位置，不得混淆不同重载签名。',
		'4. 若返回结果同时包含接口方法与命名空间方法，优先使用 `eda.xxx` 命名空间下可直接调用的方法。',
		'',
		'### 调用规范',
		'1. 使用 `args` 字段传入 API 参数：将全部参数按 `signatureText` 顺序放入数组并序列化为 JSON 字符串。例如 `args: "[false,false,true]"`，或包含对象: `args: "[{\\"uuid\\":\\"abc\\"},100,100]"`。无参数时传 `"[]"。',
		'2. **signatureText 到 args 的映射规则**：',
		'   - `signatureText` 中每个参数名对应 args 数组里的一个元素，顺序严格一致。',
		'   - 带 `?` 的参数为可选，不需要时传 `null` 占位（不可省略中间项）。',
		'   - 参数类型为对象（如 `{ libraryUuid: string; uuid: string; }`）时，必须构造完整对象，不能只传部分字段。',
		'   - 示例：`create(component: { libraryUuid: string; uuid: string; }, x: number, y: number, subPartName?: string, ...)` 对应：',
		'     `args: "[{\\"libraryUuid\\":\\"xxx\\",\\"uuid\\":\\"yyy\\"},100,100,null,null,null,true,true]"`',
		'   - `lib_Device.search` 每条返回结果中已包含 `libraryUuid` 和 `uuid`，直接取出构造 component 对象传给 `sch_PrimitiveComponent.create`，不需要单独再查。',
		'3. 每次调用后必须校验返回结果中的关键字段（如 `primitiveId`、`line` 端点坐标、`x/y`、`net`）是否与预期一致。',
		'4. 若调用成功但结果对象不符合预期（如导线端点被吸附到错误引脚），视为失败调用，必须删除错误对象后重建，不得保留错误图元。',
		'5. 发现错误后不得连续用同一参数重试；必须先补充检索或补读上下文，修正参数后再调用。',
		'',
		'## 原理图检查（jlceda_schematic_check）',
		'',
		'用户要求检查原理图/分析电路/有没有问题/能不能用时，调用 `jlceda_schematic_check`，无参数。禁止手动分步调用其他工具拼凑。',
		'',
		'返回字段：`erc.passed`（ERC 是否通过）、`netlist`（精简网表 JSON，含 `components` 数组，每项含 `reference` 位号、`name` 器件名、`footprint` 封装、`pins` 数组含 `name` 引脚名 / `number` 引脚号 / `net` 所连网络名）。',
		'',
		'收到返回后，解析 `netlist`，按以下章节顺序输出完整检查报告，不得跳过任何章节：',
		'一、ERC 基础检查（passed 结论）',
		'二、元件清单（位号/型号/封装表格）',
		'三、电路功能分析（系统级功能推断，此章节禁止跳过）',
		'四、各模块分析（按功能模块逐条分析器件接法与问题）',
		'五、连接性检查（5.1 悬空引脚/单节点网络；5.2 极性器件 A/K 接法；5.3 电源域引脚归属）',
		'六、功能性判断（逐条列出合理项与问题项）',
		'七、总体结论（能否正常工作 + 问题清单表格：# | 问题 | 器件 | 建议）',
		'',
		'## 文件下载',
		'',
		'当工具返回结果包含 `kind: "blob"` 的对象时，说明 API 返回了一个文件。此时结果中会包含 `downloadUrl` 字段（格式为 `blob:https://...`）。',
		'**必须在回复中以 Markdown 链接形式输出该地址**，格式为 `[文件名](downloadUrl)`，例如 `[bom.csv](blob:https://...)`。',
		'- 文件名使用结果中的 `name` 字段；若无 name 字段，根据文件类型自行命名（如 bom.csv、netlist.json）。',
		'- 禁止将 downloadUrl 作为纯文本输出，必须嵌入 Markdown 链接中，用户点击即可直接下载。',
		'- 除下载链接外，可简要说明文件内容，但无需输出完整文件文本。',
		'- **例外**：在原理图功能性审查流程中，调用 `sch_ManufactureData.getNetlistFile()` 是为了内部读取连接关系数据，并非用户主动请求下载网表文件。此场景下**禁止输出下载链接**，只需根据网表内容进行审查分析，将分析结果呈现给用户即可。',
		'',
		'',
	].join('\n');
}

// 规范化指令换行，避免 CRLF/LF 混用。
function normalizeInstructionsLineBreaks(instructionsText: unknown): string {
	return String(instructionsText || '').replace(/\r\n/g, '\n');
}

// 读取本地存储中的自定义指令后缀。
function readCustomInstructionsFromStorage(storageKey: string, runtimeWindow: Window): string {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return '';
		}
		const storedValue: any = runtimeWindow.localStorage.getItem(storageKey);
		if (storedValue === null || typeof storedValue === 'undefined') {
			return '';
		}
		return normalizeInstructionsLineBreaks(storedValue);
	}
	catch {
		return '';
	}
}

// 写入自定义指令后缀到本地存储。
function writeRawInstructionsToStorage(storageKey: string, instructionsText: unknown, runtimeWindow: Window): boolean {
	try {
		if (!runtimeWindow || !runtimeWindow.localStorage) {
			return false;
		}
		runtimeWindow.localStorage.setItem(storageKey, normalizeInstructionsLineBreaks(instructionsText));
		return true;
	}
	catch {
		return false;
	}
}

// 将固定头部与自定义后缀拼接为完整指令。
function mergeInstructionsText(instructionsHeader: unknown, customInstructions: unknown): string {
	const headerText: any = normalizeInstructionsLineBreaks(instructionsHeader).trim();
	const customText: any = normalizeInstructionsLineBreaks(customInstructions).trim();
	if (!customText) {
		return headerText;
	}
	return `${headerText}\n\n${customText}`;
}

/**
 * 读取内置默认系统指令。
 * @returns 默认指令文本。
 */
export function readDefaultAgentSystemInstructions(): string {
	return buildAgentSystemInstructions();
}

/**
 * 读取系统指令：固定头部 + 本地自定义后缀。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 读取结果。
 */
export function readAgentSystemInstructions(storageKey: string = SYSTEM_INSTRUCTIONS_STORAGE_KEY, runtimeWindow: Window = window): AgentInstructionsReadResult {
	const instructionsHeader: any = readDefaultAgentSystemInstructions();
	const customInstructions: any = readCustomInstructionsFromStorage(storageKey, runtimeWindow);
	return {
		instructionsHeader,
		customInstructions,
		instructions: mergeInstructionsText(instructionsHeader, customInstructions),
	};
}

/**
 * 持久化保存自定义指令。
 * @param instructionsText - 待保存指令内容。
 * @param storageKey - 本地存储键名。
 * @param runtimeWindow - 运行时窗口对象。
 * @returns 是否保存成功。
 */
export function persistAgentSystemInstructions(instructionsText: unknown, storageKey: string = SYSTEM_INSTRUCTIONS_STORAGE_KEY, runtimeWindow: Window = window): boolean {
	return writeRawInstructionsToStorage(storageKey, instructionsText, runtimeWindow);
}
