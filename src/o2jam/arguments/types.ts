export interface Gateway {
  readonly address: string;
  readonly port: string | number;
}

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly index?: number;
}

export type FieldKind = 'text' | 'secret' | 'number' | 'select' | 'boolean' | 'gateways';

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldDescriptor<K extends string = string> {
  readonly key: K;
  readonly label: string;
  readonly kind: FieldKind;
  readonly default?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly options?: readonly FieldOption[];
  readonly suggestions?: readonly string[];
  readonly inert?: boolean;
}

export class FormatError extends Error {
  readonly index?: number;
  readonly position?: number;

  constructor(message: string, index?: number, position?: number) {
    super(message);
    this.name = 'FormatError';
    this.index = index;
    this.position = position;
  }
}

export function validationError(code: string, message: string, field?: string, index?: number): ValidationIssue {
  return { code, message, field, index };
}
