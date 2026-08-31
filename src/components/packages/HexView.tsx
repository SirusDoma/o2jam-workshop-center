import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtOffset } from '../../format';

export interface HexHighlight {
  offset: number;
  length: number;
}

export function HexView({
  data,
  start = 0,
  length = 512,
  highlight,
}: {
  data: Uint8Array;
  start?: number;
  length?: number;
  highlight?: HexHighlight | null;
}) {
  const rows = useMemo(() => {
    const from = Math.max(0, Math.min(start, data.length));
    const to = Math.min(data.length, from + length);
    const out: { offset: number; bytes: number[]; }[] = [];
    for (let i = from; i < to; i += 16) {
      out.push({ offset: i, bytes: Array.from(data.subarray(i, Math.min(i + 16, to))) });
    }
    return out;
  }, [data, start, length]);

  const [sel, setSel] = useState<{ mode: 'hex' | 'ascii'; a: number; b: number; } | null>(null);
  const dragging = useRef(false);
  const clipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const selText = useMemo(() => {
    if (!sel) {
      return '';
    }

    const lo = Math.min(sel.a, sel.b);
    const hi = Math.max(sel.a, sel.b);
    const slice = Array.from(data.subarray(lo, hi + 1));
    return sel.mode === 'hex'
      ? slice.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
      : slice.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  }, [sel, data]);

  useEffect(() => {
    const el = clipRef.current;
    const native = window.getSelection();
    if (!el || !native) {
      return;
    }

    if (!sel) {
      if (native.anchorNode && el.contains(native.anchorNode)) {
        native.removeAllRanges();
      }

      return;
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    native.removeAllRanges();
    native.addRange(range);
  }, [sel, selText]);

  const press = (mode: 'hex' | 'ascii', index: number) => {
    dragging.current = true;
    setSel({ mode, a: index, b: index });
  };
  const enter = (index: number) => {
    if (dragging.current) {
      setSel((s) => (s ? { ...s, b: index } : s));
    }
  };

  const lit = (index: number) =>
    highlight != null && index >= highlight.offset && index < highlight.offset + highlight.length;
  const selLo = sel ? Math.min(sel.a, sel.b) : -1;
  const selHi = sel ? Math.max(sel.a, sel.b) : -1;

  if (rows.length === 0) {
    return <div className="empty">NOTHING TO SHOW</div>;
  }

  return (
    <div
      className="hexview"
      onMouseDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) {
          setSel(null);
        }
      }}
    >
      <span ref={clipRef} className="hx-clip">
        {selText}
      </span>
      {rows.map((row) => (
        <Row key={row.offset} offset={row.offset} bytes={row.bytes} lit={lit} selLo={selLo} selHi={selHi} press={press} enter={enter} />
      ))}
    </div>
  );
}

function Row({
  offset,
  bytes,
  lit,
  selLo,
  selHi,
  press,
  enter,
}: {
  offset: number;
  bytes: number[];
  lit: (index: number) => boolean;
  selLo: number;
  selHi: number;
  press: (mode: 'hex' | 'ascii', index: number) => void;
  enter: (index: number) => void;
}) {
  const inSel = (index: number) => index >= selLo && index <= selHi;
  return (
    <>
      <span className="hx-off">{fmtOffset(offset)}</span>
      <span className="hx-bytes">
        {bytes.map((b, i) => {
          const index = offset + i;
          const text = `${b.toString(16).toUpperCase().padStart(2, '0')}${i === 15 ? '' : ' '}`;
          if (lit(index)) {
            return <mark key={i}>{text}</mark>;
          }

          return (
            <span
              key={i}
              className={inSel(index) ? 'hx-sel' : undefined}
              onMouseDown={(e) => {
                if (e.button !== 0) {
                  return;
                }

                e.preventDefault();
                press('hex', index);
              }}
              onMouseEnter={() => enter(index)}
            >
              {text}
            </span>
          );
        })}
      </span>
      <span className="hx-ascii">
        {bytes.map((b, i) => {
          const index = offset + i;
          const ch = b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
          if (lit(index)) {
            return <mark key={i}>{ch}</mark>;
          }

          return (
            <span
              key={i}
              className={inSel(index) ? 'hx-sel' : undefined}
              onMouseDown={(e) => {
                if (e.button !== 0) {
                  return;
                }

                e.preventDefault();
                press('ascii', index);
              }}
              onMouseEnter={() => enter(index)}
            >
              {ch}
            </span>
          );
        })}
      </span>
    </>
  );
}
