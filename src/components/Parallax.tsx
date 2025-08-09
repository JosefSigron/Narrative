'use client';

import React, { PropsWithChildren, useEffect, useRef } from 'react';

type ParallaxProps = PropsWithChildren<{
  speed?: number; // positive moves slower, negative moves faster
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}>;

export default function Parallax({ speed = 0.2, className = '', as = 'div', children }: ParallaxProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    let raf = 0;
    const baseTop = el.getBoundingClientRect().top + window.scrollY;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = (window.scrollY - baseTop) * speed;
        el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [speed]);

  const Component: any = as;
  return (
    <Component ref={ref as any} className={className}>
      {children}
    </Component>
  );
}


