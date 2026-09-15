import { parseHex } from './pe.ts';
import type { Condition, InputDefinition, PatchDefinition, Scalar, Value, Values } from './types.ts';

function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) {
    throw new Error(message);
  }
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected a JSON object.'
  );
  const result = value as Record<string, unknown>;
  requireValue(
    Object.keys(result).every((key) => keys.includes(key)),
    `Unknown property: ${Object.keys(result).find((key) => !keys.includes(key))}`
  );

  return result;
}

function text(value: unknown, label: string, max = 4096): asserts value is string {
  requireValue(
    typeof value === 'string' && value.length > 0 && value.length <= max,
    `Invalid ${label}.`
  );
}

function integer(value: unknown, label: string, max = 0xffffffff): asserts value is number {
  requireValue(
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max,
    `Invalid ${label}.`
  );
}

function array(value: unknown, label: string, max = 1024): asserts value is unknown[] {
  requireValue(
    Array.isArray(value) && value.length > 0 && value.length <= max,
    `Invalid ${label}.`
  );
}

function id(value: unknown): asserts value is string {
  requireValue(
    typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value),
    'IDs must use lowercase letters, digits, and hyphens.'
  );
}

function scalar(value: unknown): asserts value is Scalar {
  requireValue(
    typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 4096),
    'Invalid input value.'
  );
}

export function equalValues(a: Value | undefined, b: Value | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((row, i) => {
    const other = b[i]!;
    return Object.keys(row).length === Object.keys(other).length &&
      Object.entries(row).every(([key, value]) => other[key] === value);
  });
}

export function matches(condition: Condition | undefined, values: Values): boolean {
  if (!condition) {
    return true;
  }

  if ('all' in condition) {
    return condition.all.every((c) => matches(c, values));
  }

  if ('any' in condition) {
    return condition.any.some((c) => matches(c, values));
  }

  if ('not' in condition) {
    return !matches(condition.not, values);
  }

  if ('empty' in condition) {
    const value = values[condition.input];
    return Array.isArray(value) && (value.length === 0) === condition.empty;
  }

  return values[condition.input] === condition.equals;
}

function condition(value: unknown, inputs: InputDefinition[], depth = 0): void {
  requireValue(depth < 12, 'Conditions are nested too deeply.');
  const c = object(value, ['input', 'equals', 'empty', 'all', 'any', 'not']);

  if ('input' in c) {
    requireValue(
      Object.keys(c).length === 2 && inputs.some((input) => input.id === c.input),
      'Condition references an unknown input.'
    );
    if ('empty' in c) requireValue(typeof c.empty === 'boolean' && inputs.find((input) => input.id === c.input)?.control === 'rows', 'Empty conditions require a row input.');
    else scalar(c.equals);
  } else if ('not' in c) {
    requireValue(Object.keys(c).length === 1, 'Invalid condition.');
    condition(c.not, inputs, depth + 1);
  } else {
    requireValue(Object.keys(c).length === 1, 'Invalid condition.');
    const children = c.all ?? c.any;
    array(children, 'condition list', 32);
    children.forEach((child) => condition(child, inputs, depth + 1));
  }
}

function locator(value: unknown): void {
  const l = object(value, ['signature', 'section', 'rva', 'offset']);
  text(l.signature, 'signature', 12288);
  requireValue(
    parseHex(l.signature, true).some((b) => b !== null),
    'A signature needs fixed bytes.'
  );

  if (l.section !== undefined) {
    text(l.section, 'section name', 8);
  }

  if (l.rva !== undefined) {
    integer(l.rva, 'signature RVA');
  }

  if (l.offset !== undefined) {
    integer(l.offset, 'signature offset', 1048576);
  }
}

function source(value: unknown, inputs: Set<string>): void {
  const s = object(value, ['input', 'part', 'prefix', 'suffix']);
  requireValue(
    typeof s.input === 'string' && inputs.has(s.input),
    'Operation references an unknown input.'
  );

  if (s.part !== undefined) {
    requireValue(
      s.part === 'origin' && s.prefix === undefined && s.suffix === undefined,
      'URL origin sources cannot define a prefix or suffix.'
    );
  }

  for (const field of ['prefix', 'suffix']) {
    if (s[field] !== undefined) {
      requireValue(
        typeof s[field] === 'string' && (s[field] as string).length <= 4096,
        'Invalid value template.'
      );
    }
  }
}

function hook(op: Record<string, unknown>, inputs: InputDefinition[]): void {
  locator(op.at);
  const at = op.at as { signature: string; offset?: number };
  const original = parseHex(op.original as string, true);
  text(op.code, 'hook code', 12288);
  const code = parseHex(op.code);
  requireValue(op.writable === undefined || typeof op.writable === 'boolean', 'Invalid hook writable flag.');
  const pattern = parseHex(at.signature, true);
  const position = at.offset ?? 0;
  requireValue(original.length >= 5 && original.some((b) => b !== null), 'Hooks need at least five original bytes with a fixed opcode.');
  requireValue(position + original.length <= pattern.length, 'Hook signature must include all overwritten bytes.');
  pattern.fill(null, position, position + original.length);
  requireValue(pattern.some((b) => b !== null), 'Hook signature needs context outside overwritten bytes.');

  if (op.fixups === undefined) {
    return;
  }

  array(op.fixups, 'hook fixups', 512);
  const occupied = new Set<number>();

  for (const item of op.fixups) {
    const fixup = object(item, ['offset', 'encoding', 'relativeTo', 'value', 'fields', 'capacity']);
    integer(fixup.offset, 'hook fixup offset', code.length);
    requireValue(['u8', 'u32le', 'rel32', 'rows-u32le'].includes(fixup.encoding as string), 'Invalid hook fixup encoding.');
    let width = fixup.encoding === 'u8' ? 1 : 4;
    if (fixup.encoding === 'rows-u32le') {
      array(fixup.fields, 'hook row fields', 16);
      fixup.fields.forEach(id);
      requireValue(new Set(fixup.fields).size === fixup.fields.length, 'Duplicate hook row field.');
      integer(fixup.capacity, 'hook row capacity', 128);
      requireValue(fixup.capacity > 0, 'Hook row capacity must be positive.');
      width = 4 + fixup.capacity * fixup.fields.length * 4;
    } else {
      requireValue(fixup.fields === undefined && fixup.capacity === undefined, 'Only row fixups accept fields and capacity.');
    }
    requireValue(fixup.offset + width <= code.length, 'Hook fixup exceeds its code.');

    for (let i = fixup.offset; i < fixup.offset + width; i++) {
      requireValue(!occupied.has(i), 'Hook fixups overlap.');
      occupied.add(i);
    }

    if (fixup.relativeTo !== undefined) {
      integer(fixup.relativeTo, 'hook relative base', code.length);
      requireValue(fixup.encoding === 'rel32', 'Only rel32 fixups have a relative base.');
    }

    const target = object(fixup.value, ['input', 'at', 'read', 'originalOffset', 'continuation', 'codeOffset']);
    const kinds = ['input', 'at', 'originalOffset', 'continuation', 'codeOffset'].filter((key) => key in target);
    requireValue(kinds.length === 1, 'Hook fixup needs one value source.');
    requireValue(fixup.encoding !== 'rows-u32le' || 'input' in target, 'Row fixups require an input.');
    requireValue(target.read === undefined || ['u32le', 'rel32'].includes(target.read as string), 'Invalid hook target read.');

    if ('input' in target) {
      const input = inputs.find((input) => input.id === target.input);
      requireValue(input, 'Hook references an unknown input.');
      requireValue(fixup.encoding !== 'rel32' && target.read === undefined, 'Hook inputs use u8, u32le, or rows-u32le.');
      if (fixup.encoding === 'rows-u32le') {
        const fields = fixup.fields as string[];
        requireValue(input.control === 'rows' && (fixup.capacity as number) >= input.maxRows!, 'Row fixup capacity must cover its row input.');
        requireValue(fields.length === input.fields!.length && input.fields!.every((field) => fields.includes(field.id)), 'Row fixups must encode every field exactly once.');
        requireValue(input.fields!.every((field) => ['number', 'range'].includes(field.control) || ['select', 'radio'].includes(field.control) && field.options!.every((option) => typeof option.value === 'number' && Number.isInteger(option.value) && option.value >= 0 && option.value <= 0xffffffff)), 'Row fixups require numeric fields.');
      } else {
        requireValue(input.control !== 'rows', 'Row inputs require rows-u32le fixups.');
      }
    } else {
      if ('at' in target) {
        locator(target.at);
        const binding = target.at as { signature: string; offset?: number };
        const size = parseHex(binding.signature, true).length;
        requireValue((binding.offset ?? 0) + (target.read ? 4 : 1) <= size, 'Hook binding exceeds its signature.');
        requireValue(target.read !== undefined || fixup.encoding === 'rel32', 'Hook addresses must use rel32 fixups.');
      } else if ('originalOffset' in target) {
        integer(target.originalOffset, 'original operand offset', original.length);
        requireValue(target.read !== undefined && target.originalOffset + 4 <= original.length, 'Hook original operand needs a complete four-byte read.');
      } else {
        requireValue(fixup.encoding === 'rel32', 'Hook addresses must use rel32 fixups.');
        requireValue(target.read === undefined, 'This hook target cannot use read.');

        if ('continuation' in target) {
          requireValue(target.continuation === true, 'Invalid hook continuation.');
        } else {
          integer(target.codeOffset, 'hook code offset', code.length - 1);
        }
      }
    }
  }
}

export function validateValues(inputs: InputDefinition[], values: Values): void {
  requireValue(
    Object.keys(values).every((key) => inputs.some((input) => input.id === key)),
    'Unknown input value.'
  );

  for (const input of inputs) {
    const value = values[input.id];
    if (input.control === 'rows') {
      requireValue(Array.isArray(value) && value.length <= input.maxRows!, `${input.label} has too many rows.`);
      const seen = new Set<Scalar>();
      for (const row of value) {
        object(row, input.fields!.map((field) => field.id));
        validateValues(input.fields!, row);
        if (input.uniqueBy) {
          const key = row[input.uniqueBy]!;
          requireValue(!seen.has(key), `${input.label} contains a duplicate ${input.uniqueBy}.`);
          seen.add(key);
        }
      }
      continue;
    }
    scalar(value);

    if (input.control === 'checkbox' || input.control === 'toggle') {
      requireValue(typeof value === 'boolean', `${input.label} must be on or off.`);
    } else if (input.control === 'number' || input.control === 'range') {
      requireValue(
        typeof value === 'number' && Number.isFinite(value),
        `${input.label} must be a number.`
      );
      requireValue(
        value >= (input.min ?? -Infinity) && value <= (input.max ?? Infinity),
        `${input.label} is outside its allowed range.`
      );
      if (input.control === 'range') requireValue(Number.isSafeInteger(value), `${input.label} must be an integer.`);
      if (input.format === 'port') {
        requireValue(Number.isInteger(value) && value >= 1 && value <= 65535, `${input.label} must be a port from 1 to 65535.`);
      }
      if (input.minFrom) requireValue(value >= Number(values[input.minFrom]), `${input.label} must be at least ${input.minFrom}.`);
      if (input.maxFrom) requireValue(value <= Number(values[input.maxFrom]), `${input.label} must not exceed ${input.maxFrom}.`);
    } else if (input.control === 'radio' || input.control === 'select') {
      requireValue(
        input.options?.some((option) => option.value === value),
        `Choose a valid ${input.label}.`
      );
    } else {
      requireValue(
        typeof value === 'string' &&
          value.length > 0 &&
          value.length <= (input.maxLength ?? 255) &&
          !/[\x00-\x1f\x7f]/.test(value),
        `${input.label} must contain 1–${input.maxLength ?? 255} printable characters.`
      );

      let formatted = value;
      if (input.printf) {
        const pattern = /%%|%[-+ #0]*(\d*)(?:\.(\d*))?l?[diuoxX]/g;
        const numbers = [...value.matchAll(pattern)].filter(([token]) => token !== '%%');
        const literal = value.replace(pattern, (token) => token === '%%' ? '%' : '');
        requireValue(
          numbers.length === input.printf.integerArgs && !value.replace(pattern, '').includes('%') &&
            !/[^\x20-\x7e]/.test(value),
          `${input.label} must contain ${input.printf.integerArgs} integer placeholder(s), such as %04d.`
        );
        const length = literal.length + numbers.reduce((total, [token, width, precision]) =>
          total + Math.max(Number(width), Number(precision ?? 0) + 3, token.includes('#') && token.endsWith('o') ? 12 : 11), 0);
        requireValue(
          length <= input.printf.maxLength,
          `${input.label} must produce at most ${input.printf.maxLength} characters.`
        );
        formatted = value.replace(pattern, (token) => token === '%%' ? '%' : '0');
      }

      if (input.format === 'filename') {
        requireValue(
          !/[<>:"/\\|?*]/.test(formatted) && (Boolean(input.printf) || !formatted.includes('%')) &&
            formatted !== '.' && formatted !== '..' && !/[. ]$/.test(formatted),
          `${input.label} must be a filename without a path${input.printf ? '' : ' or format specifiers'}.`
        );
      }

      if (input.format === 'ipv4') {
        requireValue(
          /^\d{1,3}(\.\d{1,3}){3}$/.test(formatted) &&
            formatted
              .split('.')
              .every(
                (part) =>
                  Number(part) <= 255 &&
                  (!part.startsWith('0') || Number.parseInt(part, 8) === Number(part))
              ),
          `${input.label} must be an IPv4 address without ambiguous leading zeros.`
        );
      }

      if (input.format === 'hostname') {
        requireValue(
          /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(formatted) &&
            formatted.split('.').every((label) => label.length <= 63 && !label.startsWith('-') && !label.endsWith('-') && label.length > 0),
          `${input.label} must be a hostname or IPv4 address without a port or path.`
        );
      }

      if (input.format === 'url' || input.format === 'url-origin') {
        const fullUrl = input.format === 'url';
        requireValue(
          (fullUrl
            ? /^(?:https?|mms):\/\/[^/?#\s\\]+(?:[/?#][^\s\\]*)?$/i
            : /^(?:https?|mms):\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/i).test(formatted),
          fullUrl
            ? `${input.label} must be a full HTTP, HTTPS, or MMS URL.`
            : `${input.label} must contain a protocol and server, with an optional port.`
        );
        const url = new URL(formatted);
        requireValue(!url.port || Number(url.port) <= 65535, `${input.label} has an invalid port.`);
      }
    }
  }
}

function validateInputs(value: unknown, depth = 0): InputDefinition[] {
  array(value, 'inputs', 128);
  const ids = new Set<string>();

  for (const item of value) {
    const input = object(item, [
      'id',
      'label',
      'group',
      'description',
      'control',
      'default',
      'options',
      'min',
      'max',
      'maxLength',
      'suffix',
      'format',
      'printf',
      'visibleWhen', 'fields', 'maxRows', 'uniqueBy', 'addLabel', 'minFrom', 'maxFrom',
    ]);
    id(input.id);
    requireValue(!ids.has(input.id), 'Duplicate input ID.');
    ids.add(input.id);
    text(input.label, 'input label', 160);

    if (input.group !== undefined) {
      text(input.group, 'input group', 80);
    }
    if (input.default !== undefined && input.control !== 'rows') {
      scalar(input.default);
    }
    requireValue(
      ['checkbox', 'toggle', 'radio', 'select', 'text', 'number', 'range', 'rows'].includes(input.control as string),
      'Unknown input control.'
    );

    if (input.control === 'rows') {
      requireValue(depth === 0, 'Nested row controls are not supported.');
      requireValue(Array.isArray(input.default), 'Row controls need an array default.');
      validateInputs(input.fields, depth + 1);
      integer(input.maxRows, 'maximum rows', 128);
      requireValue(input.maxRows > 0, 'Maximum rows must be positive.');
      const fields = input.fields as InputDefinition[];
      requireValue(fields.every((field) => field.default !== undefined), 'Row fields need defaults.');
      if (input.uniqueBy !== undefined) {
        requireValue(fields.some((field) => field.id === input.uniqueBy), 'Unknown unique row field.');
      }
      if (input.addLabel !== undefined) text(input.addLabel, 'add row label', 80);
    } else {
      requireValue(input.fields === undefined && input.maxRows === undefined && input.uniqueBy === undefined && input.addLabel === undefined, 'Only row controls accept row settings.');
    }

    if (input.description !== undefined) {
      text(input.description, 'input description');
    }

    if (input.suffix !== undefined) {
      requireValue(input.control === 'range', 'Only range controls accept a suffix.');
      text(input.suffix, 'range suffix', 32);
    }

    if (input.format !== undefined) {
      requireValue(['filename', 'ipv4', 'hostname', 'url', 'url-origin', 'port'].includes(input.format as string), 'Unknown input format.');
      if (input.format === 'port') requireValue(input.control === 'number', 'Port inputs require a number control.');
    }

    if (input.maxLength !== undefined) {
      integer(input.maxLength, 'maximum length', 4096);
    }

    if (input.printf !== undefined) {
      requireValue(input.control === 'text', 'Printf settings require a text control.');
      const printf = object(input.printf, ['integerArgs', 'maxLength']);
      integer(printf.integerArgs, 'printf integer argument count', 128);
      integer(printf.maxLength, 'printf output length', 4096);
      requireValue(printf.maxLength > 0, 'Printf output length must be positive.');
    }

    for (const key of ['min', 'max']) {
      if (input[key] !== undefined) {
        requireValue(
          typeof input[key] === 'number' && Number.isFinite(input[key]),
          'Invalid numeric limit.'
        );
      }
    }

    if (input.min !== undefined && input.max !== undefined) {
      requireValue((input.min as number) <= (input.max as number), 'Reversed numeric limits.');
    }

    if (input.control === 'range') {
      requireValue(Number.isSafeInteger(input.min) && Number.isSafeInteger(input.max), 'Range controls require integer min and max limits.');
    }

    if (input.options !== undefined || input.control === 'radio' || input.control === 'select') {
      array(input.options, 'options', 128);
      const values = new Set<Value>();

      for (const value of input.options) {
        const option = object(value, ['label', 'value']);
        text(option.label, 'option label', 160);
        scalar(option.value);
        requireValue(!values.has(option.value), 'Duplicate option value.');
        values.add(option.value);
      }
    }
  }

  const inputs = value as unknown as InputDefinition[];

  for (const input of inputs) {
    for (const key of ['minFrom', 'maxFrom'] as const) {
      if (input[key] !== undefined) {
        requireValue(['number', 'range'].includes(input.control) && inputs.some((field) => field.id === input[key] && ['number', 'range'].includes(field.control)), 'Numeric bound references an unknown number input.');
      }
    }
    if (input.visibleWhen) {
      condition(input.visibleWhen, inputs);
    }
  }

  const provided = inputs.filter((input) => input.default !== undefined);
  validateValues(provided, Object.fromEntries(provided.map((input) => [input.id, input.default!])));
  return inputs;
}

export function validateDefinition(value: unknown): PatchDefinition {
  const p = object(value, [
    'schemaVersion',
    'id',
    'title',
    'description',
    'category',
    'group',
    'order',
    'inputs',
    'variants',
    'requires',
    'conflicts',
    '$schema',
  ]);
  requireValue(p.schemaVersion === 1, 'Unsupported patch schema version.');
  id(p.id);
  text(p.title, 'title', 160);
  if (p.description !== undefined) text(p.description, 'description');
  text(p.category, 'category', 80);

  if (p.order !== undefined) {
    integer(p.order, 'display order');
  }

  if (p.group !== undefined) {
    text(p.group, 'display group', 80);
  }

  if (p.$schema !== undefined) {
    text(p.$schema, 'schema URL');
  }

  for (const key of ['requires', 'conflicts']) {
    if (p[key] !== undefined) {
      array(p[key], key, 128);
      (p[key] as unknown[]).forEach(id);
    }
  }

  const inputs = validateInputs(p.inputs);
  const ids = new Set(inputs.map((input) => input.id));
  array(p.variants, 'variants', 128);

  for (const value of p.variants) {
    const variant = object(value, ['client', 'defaults', 'operations']);
    const client = object(variant.client, ['version', 'imageBase', 'entryPoint', 'anchors']);
    text(client.version, 'client version', 40);
    if (client.imageBase !== undefined) {
      integer(client.imageBase, 'image base');
    }

    if (client.entryPoint !== undefined) {
      integer(client.entryPoint, 'entry point');
    }

    if (client.anchors !== undefined) {
      array(client.anchors, 'client anchors', 32);
    }

    for (const value of (client.anchors ?? []) as unknown[]) {
      const anchor = object(value, ['rva', 'bytes']);
      integer(anchor.rva, 'anchor RVA');
      text(anchor.bytes, 'anchor bytes', 12288);
      parseHex(anchor.bytes);
    }

    if (variant.defaults !== undefined) {
      const overrides = object(variant.defaults, [...ids]);
      const supplied = inputs.filter((input) => input.default !== undefined || input.id in overrides);
      validateValues(supplied, Object.fromEntries(
        supplied.map((input) => [input.id, overrides[input.id] ?? input.default])
      ) as Values);
    }

    array(variant.operations, 'operations', 2048);

    for (const value of variant.operations) {
      requireValue(value && typeof value === 'object', 'Invalid operation.');
      const type = (value as Record<string, unknown>).type;
      let keys: string[];

      if (type === 'string') {
        keys = ['type', 'original', 'value', 'references', 'referenceScope', 'sourceRva', 'encoding', 'when'];
      } else if (type === 'value') {
        keys = ['type', 'at', 'original', 'readCurrent', 'value', 'encoding', 'size', 'when'];
      } else if (type === 'hook') {
        keys = ['type', 'at', 'original', 'code', 'writable', 'fixups', 'when'];
      } else {
        keys = ['type', 'at', 'original', 'replacement', 'when'];
      }

      const op = object(value, keys);

      if (op.when !== undefined) {
        condition(op.when, inputs);
      }

      if (type !== 'string' || op.original !== undefined) {
        text(op.original, 'original value', 12288);
      }

      if (type === 'hook') {
        hook(op, inputs);
      } else if (type === 'string') {
        source(op.value, ids);
        if (op.sourceRva !== undefined) {
          integer(op.sourceRva, 'string RVA');
        }
        requireValue(
          op.encoding === undefined || ['ascii', 'utf16le', 'euc-kr'].includes(op.encoding as string),
          'Invalid string encoding.'
        );
        requireValue(
          op.referenceScope === undefined || ['all', 'listed'].includes(op.referenceScope as string),
          'Invalid string reference scope.'
        );
        requireValue(
          op.original === undefined || !(op.original as string).includes('\0'),
          'Strings cannot contain NUL.'
        );
        array(op.references, 'string references', 512);
        for (const reference of op.references) {
          locator(reference);
          const at = reference as { signature: string; offset?: number };
          requireValue(
            (at.offset ?? 0) + 4 <= parseHex(at.signature, true).length,
            'String reference signature must include the complete pointer.'
          );
        }
      } else {
        locator(op.at);
        const original = parseHex(op.original as string, type === 'bytes');

        if (type === 'bytes') {
          text(op.replacement, 'replacement bytes', 12288);
          const replacement = parseHex(op.replacement, true);
          requireValue(
            replacement.length === original.length,
            'Byte replacements must preserve length.'
          );
          requireValue(
            original.every((byte, i) => byte !== null || replacement[i] === null),
            'Wildcard original bytes must be preserved by wildcard replacements.'
          );
        } else {
          requireValue(type === 'value', 'Unknown operation type.');
          source(op.value, ids);
          requireValue(!(op.value as { part?: string }).part, 'URL parts require a string operation.');
          requireValue(
            [
              'u8',
              'u16le',
              'u32le',
              'f32le',
              'ascii',
              'utf16le',
              'hex',
              'length8',
              'length16le',
              'length32le',
            ].includes(op.encoding as string),
            'Invalid value encoding.'
          );
          integer(op.size, 'value size', 4096);
          requireValue(op.size === original.length, 'Value storage must match original bytes.');

          if (op.readCurrent !== undefined) {
            requireValue(typeof op.readCurrent === 'boolean', 'Invalid readCurrent flag.');
          }

          if (op.readCurrent) {
            const sizes: Record<string, number> = { u8: 1, u16le: 2, u32le: 4, f32le: 4 };
            requireValue(sizes[op.encoding as string] === op.size, 'readCurrent requires fixed numeric storage.');
            const value = op.value as { prefix?: string; suffix?: string };
            requireValue(value.prefix === undefined && value.suffix === undefined, 'readCurrent cannot use a value template.');
            const at = op.at as { signature: string; offset?: number };
            const pattern = parseHex(at.signature, true);
            const offset = at.offset ?? 0;
            requireValue(offset + original.length <= pattern.length, 'readCurrent signature must cover the value.');
            pattern.fill(null, offset, offset + original.length);
            requireValue(pattern.some((byte) => byte !== null), 'readCurrent needs instruction context outside the value.');
          }
        }
      }
    }

    for (const input of inputs.filter((input) => input.default === undefined)) {
      requireValue(
        variant.operations.some((value) => {
          const op = value as { type: string; value?: { input: string } };
          return op.type === 'string' && op.value?.input === input.id;
        }),
        `${input.label} needs a default or a string callsite.`
      );
    }
  }

  return value as PatchDefinition;
}
