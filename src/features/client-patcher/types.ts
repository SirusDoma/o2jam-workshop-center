export type Scalar = string | number | boolean;
export type Row = Record<string, Scalar>;
export type Value = Scalar | Row[];
export type Values = Record<string, Value>;
export type Condition =
  | { input: string; equals: Scalar }
  | { input: string; empty: boolean }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface InputDefinition {
  group?: string;
  id: string;
  label: string;
  description?: string;
  control: 'checkbox' | 'toggle' | 'radio' | 'select' | 'text' | 'number' | 'rows';
  default?: Value;
  options?: { label: string; value: Scalar }[];
  fields?: InputDefinition[];
  maxRows?: number;
  uniqueBy?: string;
  addLabel?: string;
  minFrom?: string;
  maxFrom?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  format?: 'filename' | 'ipv4' | 'hostname' | 'url' | 'url-origin' | 'port';
  visibleWhen?: Condition;
}

export interface Locator {
  signature: string;
  section?: string;
  rva?: number;
  offset?: number;
}

export interface ValueSource {
  input: string;
  part?: 'origin';
  prefix?: string;
  suffix?: string;
}

export interface HookFixup {
  offset: number;
  encoding: 'u8' | 'u32le' | 'rel32' | 'rows-u32le';
  fields?: string[];
  capacity?: number;
  relativeTo?: number;
  value:
    | { input: string }
    | { at: Locator; read?: 'u32le' | 'rel32' }
    | { originalOffset: number; read: 'u32le' | 'rel32' }
    | { continuation: true }
    | { codeOffset: number };
}

export interface HookOperation {
  type: 'hook';
  at: Locator;
  original: string;
  code: string;
  writable?: boolean;
  fixups?: HookFixup[];
  when?: Condition;
  payloadRva?: number;
  matchedBytes?: string;
  matchedCode?: string;
}

export type Operation =
  | HookOperation
  | {
      type: 'bytes';
      at: Locator;
      original: string;
      replacement: string;
      when?: Condition;
    }
  | {
      type: 'string';
      original?: string;
      value: ValueSource;
      references: Locator[];
      sourceRva?: number;
      encoding?: 'ascii' | 'utf16le' | 'euc-kr';
      referenceScope?: 'all' | 'listed';
      when?: Condition;
    }
  | {
      type: 'value';
      at: Locator;
      original: string;
      readCurrent?: boolean;
      value: ValueSource;
      encoding:
        | 'u8'
        | 'u16le'
        | 'u32le'
        | 'f32le'
        | 'ascii'
        | 'utf16le'
        | 'hex'
        | 'length8'
        | 'length16le'
        | 'length32le';
      size: number;
      when?: Condition;
    };

export interface ClientDefinition {
  version: string;
  imageBase?: number;
  entryPoint?: number;
  anchors?: { rva: number; bytes: string }[];
}

export interface PatchVariant {
  client: ClientDefinition;
  defaults?: Values;
  operations: Operation[];
}

export interface PatchDefinition {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  category: string;
  group?: string;
  order?: number;
  inputs: InputDefinition[];
  variants: PatchVariant[];
  requires?: string[];
  conflicts?: string[];
}

export interface CompatiblePatch {
  definition: PatchDefinition;
  variant: PatchVariant;
  values: Values;
}

export interface Selection {
  patch: CompatiblePatch;
  values: Values;
}

export interface Write {
  offset: number;
  before: Uint8Array;
  after: Uint8Array;
  patchId: string;
}
