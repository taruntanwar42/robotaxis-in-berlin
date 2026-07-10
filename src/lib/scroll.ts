import { useEffect, useState } from "react";

/** Which section (by id) currently owns the viewport center.
 * Computed from geometry on scroll — deterministic for jumps, smooth
 * scrolling, and load alike. `ready` flips true once sections are in
 * the DOM. */
export function useActiveSection(ids: string[], ready: boolean): string {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (!ready) return;
    let raf = 0;

    const measure = () => {
      raf = 0;
      const cy = window.innerHeight / 2;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= cy) current = id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids, ready]);

  return active;
}
