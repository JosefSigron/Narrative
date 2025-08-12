'use client';

import { useEffect, useRef } from 'react';

export default function FloatingShapes() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('[data-shape]')) as HTMLElement[];
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const time = (t - start) / 1000;
      items.forEach((it, idx) => {
        const amp = 6 + (idx % 3) * 3;
        const speed = 0.4 + (idx % 4) * 0.12;
        const y = Math.sin(time * speed + idx) * amp;
        const x = Math.cos(time * speed * 0.6 + idx) * (amp * 0.5);
        it.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-6 left-6 w-24 h-24 rounded-full bg-saffron-500/20 blur-2xl" data-shape />
      <div className="absolute top-12 right-10 w-32 h-32 rounded-full bg-sandy_brown-500/20 blur-2xl" data-shape />
      <div className="absolute bottom-10 left-1/3 w-28 h-28 rounded-full bg-burnt_sienna-500/20 blur-2xl" data-shape />
      <div className="absolute top-1/3 right-1/4 w-20 h-20 rounded-full bg-persian_green-500/15 blur-2xl" data-shape />
    </div>
  );
}


