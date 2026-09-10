export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  sub = false,
  id,
}: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  sub?: boolean;
  id?: string;
}) {
  return (
    <div className={`tabs${sub ? ' subtabs' : ''}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          id={id ? `${id}-${t.id}` : undefined}
          aria-controls={id ? `${id}-${t.id}-panel` : undefined}
          tabIndex={active === t.id ? 0 : -1}
          className={`tab${active === t.id ? ' on' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(event) => {
            const index = tabs.findIndex((tab) => tab.id === t.id);
            let next = index;

            if (event.key === 'ArrowRight') {
              next = (index + 1) % tabs.length;
            } else if (event.key === 'ArrowLeft') {
              next = (index + tabs.length - 1) % tabs.length;
            } else if (event.key === 'Home') {
              next = 0;
            } else if (event.key === 'End') {
              next = tabs.length - 1;
            } else {
              return;
            }

            event.preventDefault();
            onChange(tabs[next]!.id);
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          }}
        >
          {t.label}
          {t.count !== undefined && <span className="n"> {t.count}</span>}
        </button>
      ))}
    </div>
  );
}
