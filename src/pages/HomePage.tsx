import { Plus } from 'lucide-react';
import { StackHead } from '../components/Shell';
import { ToolTile } from '../components/home/ToolTile';
import { TOOL_CATALOG } from '../toolCatalog';

export default function HomePage() {
  return (
    <>
      <section className="card">
        <StackHead title="Tools" />
        <div className="cardgrid pad">
          {TOOL_CATALOG.map((tool) => (
            <ToolTile key={tool.path} to={tool.path} icon={tool.icon} title={tool.label} sub={tool.description} />
          ))}
          <div className="card tilecard soon" aria-disabled="true">
            <div className="tc-head">
              <Plus size={17} />
              <span className="tc-title">More tools</span>
            </div>
            <span className="tc-sub">Coming soon.</span>
          </div>
        </div>
      </section>
    </>
  );
}
