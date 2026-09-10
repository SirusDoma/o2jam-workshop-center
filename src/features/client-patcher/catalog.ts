import { validateDefinition } from './validation.ts';

const modules = import.meta.glob('./patches/*.json', { eager: true, import: 'default' });
export const BUILTIN_PATCHES = Object.values(modules).map(validateDefinition);
