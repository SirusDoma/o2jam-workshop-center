import type { ReactNode } from 'react';

export function FileInputCard({ children, padded = false }: { children: ReactNode; padded?: boolean; }) {
  return <section className="card">{padded ? <div className="pad">{children}</div> : children}</section>;
}
