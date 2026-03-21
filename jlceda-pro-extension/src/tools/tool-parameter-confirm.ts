// 文件说明：工具参数确认协议与聊天确认面板渲染能力。

export const TOOL_PARAMETER_CONFIRM_PROTOCOL: string = 'tool-parameter-confirm/v1';

export interface ToolParameterConfirmOption {
	label: string;
	value: string;
}

export interface ToolParameterConfirmField {
	key: string;
	label: string;
	type: 'select' | 'text' | 'number';
	required?: boolean;
	defaultValue?: string | number;
	placeholder?: string;
	options?: ToolParameterConfirmOption[];
}

export interface ToolParameterConfirmRequest {
	protocol: string;
	title: string;
	description?: string;
	confirmButtonText?: string;
	cancelButtonText?: string;
	fields: ToolParameterConfirmField[];
}

interface RequestConfirmPanelOptions {
	messageNode: HTMLElement;
	confirmRequest: ToolParameterConfirmRequest;
	rawToolArguments: unknown;
	abortSignal?: AbortSignal | null;
}

interface RequestConfirmPanelResult {
	confirmed: boolean;
	mergedArgumentsText?: string;
	values?: Record<string, unknown>;
}

const CONFIRM_PANEL_STYLE_ID: string = 'jlceda-tool-parameter-confirm-style';

const CONFIRM_PANEL_STYLE_TEXT: string = [
	`.tool-parameter-confirm-panel {`,
	`\tmargin-top: 10px;`,
	`\tpadding: 12px;`,
	`\tborder: 1px solid var(--tool-border, #d2d2d2);`,
	`\tborder-radius: 8px;`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`}`,
	`.tool-parameter-confirm-title {`,
	`\tfont-size: 13px;`,
	`\tfont-weight: 600;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tmargin-bottom: 6px;`,
	`}`,
	`.tool-parameter-confirm-desc {`,
	`\tfont-size: 12px;`,
	`\tline-height: 1.5;`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`\tmargin-bottom: 8px;`,
	`}`,
	`.tool-parameter-confirm-fields {`,
	`\tdisplay: grid;`,
	`\tgrid-template-columns: repeat(auto-fit, minmax(210px, 1fr));`,
	`\tgap: 8px;`,
	`}`,
	`.tool-parameter-confirm-field {`,
	`\tdisplay: flex;`,
	`\tflex-direction: column;`,
	`\tgap: 4px;`,
	`}`,
	`.tool-parameter-confirm-label {`,
	`\tfont-size: 12px;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`}`,
	`.tool-parameter-confirm-control {`,
	`\theight: 30px;`,
	`\tborder: 1px solid var(--input-border, #d0d0d0);`,
	`\tborder-radius: 6px;`,
	`\tpadding: 0 8px;`,
	`\tfont-size: 12px;`,
	`\toutline: none;`,
	`\tcolor: var(--text-primary, #2f2f2f);`,
	`\tbackground: var(--panel-bg, #ffffff);`,
	`}`,
	`.tool-parameter-confirm-control:focus-visible {`,
	`\tborder-color: var(--chat-input-box-focus-border, #1890ff);`,
	`}`,
	`.tool-parameter-confirm-error {`,
	`\tmargin-top: 8px;`,
	`\tfont-size: 12px;`,
	`\tcolor: #c0392b;`,
	`\tmin-height: 16px;`,
	`}`,
	`.tool-parameter-confirm-actions {`,
	`\tmargin-top: 8px;`,
	`\tdisplay: flex;`,
	`\tgap: 8px;`,
	`\tjustify-content: flex-end;`,
	`}`,
	`.tool-parameter-confirm-button {`,
	`\theight: 30px;`,
	`\tpadding: 0 12px;`,
	`\tborder-radius: 6px;`,
	`\tborder: 1px solid var(--input-border, #d0d0d0);`,
	`\tfont-size: 12px;`,
	`\tcursor: pointer;`,
	`}`,
	`.tool-parameter-confirm-button.confirm {`,
	`\tbackground: var(--button-bg, #7a7a7a);`,
	`\tcolor: #ffffff;`,
	`\tborder-color: var(--button-bg, #7a7a7a);`,
	`}`,
	`.tool-parameter-confirm-button.confirm:hover {`,
	`\tbackground: var(--button-hover-bg, #666666);`,
	`\tborder-color: var(--button-hover-bg, #666666);`,
	`}`,
	`.tool-parameter-confirm-button.cancel {`,
	`\tbackground: transparent;`,
	`\tcolor: var(--text-secondary, #4a4a4a);`,
	`}`,
	`.tool-parameter-confirm-button:disabled {`,
	`\topacity: 0.6;`,
	`\tcursor: not-allowed;`,
	`}`,
].join('\n');

// 注入参数确认面板样式。
function ensureConfirmPanelStyleMounted(): void {
	if (document.getElementById(CONFIRM_PANEL_STYLE_ID)) {
		return;
	}
	const styleElement: HTMLStyleElement = document.createElement('style');
	styleElement.id = CONFIRM_PANEL_STYLE_ID;
	styleElement.textContent = CONFIRM_PANEL_STYLE_TEXT;
	document.head.appendChild(styleElement);
}

// 判断输入值是否为对象。
function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 解析工具返回中的确认协议。
export function parseToolParameterConfirmRequest(toolResult?: unknown): ToolParameterConfirmRequest | null {
	if (!isObjectRecord(toolResult)) {
		return null;
	}
	const confirmationObject: unknown = toolResult.confirmation;
	if (!isObjectRecord(confirmationObject)) {
		return null;
	}
	if (String(confirmationObject.protocol || '').trim() !== TOOL_PARAMETER_CONFIRM_PROTOCOL) {
		return null;
	}
	const fieldList: ToolParameterConfirmField[] = [];
	if (Array.isArray(confirmationObject.fields)) {
		for (let index = 0; index < confirmationObject.fields.length; index += 1) {
			const item: unknown = confirmationObject.fields[index];
			if (!isObjectRecord(item)) {
				continue;
			}
			const fieldType: any = String(item.type || '').trim().toLowerCase();
			if (fieldType !== 'select' && fieldType !== 'text' && fieldType !== 'number') {
				continue;
			}
			const keyText: string = String(item.key || '').trim();
			const labelText: string = String(item.label || '').trim();
			if (!keyText || !labelText) {
				continue;
			}
			const optionList: ToolParameterConfirmOption[] = [];
			if (Array.isArray(item.options)) {
				for (let optionIndex = 0; optionIndex < item.options.length; optionIndex += 1) {
					const optionItem: unknown = item.options[optionIndex];
					if (!isObjectRecord(optionItem)) {
						continue;
					}
					const optionLabel: string = String(optionItem.label || '').trim();
					const optionValue: string = String(optionItem.value || '').trim();
					if (!optionLabel || !optionValue) {
						continue;
					}
					optionList.push({
						label: optionLabel,
						value: optionValue,
					});
				}
			}
			fieldList.push({
				key: keyText,
				label: labelText,
				type: fieldType,
				required: Boolean(item.required),
				defaultValue: item.defaultValue !== undefined ? (item.defaultValue as string | number) : undefined,
				placeholder: String(item.placeholder || '').trim() || undefined,
				options: optionList.length > 0 ? optionList : undefined,
			});
		}
	}
	if (fieldList.length < 1) {
		return null;
	}
	return {
		protocol: TOOL_PARAMETER_CONFIRM_PROTOCOL,
		title: String(confirmationObject.title || '').trim() || '请确认工具参数',
		description: String(confirmationObject.description || '').trim() || undefined,
		confirmButtonText: String(confirmationObject.confirmButtonText || '').trim() || '确定',
		cancelButtonText: String(confirmationObject.cancelButtonText || '').trim() || '取消',
		fields: fieldList,
	};
}

// 将原始工具参数与确认值合并并序列化。
export function mergeToolArgumentsWithConfirmedValues(rawToolArguments: unknown, values: Record<string, unknown>): string {
	let parsed: Record<string, unknown> = {};
	if (typeof rawToolArguments === 'string') {
		const text: string = rawToolArguments.trim();
		if (text) {
			try {
				const objectValue: unknown = JSON.parse(text);
				if (isObjectRecord(objectValue)) {
					parsed = objectValue;
				}
			}
			catch { }
		}
	}
	else if (isObjectRecord(rawToolArguments)) {
		parsed = { ...rawToolArguments };
	}
	return JSON.stringify({
		...parsed,
		...values,
	});
}

// 将字段输入转换为业务值。
function normalizeFieldValue(field: ToolParameterConfirmField, rawValue: string): unknown {
	if (field.type === 'number') {
		const numberValue: number = Number(rawValue);
		return Number.isFinite(numberValue) ? numberValue : rawValue;
	}
	return rawValue;
}

// 在工具消息节点内请求用户确认参数。
export async function requestToolParameterConfirmPanel(options: RequestConfirmPanelOptions): Promise<RequestConfirmPanelResult> {
	ensureConfirmPanelStyleMounted();
	const messageNode: HTMLElement = options.messageNode;
	const confirmRequest: ToolParameterConfirmRequest = options.confirmRequest;
	const targetContainer: HTMLElement = (messageNode.querySelector('.fold-content') as HTMLElement | null) || messageNode;

	return await new Promise<RequestConfirmPanelResult>((resolve) => {
		let resolved: boolean = false;
		const fieldControlMap: Map<string, HTMLInputElement | HTMLSelectElement> = new Map();
		const panelElement: HTMLDivElement = document.createElement('div');
		panelElement.className = 'tool-parameter-confirm-panel';

		const titleElement: HTMLDivElement = document.createElement('div');
		titleElement.className = 'tool-parameter-confirm-title';
		titleElement.textContent = confirmRequest.title;
		panelElement.appendChild(titleElement);

		if (confirmRequest.description) {
			const descriptionElement: HTMLDivElement = document.createElement('div');
			descriptionElement.className = 'tool-parameter-confirm-desc';
			descriptionElement.textContent = confirmRequest.description;
			panelElement.appendChild(descriptionElement);
		}

		const fieldsElement: HTMLDivElement = document.createElement('div');
		fieldsElement.className = 'tool-parameter-confirm-fields';
		for (let index = 0; index < confirmRequest.fields.length; index += 1) {
			const field: ToolParameterConfirmField = confirmRequest.fields[index];
			const fieldRow: HTMLDivElement = document.createElement('div');
			fieldRow.className = 'tool-parameter-confirm-field';

			const labelElement: HTMLLabelElement = document.createElement('label');
			labelElement.className = 'tool-parameter-confirm-label';
			labelElement.textContent = field.label;
			fieldRow.appendChild(labelElement);

			let controlElement: HTMLInputElement | HTMLSelectElement;
			if (field.type === 'select') {
				const selectElement: HTMLSelectElement = document.createElement('select');
				selectElement.className = 'tool-parameter-confirm-control';
				const optionList: ToolParameterConfirmOption[] = Array.isArray(field.options) ? field.options : [];
				for (let optionIndex = 0; optionIndex < optionList.length; optionIndex += 1) {
					const optionItem: ToolParameterConfirmOption = optionList[optionIndex];
					const optionElement: HTMLOptionElement = document.createElement('option');
					optionElement.value = optionItem.value;
					optionElement.textContent = optionItem.label;
					selectElement.appendChild(optionElement);
				}
				if (field.defaultValue !== undefined) {
					selectElement.value = String(field.defaultValue);
				}
				controlElement = selectElement;
			}
			else {
				const inputElement: HTMLInputElement = document.createElement('input');
				inputElement.className = 'tool-parameter-confirm-control';
				inputElement.type = field.type === 'number' ? 'number' : 'text';
				if (field.placeholder) {
					inputElement.placeholder = field.placeholder;
				}
				if (field.defaultValue !== undefined) {
					inputElement.value = String(field.defaultValue);
				}
				controlElement = inputElement;
			}
			fieldControlMap.set(field.key, controlElement);
			fieldRow.appendChild(controlElement);
			fieldsElement.appendChild(fieldRow);
		}
		panelElement.appendChild(fieldsElement);

		const errorElement: HTMLDivElement = document.createElement('div');
		errorElement.className = 'tool-parameter-confirm-error';
		panelElement.appendChild(errorElement);

		const actionsElement: HTMLDivElement = document.createElement('div');
		actionsElement.className = 'tool-parameter-confirm-actions';
		const cancelButton: HTMLButtonElement = document.createElement('button');
		cancelButton.className = 'tool-parameter-confirm-button cancel';
		cancelButton.type = 'button';
		cancelButton.textContent = confirmRequest.cancelButtonText || '取消';
		const confirmButton: HTMLButtonElement = document.createElement('button');
		confirmButton.className = 'tool-parameter-confirm-button confirm';
		confirmButton.type = 'button';
		confirmButton.textContent = confirmRequest.confirmButtonText || '确定';
		actionsElement.appendChild(cancelButton);
		actionsElement.appendChild(confirmButton);
		panelElement.appendChild(actionsElement);

		targetContainer.appendChild(panelElement);

		// 统一收尾。
		let onAbort: (() => void) | null = null;
		const finalize = (result: RequestConfirmPanelResult): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			if (options.abortSignal && onAbort) {
				options.abortSignal.removeEventListener('abort', onAbort);
			}
			panelElement.remove();
			resolve(result);
		};

		onAbort = (): void => {
			finalize({ confirmed: false });
		};

		cancelButton.addEventListener('click', () => {
			finalize({ confirmed: false });
		});

		confirmButton.addEventListener('click', () => {
			errorElement.textContent = '';
			const valueObject: Record<string, unknown> = {};
			for (let fieldIndex = 0; fieldIndex < confirmRequest.fields.length; fieldIndex += 1) {
				const field: ToolParameterConfirmField = confirmRequest.fields[fieldIndex];
				const controlElement: HTMLInputElement | HTMLSelectElement | undefined = fieldControlMap.get(field.key);
				const rawValue: string = String(controlElement ? controlElement.value : '').trim();
				if (field.required && !rawValue) {
					errorElement.textContent = `${field.label} 不能为空。`;
					if (controlElement) {
						controlElement.focus();
					}
					return;
				}
				if (!rawValue) {
					continue;
				}
				valueObject[field.key] = normalizeFieldValue(field, rawValue);
			}
			const mergedArgumentsText: string = mergeToolArgumentsWithConfirmedValues(options.rawToolArguments, valueObject);
			finalize({
				confirmed: true,
				mergedArgumentsText,
				values: valueObject,
			});
		});

		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				onAbort();
				return;
			}
			options.abortSignal.addEventListener('abort', onAbort, { once: true });
		}

		const firstControl: HTMLInputElement | HTMLSelectElement | undefined = fieldControlMap.values().next().value;
		if (firstControl) {
			firstControl.focus();
		}
	});
}
