import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

export function ToolTile({
  to,
  icon: Icon,
  title,
  sub,
}: {
  to: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  sub: string;
}) {
  return (
    <Link to={to} className="card tilecard">
      <div className="tc-head">
        <Icon size={17} />
        <span className="tc-title">{title}</span>
      </div>
      <span className="tc-sub">{sub}</span>
    </Link>
  );
}
