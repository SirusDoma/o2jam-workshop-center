
import type { Bound } from './bound';

export interface ControlTypeInfo {
  code: number;
  key: string;
  label: string;
}

export const CONTROL_TYPES: readonly ControlTypeInfo[] = [
  { code: 0x00, key: 'state', label: 'State' },
  { code: 0x01, key: 'toggle', label: 'Toggle / Radio / Checkbox' },
  { code: 0x02, key: 'scrollbar', label: 'Scroll Bar' },
  { code: 0x10, key: 'image', label: 'Image / Sprite' },
  { code: 0x20, key: 'button', label: 'Button' },
  { code: 0x30, key: 'input', label: 'Input Text Box' },
  { code: 0x50, key: 'interactable', label: 'Interactable' },
  { code: 0x60, key: 'set', label: 'SET member' },
  { code: 0x70, key: 'avatar', label: 'Avatar' },
];

export function controlTypeLabel(code: number): string {
  return CONTROL_TYPES.find((t) => t.code === code)?.label ?? `Unknown (0x${code.toString(16)})`;
}

export interface ControlEntry {
  token: string;
  id: number;
  idHex: string;
  stateId: number;
  type: number;
  typeLabel: string;
  groupId: number;
  nodeId: number;
  sprite: string;
  setId: number | null;
  boundIndex: number;
  line: number;
}

export interface ControlSet {
  id: number;
  declaredCount: number;
  controls: ControlEntry[];
  line: number;
}

export interface ControlState {
  name: string;
  kind: 'state' | 'dialog';
  declaredCount: number;
  declaredSetCount: number | null;
  base: ControlEntry | null;
  baseId: number;
  boundFile: string | null;
  controls: ControlEntry[];
  sets: ControlSet[];
  line: number;
}

export interface ControlList {
  declaredStates: number;
  declaredDialogs: number;
  states: ControlState[];
  dialogs: ControlState[];
}

const TOKEN = /"[^"]*"|\S+/g;

function tokenize(line: string): string[] {
  const stripped = line.trim();
  if (stripped === '' || stripped.startsWith('//')) {
    return [];
  }

  return stripped.match(TOKEN) ?? [];
}

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2
    ? value.slice(1, -1)
    : value;
}

export function parseControlList(text: string): ControlList {
  const lines = text.split(/\r?\n/);
  const states: ControlState[] = [];
  const dialogs: ControlState[] = [];

  let declaredStates = 0;
  let declaredDialogs = 0;
  let section: 'state' | 'dialog' = 'state';
  let i = 0;

  const hex = (token: string | undefined): number => {
    if (token === undefined) {
      return 0;
    }

    const value = parseInt(token, 16);
    if (!Number.isFinite(value)) {
      return 0;
    }

    return value >>> 0;
  };

  const makeControl = (
    tokens: string[],
    lineNo: number,
    setId: number | null,
    boundIndex: number,
  ): ControlEntry => {
    const id = hex(tokens[1]);
    return {
      token: tokens[0] ?? '',
      id,
      idHex: `0x${id.toString(16).toUpperCase().padStart(8, '0')}`,
      stateId: (id >>> 24) & 0xff,
      type: (id >>> 16) & 0xff,
      typeLabel: controlTypeLabel((id >>> 16) & 0xff),
      groupId: (id >>> 8) & 0xff,
      nodeId: id & 0xff,
      sprite: tokens[2] === undefined ? '' : unquote(tokens[2]),
      setId,
      boundIndex,
      line: lineNo,
    };
  };

  const consumeOpenBrace = (headerTokens: string[]): boolean => {
    if (headerTokens[headerTokens.length - 1] === '{') {
      return true;
    }

    while (i < lines.length) {
      const tokens = tokenize(lines[i] ?? '');
      if (tokens.length === 0) {
        i++;
        continue;
      }

      if (tokens[0] === '{') {
        i++;
        return true;
      }

      return false;
    }
    return false;
  };

  while (i < lines.length) {
    const lineNo = i + 1;
    const tokens = tokenize(lines[i] ?? '');
    i++;
    if (tokens.length === 0) {
      continue;
    }

    const head = tokens[0] ?? '';

    if (head === '{' || head === '}') {
      continue;
    }

    if (head.startsWith('NUMBER_OF_')) {
      if (head === 'NUMBER_OF_STATE' || head === 'NUMBER_OF_STATES') {
        declaredStates = hex(tokens[1]);
        section = 'state';
      } else if (head === 'NUMBER_OF_DIALOG' || head === 'NUMBER_OF_DIALOGS') {
        declaredDialogs = hex(tokens[1]);
        section = 'dialog';
      }

      continue;
    }

    const kind: 'state' | 'dialog' = head.startsWith('DIALOG_')
      ? 'dialog'
      : head.startsWith('STATE_')
        ? 'state'
        : section;

    const state: ControlState = {
      name: head,
      kind,
      declaredCount: hex(tokens[1]),
      declaredSetCount: tokens[2] === undefined || tokens[2] === '{' ? null : hex(tokens[2]),
      base: null,
      baseId: 0,
      boundFile: null,
      controls: [],
      sets: [],
      line: lineNo,
    };

    if (!consumeOpenBrace(tokens)) {
      (kind === 'dialog' ? dialogs : states).push(state);
      continue;
    }

    while (i < lines.length) {
      const bodyLineNo = i + 1;
      const body = tokenize(lines[i] ?? '');
      i++;
      if (body.length === 0) {
        continue;
      }

      const token = body[0] ?? '';
      if (token === '}') {
        break;
      }

      if (token === 'BOUND') {
        const file = unquote(body[1] ?? '');
        state.boundFile = file;
        continue;
      }

      if (token === 'SET') {
        const set: ControlSet = {
          declaredCount: hex(body[1]),
          id: hex(body[2]),
          controls: [],
          line: bodyLineNo,
        };
        state.sets.push(set);

        if (!consumeOpenBrace(body)) {
          continue;
        }

        while (i < lines.length) {
          const setLineNo = i + 1;
          const setBody = tokenize(lines[i] ?? '');
          i++;
          if (setBody.length === 0) {
            continue;
          }

          const setToken = setBody[0] ?? '';
          if (setToken === '}') {
            break;
          }

          if (setToken === 'SET') {
            continue;
          }

          const control = makeControl(setBody, setLineNo, set.id, state.controls.length);
          set.controls.push(control);
          state.controls.push(control);
        }

        continue;
      }

      if (state.base === null) {
        const base = makeControl(body, bodyLineNo, null, -1);
        state.base = base;
        state.baseId = base.id;
        continue;
      }

      state.controls.push(makeControl(body, bodyLineNo, null, state.controls.length));
    }

    (kind === 'dialog' ? dialogs : states).push(state);
  }

  return { declaredStates, declaredDialogs, states, dialogs };
}


export function writeControlList(list: ControlList): string {
  const out: string[] = [];
  const id8 = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  const cnt = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(2, '0')}`;
  const quote = (s: string) => `"${s}"`;

  const emitControl = (c: ControlEntry, indent: string) => {
    const parts = [c.token, id8(c.id)];
    if (c.sprite) {
      parts.push(quote(c.sprite));
    }

    out.push(indent + parts.join('\t'));
  };

  const emitBlock = (block: ControlState) => {
    const nonSet = block.controls.filter((c) => c.setId === null).length;
    const setCount = new Set(block.controls.filter((c) => c.setId !== null).map((c) => c.setId)).size;
    out.push(block.kind === 'dialog' ? `${block.name}\t${cnt(nonSet)}` : `${block.name}\t${cnt(nonSet)}\t${cnt(setCount)}`);
    out.push('{');
    if (block.boundFile) {
      out.push(`\tBOUND\t${quote(block.boundFile)}`);
    }

    if (block.base) {
      emitControl(block.base, '\t');
    }

    let i = 0;
    while (i < block.controls.length) {
      const c = block.controls[i]!;
      if (c.setId === null) {
        emitControl(c, '\t');
        i++;
        continue;
      }

      const sid = c.setId;
      const members: ControlEntry[] = [];
      while (i < block.controls.length && block.controls[i]!.setId === sid) members.push(block.controls[i++]!);
      out.push(`\tSET ${cnt(members.length)}\t${id8(sid)}`);
      out.push('\t{');
      for (const m of members) emitControl(m, '\t\t');
      out.push('\t}');
    }

    out.push('}');
    out.push('');
  };

  out.push(`NUMBER_OF_STATE\t${cnt(list.states.length)}`);
  out.push('');
  for (const block of list.states) emitBlock(block);
  out.push(`NUMBER_OF_DIALOG\t${cnt(list.dialogs.length)}`);
  out.push('');
  for (const block of list.dialogs) emitBlock(block);

  return out.join('\r\n');
}


export interface PairedBound {
  id: number;
  control: ControlEntry | null;
  bound: Bound;
}

export function pairBounds(state: ControlState, bounds: readonly Bound[]): PairedBound[] {
  const paired: PairedBound[] = [];
  let consumed = 0;

  for (const control of state.controls) {
    const bound = bounds[consumed];
    if (!bound) {
      break;
    }

    paired.push({ id: control.id, control, bound });
    consumed++;
  }

  let id = state.baseId + consumed;
  for (let n = consumed; n < bounds.length; n++) {
    const bound = bounds[n];
    if (!bound) {
      continue;
    }

    paired.push({ id: ++id, control: null, bound });
  }

  return paired;
}
