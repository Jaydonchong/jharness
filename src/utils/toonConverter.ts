import { asDomainError, DomainError, ErrorCode } from './ErrorCode';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type TableField = { key: string; children: TableField[] | null };

/** Converts JSON text to TOON using commas and two-space indentation. */
export function jsonToToon(json: string): string {
	try {
		return render(JSON.parse(json) as JsonValue, 0).join('\n');
	} catch (error) {
		throw asDomainError(error, ErrorCode.VALIDATION_ERROR, 'Invalid JSON for TOON conversion');
	}
}

function isObject(value: JsonValue): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function quote(value: string): string {
	let escaped = '';
	for (const character of value) {
		const code = character.codePointAt(0)!;
		if (code >= 0xd800 && code <= 0xdfff) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'TOON cannot represent unpaired Unicode surrogates',
			);
		}
		switch (character) {
			case '\\':
				escaped += '\\\\';
				break;
			case '"':
				escaped += '\\"';
				break;
			case '\n':
				escaped += '\\n';
				break;
			case '\r':
				escaped += '\\r';
				break;
			case '\t':
				escaped += '\\t';
				break;
			default:
				escaped += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
		}
	}
	return `"${escaped}"`;
}

function encodeKey(key: string): string {
	return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(key) ? key : quote(key);
}

function encodePrimitive(value: JsonPrimitive): string {
	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new DomainError(
			ErrorCode.VALIDATION_ERROR,
			'JSON number exceeds the finite JavaScript number range',
		);
	}
	if (typeof value !== 'string') return String(value);

	// Validate Unicode even when quoting is unnecessary.
	const quoted = quote(value);
	const needsQuotes =
		value === '' ||
		/^[ \t]|[ \t]$/.test(value) ||
		/^(true|false|null)$/.test(value) ||
		/^[+-]?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i.test(value) ||
		/[:,"\\\[\]{}\u0000-\u001f]/.test(value) ||
		/^[-#\ufeff]/.test(value);
	return needsQuotes ? quoted : value;
}

function tableFields(values: JsonValue[]): TableField[] | null {
	if (values.length === 0 || !values.every(isObject)) return null;
	const keys = Object.keys(values[0]!);
	if (
		keys.length === 0 ||
		!values.every(
			(value) =>
				Object.keys(value).length === keys.length &&
				keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)),
		)
	)
		return null;

	const fields: TableField[] = [];
	for (const key of keys) {
		const column = values.map((value) => value[key]!);
		if (column.every((value) => value === null || typeof value !== 'object')) {
			fields.push({ key, children: null });
		} else {
			const children = tableFields(column);
			if (children === null) return null;
			fields.push({ key, children });
		}
	}
	return fields;
}

function fieldHeader(fields: TableField[]): string {
	return fields
		.map(
			(field) =>
				encodeKey(field.key) +
				(field.children === null ? '' : `{${fieldHeader(field.children)}}`),
		)
		.join(',');
}

function rowCells(value: JsonObject, fields: TableField[]): string[] {
	return fields.flatMap((field) =>
		field.children === null
			? [encodePrimitive(value[field.key] as JsonPrimitive)]
			: rowCells(value[field.key] as JsonObject, field.children),
	);
}

function objectFields(value: JsonObject, depth: number): string[] {
	return Object.entries(value).flatMap(([key, child]) => render(child, depth, key));
}

function listItem(value: JsonValue, depth: number): string[] {
	const indentation = '  '.repeat(depth);
	if (isObject(value)) {
		const lines = objectFields(value, depth + 1);
		if (lines.length === 0) return [`${indentation}-`];
		lines[0] = `${indentation}- ${lines[0]!.slice(indentation.length + 2)}`;
		return lines;
	}
	const lines = render(value, depth, undefined, true);
	lines[0] = `${indentation}- ${lines[0]!.slice(indentation.length)}`;
	return lines;
}

function render(value: JsonValue, depth: number, key?: string, arrayItem = false): string[] {
	const indentation = '  '.repeat(depth);
	const prefix = key === undefined ? '' : encodeKey(key);

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return [
				indentation + (arrayItem ? '[0]:' : key === undefined ? '[]' : `${prefix}: []`),
			];
		}
		const header = `${indentation}${prefix}[${value.length}]`;
		if (value.every((child) => child === null || typeof child !== 'object')) {
			return [
				`${header}: ${value.map((child) => encodePrimitive(child as JsonPrimitive)).join(',')}`,
			];
		}
		const fields = arrayItem ? null : tableFields(value);
		if (fields !== null) {
			return [
				`${header}{${fieldHeader(fields)}}:`,
				...value.map(
					(child) => `${indentation}  ${rowCells(child as JsonObject, fields).join(',')}`,
				),
			];
		}
		return [`${header}:`, ...value.flatMap((child) => listItem(child, depth + 1))];
	}

	if (isObject(value)) {
		const entries = Object.entries(value);
		const fields = entries.length < 2 ? null : tableFields(entries.map(([, child]) => child));
		if (fields !== null) {
			return [
				`${indentation}${prefix}[${entries.length}:]{${fieldHeader(fields)}}:`,
				...entries.map(
					([entryKey, child]) =>
						`${indentation}  ${encodeKey(entryKey)}: ${rowCells(child as JsonObject, fields).join(',')}`,
				),
			];
		}
		return key === undefined
			? objectFields(value, depth)
			: [`${indentation}${prefix}:`, ...objectFields(value, depth + 1)];
	}

	return [`${indentation}${key === undefined ? '' : `${prefix}: `}${encodePrimitive(value)}`];
}
