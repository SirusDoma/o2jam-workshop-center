import type { AuthParamKey, AuthParams } from './authparams';
import { AUTH_PARAM_FIELDS } from './authparams';
import { IDENTITY_P2_CIPHER_OPTIONS, MEMORYER_CIPHER_OPTIONS } from './rsa';
import type { CipherOptions } from './rsa';
import type { TokenEncoding } from './token';
import type { FieldDescriptor, Gateway } from './types';
import type { ClientVersionId } from '../versions';

export interface ArgumentsGrammar {
  readonly template: string;
  readonly example: string;
}

export const DEFAULT_GATEWAY_PORT = 15010;
const VERSION_233_GRAMMAR: ArgumentsGrammar = {
  template: 'OTwo.exe <username_hash>#<password_hash>',
  example: 'OTwo.exe 5F4DCC3B5AA765D61D8327DEB882CF99#482C811DA5D5B4BC6D497FFA98491E38',
};
const VERSION_310_AND_382_GRAMMAR: ArgumentsGrammar = {
  template: 'OTwo.exe <token> <ftp_server> <ftp_path> <gateway_count> <addr1> <port1> <addr2> <port2> …',
  example: 'OTwo.exe myEncodedBase64Token my-ftp-server:1234 O2Jam 3 192.168.10.1 15010 192.168.10.2 15010 192.168.10.3 15010',
};
const VERSION_589_GRAMMAR: ArgumentsGrammar = {
  template: 'OTwo.exe <mode> 1 <user_id> <password> O2Jam <gender> <rank> <ftp_host>:<ftp_port> <ftp_path> <gateway_count> <addr1> <port1> …',
  example: 'OTwo.exe INET 1 my_token _ O2Jam 1 0 my-ftp-server:1234 O2Jam/Music 3 192.168.10.1 15010 …',
};
const VERSION_665_AND_802_GRAMMAR: ArgumentsGrammar = {
  template: 'OTwo.exe <encrypted_parameters> |test|??|<addr1>|<port1>|test|??|<addr2>|<port2>…',
  example: 'OTwo.exe 00C70200E85000DF8E00E… |test|??|192.168.10.1|15010|test|??|192.168.10.2|15011',
};

export type ArgumentsFieldKey =
  | 'token'
  | 'usernameHash'
  | 'passwordHash'
  | 'userId'
  | 'password'
  | 'mode'
  | 'gender'
  | 'ranking'
  | 'freePass'
  | 'ftpHost'
  | 'ftpPort'
  | 'ftpPath'
  | 'gateways';

export type ArgumentsField = FieldDescriptor<ArgumentsFieldKey>;

export type PairHalf = { readonly field: ArgumentsFieldKey } | { readonly random: number };

export type SlotSource = { readonly field: ArgumentsFieldKey } | { readonly literal: string };

export interface SlotMapping {
  readonly userId: SlotSource;
  readonly password: SlotSource;
}

export interface BlobFieldOverride {
  readonly label?: string;
  readonly hint?: string;
  readonly default?: string;
  readonly required?: boolean;
}

export interface PresetDefaults {
  readonly fields: Readonly<Partial<Record<ArgumentsFieldKey, string>>>;
  readonly gateways: readonly Gateway[];
  readonly authParams?: Partial<AuthParams>;
}

export interface ArgumentsPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly clientVersionId: ClientVersionId;
  readonly fields: readonly ArgumentsField[];
  readonly tokenEncoding: TokenEncoding;
  readonly pair?: { readonly first: PairHalf; readonly second: PairHalf };
  readonly slots?: SlotMapping;
  readonly cipher?: CipherOptions;
  readonly blob?: Partial<Record<AuthParamKey, BlobFieldOverride>>;
  readonly grammar: ArgumentsGrammar;
  readonly defaults: PresetDefaults;
}

export const UNRANKED_FREE_PASS_RANK = -999999;

export function encodeRanking(ranking: number, freePass: boolean): number {
  if (!freePass) return ranking;
  return ranking > 0 ? -ranking : UNRANKED_FREE_PASS_RANK;
}

const FIELD = {
  token: {
    key: 'token',
    label: 'Auth token',
    kind: 'text',
    required: true,
    hint: 'Authorization session key.',
  },
  usernameHash: {
    key: 'usernameHash',
    label: 'Username hash',
    kind: 'text',
    required: true,
    hint: 'Hashed account username.',
  },
  passwordHash: {
    key: 'passwordHash',
    label: 'Password hash',
    kind: 'text',
    required: true,
    hint: 'Hashed account password.',
  },
  userId: { key: 'userId', label: 'Username', kind: 'text', required: true, hint: 'Account username.' },
  password: { key: 'password', label: 'Password', kind: 'secret', required: true, hint: 'Account password.' },
  mode: {
    key: 'mode',
    label: 'Connection mode',
    kind: 'select',
    default: 'INET',
    options: [
      { value: 'INET', label: 'INET' },
      { value: 'O2_INET', label: 'O2_INET' }
    ],
    hint: 'O2_INET sends gender as m/f, INET as 1/2.',
  },
  gender: {
    key: 'gender',
    label: 'Gender',
    kind: 'select',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  ranking: { key: 'ranking', label: 'Ranking', kind: 'number', default: '0', hint: '0 is unranked.' },
  freePass: {
    key: 'freePass',
    label: 'FreePass active',
    kind: 'boolean',
    default: 'false',
    hint: `Negates the ranking (${UNRANKED_FREE_PASS_RANK} when unranked). The sign is the flag.`,
  },
  ftpHost: { key: 'ftpHost', label: 'FTP host', kind: 'text', default: '127.0.0.1', hint: 'Music shop download server.' },
  ftpPort: { key: 'ftpPort', label: 'FTP port', kind: 'number', default: '21' },
  ftpPath: { key: 'ftpPath', label: 'FTP path', kind: 'text', default: 'O2Jam/Music' },
  gateways: {
    key: 'gateways',
    label: 'Gateways',
    kind: 'gateways',
    hint: `Default port ${DEFAULT_GATEWAY_PORT}. Duplicate entries are allowed so one gateway instance can back several Planets.`,
  },
} as const satisfies Partial<Record<ArgumentsFieldKey, ArgumentsField>>;

const defaultGateways: readonly Gateway[] = [{ address: '127.0.0.1', port: DEFAULT_GATEWAY_PORT }];

const VERSION_310_AND_382_FIELDS = [FIELD.token, FIELD.ftpHost, FIELD.ftpPort, FIELD.ftpPath, FIELD.gateways] as const;
const VERSION_310_AND_382_DEFAULTS: PresetDefaults = {
  fields: { ftpHost: '127.0.0.1', ftpPort: '21', ftpPath: 'O2Jam' },
  gateways: defaultGateways,
};

const VERSION_665_AND_802_DEFAULTS: PresetDefaults = { fields: {}, gateways: defaultGateways };

const ENCORE_BLOB: Partial<Record<AuthParamKey, BlobFieldOverride>> = {
  username: {
    label: 'Auth token',
    hint: 'Authorization session key.',
    required: true,
  },
};

export const ARGUMENTS_PRESETS: readonly ArgumentsPreset[] = [
  {
    id: '2.33-default',
    name: 'Default',
    description: 'NOWCOM default launch string.',
    clientVersionId: '2.33',
    fields: [FIELD.usernameHash, FIELD.passwordHash],
    tokenEncoding: 'plain',
    pair: { first: { field: 'usernameHash' }, second: { field: 'passwordHash' } },
    grammar: VERSION_233_GRAMMAR,
    defaults: { fields: {}, gateways: [] },
  },
  {
    id: '2.33-crosstime-encore',
    name: 'CrossTime.Encore',
    description: 'Auth token authentication scheme.',
    clientVersionId: '2.33',
    fields: [FIELD.token],
    tokenEncoding: 'plain',
    pair: { first: { field: 'token' }, second: { random: 32 } },
    grammar: {
      template: 'OTwo.exe <auth_token>#<random_32_characters>',
      example: 'OTwo.exe 3F2504E04F8911D39A0C0305E82C3301#D41D8CD98F00B204E9800998ECF8427E',
    },
    defaults: { fields: {}, gateways: [] },
  },
  {
    id: '3.10-default',
    name: 'Default',
    description: 'e-Games default launch string.',
    clientVersionId: '3.10',
    fields: VERSION_310_AND_382_FIELDS,
    tokenEncoding: 'base64-utf16be',
    grammar: VERSION_310_AND_382_GRAMMAR,
    defaults: VERSION_310_AND_382_DEFAULTS,
  },
  {
    id: '3.82-default',
    name: 'Default',
    description: 'e-Games default launch string.',
    clientVersionId: '3.82',
    fields: VERSION_310_AND_382_FIELDS,
    tokenEncoding: 'base64-utf16be',
    grammar: VERSION_310_AND_382_GRAMMAR,
    defaults: VERSION_310_AND_382_DEFAULTS,
  },
  {
    id: '5.89-default',
    name: 'Default',
    description: 'NOWCOM default launch string.',
    clientVersionId: '5.89',
    fields: [
      FIELD.mode,
      FIELD.userId,
      FIELD.password,
      FIELD.gender,
      FIELD.ranking,
      FIELD.freePass,
      FIELD.ftpHost,
      FIELD.ftpPort,
      FIELD.ftpPath,
      FIELD.gateways,
    ],
    tokenEncoding: 'plain',
    slots: { userId: { field: 'userId' }, password: { field: 'password' } },
    grammar: VERSION_589_GRAMMAR,
    defaults: {
      fields: { mode: 'INET', ftpHost: '127.0.0.1', ftpPort: '21', ftpPath: 'O2Jam/Music', ranking: '0' },
      gateways: defaultGateways,
    },
  },
  {
    id: '5.89-identity-encore',
    name: 'Identity.Encore',
    description: 'Auth token authentication scheme.',
    clientVersionId: '5.89',
    fields: [
      FIELD.mode,
      FIELD.token,
      FIELD.gender,
      FIELD.ranking,
      FIELD.freePass,
      FIELD.ftpHost,
      FIELD.ftpPort,
      FIELD.ftpPath,
      FIELD.gateways,
    ],
    tokenEncoding: 'plain',
    slots: { userId: { field: 'token' }, password: { literal: '_' } },
    grammar: VERSION_589_GRAMMAR,
    defaults: {
      fields: { mode: 'INET', ftpHost: '127.0.0.1', ftpPort: '21', ftpPath: 'O2Jam/Music', ranking: '0' },
      gateways: defaultGateways,
    },
  },
  {
    id: '6.65-default',
    name: 'Default',
    description: 'NOWCOM default launch string.',
    clientVersionId: '6.65',
    fields: [],
    tokenEncoding: 'plain',
    cipher: IDENTITY_P2_CIPHER_OPTIONS,
    blob: { username: { required: true }, gameVersion: { default: '6.65' } },
    grammar: VERSION_665_AND_802_GRAMMAR,
    defaults: VERSION_665_AND_802_DEFAULTS,
  },
  {
    id: '6.65-identity-p2-encore',
    name: 'IdentityP2.Encore',
    description: 'Auth token authentication scheme.',
    clientVersionId: '6.65',
    fields: [],
    tokenEncoding: 'plain',
    cipher: IDENTITY_P2_CIPHER_OPTIONS,
    blob: { ...ENCORE_BLOB, gameVersion: { default: '6.65' } },
    grammar: VERSION_665_AND_802_GRAMMAR,
    defaults: VERSION_665_AND_802_DEFAULTS,
  },
  {
    id: '8.02-default',
    name: 'Default',
    description: 'NOWCOM default launch string.',
    clientVersionId: '8.02',
    fields: [],
    tokenEncoding: 'plain',
    cipher: MEMORYER_CIPHER_OPTIONS,
    blob: { username: { required: true }, gameVersion: { default: '8.02' } },
    grammar: VERSION_665_AND_802_GRAMMAR,
    defaults: VERSION_665_AND_802_DEFAULTS,
  },
  {
    id: '8.02-memoryer-encore',
    name: 'Memoryer.Encore',
    description: 'Auth token authentication scheme.',
    clientVersionId: '8.02',
    fields: [],
    tokenEncoding: 'plain',
    cipher: MEMORYER_CIPHER_OPTIONS,
    blob: { ...ENCORE_BLOB, gameVersion: { default: '8.02' } },
    grammar: VERSION_665_AND_802_GRAMMAR,
    defaults: VERSION_665_AND_802_DEFAULTS,
  },
];

export interface ResolvedBlobField {
  readonly key: AuthParamKey;
  readonly index: number;
  readonly label: string;
  readonly hint: string;
  readonly default: string;
  readonly required: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly inert?: boolean;
  readonly maxLength: number;
}

export function blobFieldsFor(preset: ArgumentsPreset): ResolvedBlobField[] {
  return AUTH_PARAM_FIELDS.filter((f) => f.key !== 'gatewayAddress' && f.key !== 'gatewayPort').map((f) => {
    const override = preset.blob?.[f.key];
    return {
      key: f.key,
      index: f.index,
      label: override?.label ?? f.label,
      hint: override?.hint ?? f.hint,
      default: override?.default ?? f.default,
      required: override?.required ?? false,
      options: f.options,
      inert: f.inert,
      maxLength: f.maxLength,
    };
  });
}

export function presetsForVersion(versionId: ClientVersionId): ArgumentsPreset[] {
  return ARGUMENTS_PRESETS.filter((preset) => preset.clientVersionId === versionId);
}

export function findPreset(id: string): ArgumentsPreset | undefined {
  return ARGUMENTS_PRESETS.find((preset) => preset.id === id);
}

export function getPreset(id: string): ArgumentsPreset {
  const preset = findPreset(id);
  if (!preset) throw new Error(`unknown launch preset "${id}"`);
  return preset;
}
