type ScrollTarget = {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => unknown;
};

export function normalizeDecimalInput(input: Pick<HTMLInputElement, 'value' | 'selectionStart' | 'selectionEnd' | 'setSelectionRange'>): string {
  if (input.value.includes(',')) {
    const { selectionStart, selectionEnd } = input;
    input.value = input.value.replaceAll(',', '.');
    input.setSelectionRange(selectionStart, selectionEnd);
  }

  return input.value;
}

export function scrollNearest(element: ScrollTarget | null): void {
  element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

type ControlWheelEvent = Event & {
  readonly ctrlKey: boolean;
  readonly deltaY: number;
};

export function listenForControlWheel(target: EventTarget, onDelta: (deltaY: number) => void): () => void {
  const handleWheel = (event: Event) => {
    const wheel = event as ControlWheelEvent;
    if (!wheel.ctrlKey) {
      return;
    }

    wheel.preventDefault();
    onDelta(wheel.deltaY);
  };

  target.addEventListener('wheel', handleWheel, { passive: false });
  return () => target.removeEventListener('wheel', handleWheel);
}

export type SaveFilePickerOptions = {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type SaveFileHandle = {
  name: string;
  createWritable: () => Promise<{
    write: (value: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<SaveFileHandle>;

export async function saveBytesAs(bytes: Uint8Array, suggestedName: string, picker: SaveFilePicker): Promise<string> {
  const extensionIndex = suggestedName.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? suggestedName.slice(extensionIndex) : '';
  const handle = await picker({
    suggestedName,
    types: [{
      description: 'O2Jam file',
      accept: { 'application/octet-stream': extension ? [extension] : [] },
    }],
  });

  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return handle.name;
}
