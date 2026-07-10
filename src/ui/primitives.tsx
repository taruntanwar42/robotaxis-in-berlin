import type { ReactNode } from "react";

/** Citation chip — every displayed number wears one. `sim` marks values
 * computed by our own pipeline (dashed ring, links to the methods section). */
export function Chip({ href, children, sim }: { href: string; children: ReactNode; sim?: boolean }) {
  return (
    <a
      className={sim ? "chip sim" : "chip"}
      href={href}
      target={href.startsWith("#") ? undefined : "_blank"}
      rel="noreferrer"
    >
      {sim ? "sim" : "src"} · {children}
    </a>
  );
}

export function Stat({ value, label, gold }: { value: ReactNode; label: string; gold?: boolean }) {
  return (
    <div className="stat">
      <b className={gold ? "gold" : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  children,
  panel = true,
  stage = false,
}: {
  id: string;
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  panel?: boolean;
  stage?: boolean;
}) {
  return (
    <section className={stage ? "section stage" : "section"} id={id}>
      <div className="section-inner">
        <div className={panel ? "panel" : undefined}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h2>{title}</h2>}
          {children}
        </div>
      </div>
    </section>
  );
}

export function LineRail({
  stations,
  active,
}: {
  stations: { id: string; name: string }[];
  active: string;
}) {
  return (
    <nav className="rail" aria-label="Sections">
      {stations.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={s.id === active ? "active" : undefined}>
          <span className="dot" aria-hidden="true" />
          <span className="name">{s.name}</span>
        </a>
      ))}
    </nav>
  );
}
