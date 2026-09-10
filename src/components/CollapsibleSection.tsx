import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="collapsible-section"
      aria-label={title}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="stackhead">
        <span>{title}</span>
        <ChevronDown size={13} />
      </summary>
      {children}
    </details>
  );
}
