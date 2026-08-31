import type { AuthParamKey, AuthParams } from './authparams';
import { AUTH_PARAM_DEFAULTS, AUTH_PARAM_FIELDS, parseAuthParams, resolveAuthParams, serialiseAuthParams, validateAuthParams } from './authparams';
import type { ArgumentsFieldKey, ArgumentsPreset, PairHalf, SlotSource } from './presets';
import { encodeRanking } from './presets';
import { getCipher } from './rsa';
import { applyTokenEncoding } from './token';
import type { Gateway, ValidationIssue } from './types';
import { validationError } from './types';

export interface ArgumentsInput {
  readonly fields?: Readonly<Partial<Record<ArgumentsFieldKey, string>>>;
  readonly gateways?: readonly Gateway[];
  readonly authParams?: Partial<AuthParams>;
  readonly executable?: string;
}

export interface BuildResult {
  ok: boolean;
  command: string;
  argv: string[];
  blob?: string;
  plaintext?: string;
  warning?: string;
  errors: ValidationIssue[];
}

type Fields = Partial<Record<ArgumentsFieldKey, string>>;

const DEFAULT_EXECUTABLE = 'OTwo.exe';

function quoteToken(token: string): string {
  return token === '' ? '""' : /\s/.test(token) ? `"${token}"` : token;
}

function gatewayPairs(gateways: readonly Gateway[]): string[] {
  return gateways.flatMap((gateway) => [gateway.address, String(gateway.port)]);
}

function resolveFields(preset: ArgumentsPreset, input: ArgumentsInput): Fields {
  const merged: Fields = {};
  for (const field of preset.fields) {
    if (field.default !== undefined) merged[field.key] = field.default;
  }
  for (const [key, value] of Object.entries(preset.defaults.fields)) {
    if (value !== undefined) merged[key as ArgumentsFieldKey] = value;
  }
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    if (value !== undefined) merged[key as ArgumentsFieldKey] = value;
  }
  return merged;
}

function requireFields(preset: ArgumentsPreset, fields: Fields, errors: ValidationIssue[]): void {
  for (const field of preset.fields) {
    if (!field.required || field.kind === 'gateways') continue;
    if ((fields[field.key] ?? '').trim() === '') {
      errors.push(validationError('required', `${field.label} is required.`, field.key));
    }
  }
}

function parseInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^-?[0-9]+$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

function validateGateways(gateways: readonly Gateway[], errors: ValidationIssue[]): void {
  if (gateways.length === 0) {
    errors.push(validationError('no-gateways', 'At least one gateway address and port is required.', 'gateways'));
    return;
  }
  gateways.forEach((gateway, index) => {
    if (gateway.address.trim() === '') {
      errors.push(validationError('gateway-address-empty', `Gateway ${index + 1} has no address.`, 'gateways', index));
    }
    const port = parseInteger(String(gateway.port), Number.NaN);
    if (port === null || !Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(validationError('gateway-port-invalid', `Gateway ${index + 1} port "${gateway.port}" is not in 1-65535.`, 'gateways', index));
    }
  });
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
}

function resolvePairHalf(half: PairHalf, fields: Fields, errors: ValidationIssue[], preset: ArgumentsPreset): string {
  if ('random' in half) return randomHex(half.random);
  const value = fields[half.field] ?? '';
  if (value.includes('#')) {
    const label = preset.fields.find((f) => f.key === half.field)?.label ?? half.field;
    errors.push(validationError('hash-in-half', `${label} cannot contain # — it separates the two halves.`, half.field));
  }
  return value;
}

function resolveSlot(source: SlotSource, fields: Fields, encodedToken: string): string {
  if ('literal' in source) return source.literal;
  return source.field === 'token' ? encodedToken : fields[source.field] ?? '';
}

function garbledFields(expected: AuthParams, decrypted: string): string[] {
  try {
    const actual = parseAuthParams(decrypted);
    return AUTH_PARAM_FIELDS.filter((field) => actual[field.key] !== expected[field.key]).map((field) => field.label);
  } catch {
    return [];
  }
}

function buildAuthParams(
  preset: ArgumentsPreset,
  gateways: readonly Gateway[],
  input: ArgumentsInput,
  errors: ValidationIssue[],
): AuthParams {
  const withDefaults: Partial<AuthParams> = { ...preset.defaults.authParams };
  for (const field of AUTH_PARAM_FIELDS) {
    const override = preset.blob?.[field.key];
    if (override?.default !== undefined) withDefaults[field.key] = override.default;
  }

  const primary = gateways[0];
  if (primary !== undefined) {
    withDefaults.gatewayAddress = primary.address;
    withDefaults.gatewayPort = String(primary.port);
  }

  const ftpDefault = withDefaults.ftpAddresses ?? AUTH_PARAM_DEFAULTS.ftpAddresses;

  for (const [key, value] of Object.entries(input.authParams ?? {})) {
    if (value !== undefined && value !== '') withDefaults[key as AuthParamKey] = value;
  }

  const typedFtp = input.authParams?.ftpAddresses;
  if (typedFtp !== undefined && typedFtp !== '') {
    const defHalves = ftpDefault.split('|');
    withDefaults.ftpAddresses = typedFtp
      .split('|')
      .map((half, i) => half || defHalves[i] || defHalves[0] || '')
      .join('|');
  }

  const resolved = resolveAuthParams(withDefaults);

  for (const field of AUTH_PARAM_FIELDS) {
    const override = preset.blob?.[field.key];
    if (override?.required && resolved[field.key].trim() === '') {
      errors.push(validationError('required', `${override.label ?? field.label} is required.`, field.key, field.index));
    }
  }

  return resolved;
}

export function buildArguments(preset: ArgumentsPreset, input: ArgumentsInput = {}): BuildResult {
  const errors: ValidationIssue[] = [];

  const fields = resolveFields(preset, input);
  const gateways = input.gateways ?? preset.defaults.gateways;
  const executable = input.executable ?? DEFAULT_EXECUTABLE;

  requireFields(preset, fields, errors);

  const encodedToken = applyTokenEncoding(fields.token ?? '', preset.tokenEncoding);

  let argv: string[];
  let blob: string | undefined;
  let plaintext: string | undefined;
  let warning: string | undefined;

  if (preset.pair) {
    argv = [`${resolvePairHalf(preset.pair.first, fields, errors, preset)}#${resolvePairHalf(preset.pair.second, fields, errors, preset)}`];
  } else if (preset.cipher) {
    validateGateways(gateways, errors);
    const params = buildAuthParams(preset, gateways, input, errors);
    errors.push(...validateAuthParams(params));

    if (errors.length > 0) {
      return { ok: false, command: '', argv: [], errors };
    }

    plaintext = serialiseAuthParams(params);
    const cipher = getCipher(preset.cipher);
    blob = cipher.encrypt(plaintext);

    const check = cipher.roundTrip(plaintext);
    if (!check.ok) {
      const fields = garbledFields(params, check.decrypted);
      warning = fields.length > 0
        ? `The following fields could not be decrypted back: ${fields.join(', ')}.`
        : 'The encrypted block is unreliable. Consider to enter different parameters.';
    }
    plaintext = check.decrypted;

    argv = [blob, gateways.map((gateway) => `|test|??|${gateway.address}|${gateway.port}`).join('')];
  } else if (preset.slots) {
    validateGateways(gateways, errors);
    const ranking = parseInteger(fields.ranking, 0);
    if (ranking === null) errors.push(validationError('ranking-invalid', `Ranking "${fields.ranking}" is not an integer.`, 'ranking'));
    const rank = encodeRanking(ranking ?? 0, fields.freePass === 'true');
    const mode = fields.mode ?? 'INET';
    const alphaGender = /^(0|O2_INET)$/i.test(mode.trim());
    const gender = alphaGender
      ? fields.gender === 'female' ? 'f' : 'm'
      : fields.gender === 'female' ? '2' : '1';
    argv = [
      mode,
      '1',
      resolveSlot(preset.slots.userId, fields, encodedToken),
      resolveSlot(preset.slots.password, fields, encodedToken),
      'O2Jam',
      gender,
      String(rank),
      `${fields.ftpHost ?? ''}:${fields.ftpPort ?? ''}`,
      fields.ftpPath ?? '',
      String(gateways.length),
      ...gatewayPairs(gateways),
    ];
  } else {
    validateGateways(gateways, errors);
    argv = [
      encodedToken,
      `${fields.ftpHost ?? ''}:${fields.ftpPort ?? ''}`,
      fields.ftpPath ?? '',
      String(gateways.length),
      ...gatewayPairs(gateways),
    ];
  }

  const rendered = argv.map(quoteToken);

  return {
    ok: errors.length === 0,
    command: rendered.length > 0 ? `${executable} ${rendered.join(' ')}` : executable,
    argv,
    blob,
    plaintext,
    warning,
    errors,
  };
}
