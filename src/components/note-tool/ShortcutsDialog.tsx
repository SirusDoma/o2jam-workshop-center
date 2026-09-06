import { useEffect, useRef } from 'react';
import { CloseButton, Overlay } from '../Overlay';
import { formatShortcut, isMacPlatform } from '../../features/note-tool/shortcuts';

const SHORTCUT_GROUPS = [
  ['Selection Tool', [
    ['S', 'Activate Selection tool'],
    ['Click event', 'Select the event'],
    ['Ctrl / Shift + Click', 'Toggle an event in the selection'],
    ['Ctrl + A', 'Select all Main and Background notes'],
    ['Ctrl + D / Esc', 'Deselect all'],
    ['Ctrl + C', 'Copy selected notes'],
    ['Ctrl + V', 'Paste at the cursor’s vertical grid position'],
    ['Ctrl + Shift + V', 'Paste at the original positions'],
    ['Delete', 'Delete selected notes'],
  ]],
  ['Note Tool', [
    ['E', 'Activate Note tool'],
    ['Click', 'Place a note'],
    ['Right-click event', 'Delete the event'],
    ['Hold Shift', 'Temporary long note mode'],
  ]],
  ['Eraser Tool', [
    ['D', 'Activate Eraser tool'],
    ['Click event', 'Delete the event'],
  ]],
  ['Playback', [
    ['Space', 'Play / resume / pause at the current position'],
    ['Ctrl + Space', 'Play from the beginning / stop'],
    ['Esc', 'Stop playback'],
    ['Click / drag ruler', 'Move the playback line'],
  ]],
  ['View', [
    ['F2', 'Expand / restore the Note Tool panel'],
    ['PgUp / PgDn', 'Scroll to the next / previous measure'],
    ['Ctrl + Scroll', 'Change hi-speed over the note grid'],
    ['Right-click header', 'Reset column width'],
  ]],
  ['Events', [
    ['Ctrl + Z', 'Undo the last event edit'],
    ['Ctrl + Shift + Z', 'Redo the last event edit'],
  ]],
  ['Files', [
    ['Ctrl + S', 'Save the chart and sample bank'],
    ['Ctrl + O', 'Open OJN / OJM files'],
  ]],
] as const;

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    content.current?.querySelector('button')?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <Overlay label="Note Tool shortcuts" width="wide" onClose={onClose}>
      <div className="nt-shortcuts-dialog" ref={content} onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          content.current?.querySelector('button')?.focus();
        }
      }}>
        <div className="overlay-head">
          <div className="oh-main"><div className="oh-row"><span className="overlay-title">Shortcuts</span></div></div>
          <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
        </div>
        <div className="nt-shortcuts-body">
          <div className="nt-shortcuts-columns">
            {[SHORTCUT_GROUPS.slice(0, 3), SHORTCUT_GROUPS.slice(3)].map((groups, column) => (
              <div key={column}>
                {groups.map(([title, shortcuts]) => (
                  <section key={title}>
                    <h3>{title}</h3>
                    <dl>{shortcuts.map(([keys, description]) => (
                      <div key={keys}><dt><kbd>{formatShortcut(keys)}</kbd></dt><dd>{description}</dd></div>
                    ))}</dl>
                    {title === 'Events' && !isMacPlatform() ? <dl><div><dt><kbd>Ctrl + Y</kbd></dt><dd>Redo the last event edit</dd></div></dl> : null}
                  </section>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
