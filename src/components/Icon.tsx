'use client';

import React from 'react';

type IconProps = {
  src: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

export default function Icon({ src, className = '', title, ariaLabel }: IconProps) {
  return (
    <span
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      title={title}
      className={`inline-block align-middle ${className}`}
      style={{
        WebkitMask: `url(${src}) no-repeat center / contain`,
        mask: `url(${src}) no-repeat center / contain`,
        backgroundColor: 'currentColor',
      }}
    />
  );
}


