'use client';

import React, { PropsWithChildren, useEffect, useRef } from 'react';

type MarqueeProps = PropsWithChildren<{
  speed?: number; // pixels per second
  pauseOnHover?: boolean;
  className?: string;
}>;

export default function Marquee({ speed = 60, pauseOnHover = true, className = '', children }: MarqueeProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inner = el.querySelector('[data-marquee-inner]') as HTMLDivElement | null;
    if (!inner) return;
    let raf = 0;
    let x = 0;
    const tick = () => {
      x -= speed / 60;
      const width = inner.scrollWidth / 2;
      if (-x >= width) x = 0;
      inner.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <div ref={ref} className={`overflow-hidden ${className}`} data-marquee>
      <div className="flex gap-8 whitespace-nowrap will-change-transform" data-marquee-inner>
        <div className="flex gap-8 items-center">{children}</div>
        <div className="flex gap-8 items-center" aria-hidden>{children}</div>
      </div>
    </div>
  );
}


