export type { FieldDescriptor, FieldKind, FieldOption, Gateway, ValidationIssue } from './types';
export { FormatError, validationError } from './types';

export type { AuthParamField, AuthParamKey, AuthParams } from './authparams';
export {
  AUTH_PARAM_DEFAULTS,
  AUTH_PARAM_FIELDS,
  AUTH_PARAM_FIELD_COUNT,
  AUTH_PARAM_KEYS,
  AUTH_PARAM_MAX_LENGTH,
  parseAuthParams,
  resolveAuthParams,
  serialiseAuthParams,
  validateAuthParams,
} from './authparams';

export type { Cipher, CipherOptions, RoundTripResult } from './rsa';
export {
  IDENTITY_P2_CIPHER_OPTIONS,
  IDENTITY_P2_E,
  MEMORYER_CIPHER_OPTIONS,
  MEMORYER_E,
  RSA_D,
  RSA_N,
  RSA_P,
  RSA_Q,
  bugCompatibleModExp,
  createCipher,
  getCipher,
  identityP2Cipher,
  logCeil,
  memoryerCipher,
  modPow,
} from './rsa';

export type { TokenEncoding } from './token';
export {
  applyTokenEncoding,
  decodeBase64,
  decodeLaunchToken,
  encodeBase64,
  encodeLaunchToken,
  tryDecodeLaunchToken,
  utf16beBytes,
  utf16beText,
} from './token';

export type {
  BlobFieldOverride,
  ArgumentsField,
  ArgumentsFieldKey,
  ArgumentsGrammar,
  ArgumentsPreset,
  PairHalf,
  PresetDefaults,
  ResolvedBlobField,
  SlotMapping,
  SlotSource,
} from './presets';
export {
  ARGUMENTS_PRESETS,
  DEFAULT_GATEWAY_PORT,
  UNRANKED_FREE_PASS_RANK,
  blobFieldsFor,
  encodeRanking,
  findPreset,
  getPreset,
  presetsForVersion,
} from './presets';

export type { BuildResult, ArgumentsInput } from './build';
export { buildArguments } from './build';
