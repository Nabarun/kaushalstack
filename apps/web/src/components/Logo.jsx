import React from 'react';

/**
 * LogoMark — the square icon only (used in favicons, small chrome, mobile).
 * Inlined as SVG so the gradient renders crisply at any size and we save an
 * HTTP round-trip vs. <img src="/favicon.svg" />.
 */
export function LogoMark({ size = 28, gradientId, className }) {
  // Unique gradient id per instance so multiple <LogoMark/>s on the same page
  // don't collide.
  const gid = gradientId || `ks-bg-${React.useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="kaushalstack"
      className={className}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DBAF0" />
          <stop offset="100%" stopColor="#1E6FD9" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill={`url(#${gid})`} />
      <rect x="32" y="28" width="44" height="9" rx="4.5" fill="#fff" opacity="0.96" />
      <rect x="20" y="43" width="56" height="9" rx="4.5" fill="#fff" />
      <rect x="20" y="58" width="32" height="9" rx="4.5" fill="#fff" opacity="0.96" />
    </svg>
  );
}

/**
 * Logo — icon + wordmark, intended for headers / footers / sign-in pages.
 *
 * Props:
 *   size       icon side length in px (default 28)
 *   showText   set false for the icon-only variant (default true)
 *   tagline    set true to render "skills for AI agents" beneath the mark
 */
export default function Logo({ size = 28, showText = true, tagline = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="font-bold tracking-tight" style={{ fontSize: Math.round(size * 0.7) }}>
            <span className="text-foreground">kaushal</span>
            <span style={{ color: '#3DBAF0' }}>stack</span>
          </span>
          {tagline && (
            <span
              className="uppercase text-muted-foreground tracking-[0.18em] mt-1"
              style={{ fontSize: Math.max(8, Math.round(size * 0.28)) }}
            >
              skills for AI agents
            </span>
          )}
        </span>
      )}
    </span>
  );
}
