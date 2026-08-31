import type { ValidationIssue } from './types';
import { FormatError, validationError } from './types';

export const AUTH_PARAM_MAX_LENGTH = 99;
export const AUTH_PARAM_FIELD_COUNT = 19;

export const AUTH_PARAM_KEYS = [
  'ftpAddresses',
  'ftpPort',
  'ftpPath1',
  'ftpPath2',
  'gameVersion',
  'userIndexId',
  'username',
  'password',
  'level',
  'gender',
  'token',
  'email',
  'gatewayAddress',
  'gatewayPort',
  'pcRoom',
  'homeUrl',
  'rank',
  'noticeUrl',
  'membership',
] as const;

export type AuthParamKey = (typeof AUTH_PARAM_KEYS)[number];
export type AuthParams = Record<AuthParamKey, string>;

export interface AuthParamField {
  readonly key: AuthParamKey;
  readonly index: number;
  readonly label: string;
  readonly default: string;
  readonly hint: string;
  readonly maxLength: typeof AUTH_PARAM_MAX_LENGTH;
  readonly options?: readonly { readonly value: string; readonly label: string; }[];
  readonly inert?: boolean;
}

export const AUTH_PARAM_FIELDS: readonly AuthParamField[] = [
  {
    key: 'ftpAddresses',
    index: 0,
    label: 'FTP addresses',
    default: '127.0.0.1|127.0.0.1',
    hint: 'Pipe-delimited list of FTP hosts. The blob is hex-encrypted, so these pipes never reach the command line.',
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
  { key: 'ftpPort', index: 1, label: 'FTP port', default: '21', hint: 'Shared by both FTP servers.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'ftpPath1', index: 2, label: 'FTP path 1', default: 'O2Jam', hint: 'Remote directory for the music library.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'ftpPath2', index: 3, label: 'FTP path 2', default: 'O2Jam', hint: 'Secondary remote directory; usually the same as path 1.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'gameVersion', index: 4, label: 'Game version', default: '8.05', hint: 'Version string reported by the launcher.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'userIndexId', index: 5, label: 'User index id', default: '0', hint: 'Account primary key in database.', maxLength: AUTH_PARAM_MAX_LENGTH },
  {
    key: 'username',
    index: 6,
    label: 'Username',
    default: '',
    hint: 'Account name.',
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
  { key: 'password', index: 7, label: 'Password', default: '1234567890', hint: 'Account password.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'level', index: 8, label: 'Level', default: '0', hint: 'Character level.', maxLength: AUTH_PARAM_MAX_LENGTH },
  {
    key: 'gender',
    index: 9,
    label: 'Gender',
    default: '1',
    hint: 'Character gender appearance.',
    options: [
      { value: '1', label: 'Male' },
      { value: '2', label: 'Female' },
    ],
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
  {
    key: 'token',
    index: 10,
    label: 'Nickname',
    default: '',
    hint: 'Character display name.',
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
  { key: 'email', index: 11, label: 'Email', default: 'user@mail.domain', hint: 'Account email address.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'gatewayAddress', index: 12, label: 'Gateway address', default: '', hint: 'Primary gateway; the pipe-delimited argument list carries the rest.', maxLength: AUTH_PARAM_MAX_LENGTH },
  { key: 'gatewayPort', index: 13, label: 'Gateway port', default: '', hint: 'Port for the primary gateway above.', maxLength: AUTH_PARAM_MAX_LENGTH },
  {
    key: 'pcRoom',
    index: 14,
    label: 'PC room',
    default: '-1',
    hint: 'FreePass type.',
    options: [
      { value: '-1', label: 'None' },
      { value: '1', label: 'AllMusic' },
      { value: '2', label: 'UnusedFreePlay1' },
      { value: '4', label: 'NewMusic' },
      { value: '8', label: 'FreePlay' },
      { value: '16', label: 'FreePlayAlt1' },
      { value: '32', label: 'Top100' },
      { value: '64', label: 'PremiumTime' },
      { value: '128', label: 'UnusedFreePlay2' },
      { value: '256', label: 'Top100Extended' },
      { value: '512', label: 'FreePlayAlt2' },
      { value: '1024', label: 'UnusedFreePlay3' },
      { value: '1056', label: 'FreePlayAlt3' },
    ],
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
  {
    key: 'homeUrl',
    index: 15,
    label: 'Home URL',
    default: 'o2jam.nopp.co.kr',
    hint: 'Home page address.',
    maxLength: AUTH_PARAM_MAX_LENGTH,
    inert: true,
  },
  { key: 'rank', index: 16, label: 'Rank', default: '0', hint: '0 is unranked.', maxLength: AUTH_PARAM_MAX_LENGTH },
  {
    key: 'noticeUrl',
    index: 17,
    label: 'Notice URL',
    default: 'http://o2jam.nopp.co.kr/client/bbs_patch_notice_nopp.html',
    hint: 'Patch notice page address.',
    maxLength: AUTH_PARAM_MAX_LENGTH,
    inert: true,
  },
  {
    key: 'membership',
    index: 18,
    label: 'Membership',
    default: 'O2JAM',
    hint: 'Service membership source.',
    options: [
      { value: 'O2JAM', label: 'O2JAM' },
      { value: 'PDBOX', label: 'PDBOX' },
      { value: 'NATEON', label: 'NATEON' },
      { value: 'GAMEANGEL', label: 'GAMEANGEL' },
      { value: 'MONAWA', label: 'MONAWA' },
    ],
    maxLength: AUTH_PARAM_MAX_LENGTH,
  },
];

export const AUTH_PARAM_DEFAULTS: AuthParams = Object.freeze(
  Object.fromEntries(AUTH_PARAM_FIELDS.map((field) => [field.key, field.default])) as AuthParams,
);

export function resolveAuthParams(values: Partial<AuthParams> | undefined): AuthParams {
  const resolved = { ...AUTH_PARAM_DEFAULTS };
  if (!values) {
    return resolved;
  }

  for (const key of AUTH_PARAM_KEYS) {
    const value = values[key];
    if (value !== undefined) {
      resolved[key] = value;
    }
  }
  return resolved;
}

export function serialiseAuthParams(values: Partial<AuthParams>): string {
  const resolved = resolveAuthParams(values);
  let out = '';
  for (const field of AUTH_PARAM_FIELDS) {
    const value = resolved[field.key];
    if (value.length > AUTH_PARAM_MAX_LENGTH) {
      throw new FormatError(
        `auth param ${field.index} (${field.key}) is ${value.length} characters; the 2-digit length prefix caps it at ${AUTH_PARAM_MAX_LENGTH}`,
        field.index,
      );
    }

    out += String(value.length).padStart(2, '0') + value;
  }
  return out;
}

export function parseAuthParams(plaintext: string): AuthParams {
  const parsed = {} as AuthParams;
  let position = 0;

  for (const field of AUTH_PARAM_FIELDS) {
    if (position + 2 > plaintext.length) {
      throw new FormatError(
        `auth param ${field.index} (${field.key}): truncated length prefix at position ${position} of ${plaintext.length}`,
        field.index,
        position,
      );
    }

    const prefix = plaintext.slice(position, position + 2);
    const length = Number.parseInt(prefix, 10);
    if (!/^[0-9]{2}$/.test(prefix) || Number.isNaN(length)) {
      throw new FormatError(
        `auth param ${field.index} (${field.key}): "${prefix}" at position ${position} is not a 2-digit length`,
        field.index,
        position,
      );
    }

    position += 2;

    if (position + length > plaintext.length) {
      throw new FormatError(
        `auth param ${field.index} (${field.key}): declared ${length} characters at position ${position} but only ${plaintext.length - position} remain`,
        field.index,
        position,
      );
    }

    parsed[field.key] = plaintext.slice(position, position + length);
    position += length;
  }

  return parsed;
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

export function validateAuthParams(values: Partial<AuthParams>): ValidationIssue[] {
  const resolved = resolveAuthParams(values);
  const issues: ValidationIssue[] = [];

  for (const field of AUTH_PARAM_FIELDS) {
    const value = resolved[field.key];
    if (value.length > AUTH_PARAM_MAX_LENGTH) {
      issues.push(
        validationError(
          'auth-param-too-long',
          `${field.label} is ${value.length} characters. The length prefix is exactly 2 digits, so anything past ${AUTH_PARAM_MAX_LENGTH} silently corrupts every field after it.`,
          field.key,
          field.index,
        ),
      );
    }

    if (!PRINTABLE_ASCII.test(value)) {
      issues.push(
        validationError(
          'auth-param-non-ascii',
          `${field.label} must be printable ASCII. The prefix counts UTF-16 characters while the cipher works on UTF-8 bytes, so a non-ASCII value desynchronises the parser.`,
          field.key,
          field.index,
        ),
      );
    }
  }

  return issues;
}
