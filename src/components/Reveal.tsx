'use client';

import { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

type RevealProps = PropsWithChildren<{
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  delayMs?: number;
  outDelayMs?: number;
  threshold?: number;
  rootMargin?: string;
  mode?: 'progress' | 'toggle';
  offset?: [string, string];
}>;

export default function Reveal({
  as = 'div',
  className = '',
  delayMs = 0,
  outDelayMs = 100,
  threshold = 0.2,
  rootMargin = '0px 0px -10% 0px',
  mode = 'progress',
  offset = ['start 0.85', 'end 0.15'],
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const inTimeoutRef = useRef<number | null>(null);
  const outTimeoutRef = useRef<number | null>(null);

  // Progress mode: smooth, continuous reveal tied to scroll position
  const { scrollYProgress } = useScroll({
    target: ref as any,
    offset: offset as any,
  });

  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const translateY = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [26, 0, 0, -12]);
  const scale = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0.965, 1, 1, 0.99]);
  const blur = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [3, 0, 0, 3]);
  const blurFilter = useTransform(blur, (b) => `blur(${b}px)`);
  const visibility = useTransform(scrollYProgress, (v) => (v <= 0.02 || v >= 0.98 ? 'hidden' : 'visible'));
  const pointerEvents = useTransform(scrollYProgress, (v) => (v <= 0.02 || v >= 0.98 ? 'none' : 'auto'));

  useEffect(() => {
    if (mode === 'progress') {
      // No IntersectionObserver needed in progress mode
      return;
    }
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Cancel any pending out animation and animate in
            if (outTimeoutRef.current) {
              window.clearTimeout(outTimeoutRef.current);
              outTimeoutRef.current = null;
            }
            const delay = Number(delayMs) || 0;
            if (inTimeoutRef.current) {
              window.clearTimeout(inTimeoutRef.current);
              inTimeoutRef.current = null;
            }
            inTimeoutRef.current = window.setTimeout(() => {
              el.setAttribute('data-reveal', 'in');
            }, delay) as unknown as number;
          } else {
            // Debounce leaving viewport to avoid flicker
            if (inTimeoutRef.current) {
              window.clearTimeout(inTimeoutRef.current);
              inTimeoutRef.current = null;
            }
            const outDelay = Number(outDelayMs) || 0;
            if (outTimeoutRef.current) {
              window.clearTimeout(outTimeoutRef.current);
            }
            outTimeoutRef.current = window.setTimeout(() => {
              el.setAttribute('data-reveal', 'pre');
            }, outDelay) as unknown as number;
          }
        });
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => {
      if (inTimeoutRef.current) {
        window.clearTimeout(inTimeoutRef.current);
        inTimeoutRef.current = null;
      }
      if (outTimeoutRef.current) {
        window.clearTimeout(outTimeoutRef.current);
        outTimeoutRef.current = null;
      }
      observer.disconnect();
    };
  }, [mode, delayMs, outDelayMs, threshold, rootMargin]);

  const Component: any = as;
  if (mode === 'progress') {
    const MotionComp: any = motion(Component);
    return (
      <MotionComp
        ref={ref as any}
        className={className}
        style={{
          opacity,
          y: translateY,
          scale,
          filter: blurFilter,
          visibility: visibility as unknown as any,
          pointerEvents: pointerEvents as unknown as any,
          willChange: 'opacity, transform, filter',
        }}
      >
        {children}
      </MotionComp>
    );
  }

  return (
    <Component ref={ref as any} data-reveal="pre" className={className}>
      {children}
    </Component>
  );
}


