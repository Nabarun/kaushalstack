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
          {/* Matches site brand: --accent (#FAB03E amber) → --primary (#EF6A1A orange) */}
          <stop offset="0%" stopColor="#FAB03E" />
          <stop offset="100%" stopColor="#EF6A1A" />
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
 *   tagline    set true to render "Your AI Onboarding Partner" below the
 *              wordmark in an italic serif (Playfair Display)
 */
export default function Logo({ size = 28, showText = true, tagline = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="flex flex-col leading-tight">
          {/* Wordmark — title-cased KaushalStack with the platform's split
              tint. "Kaushal" stays in the foreground colour, "Stack" picks
              up the primary so the inflection point on the K↔S boundary
              echoes the icon's two-tone gradient. */}
          <span className="font-bold tracking-tight" style={{ fontSize: Math.round(size * 0.7) }}>
            <span className="text-foreground">Kaushal</span>
            <span className="text-primary">Stack</span>
          </span>
          {tagline && (
            <span
              // Playfair Display Italic — small payload (loaded once in
              // index.css), gives the tag a hand-set editorial feel that
              // contrasts with the sans-serif wordmark above it.
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: Math.max(10, Math.round(size * 0.36)),
                lineHeight: 1.1,
                marginTop: 2,
                letterSpacing: '0.01em',
              }}
              className="text-muted-foreground"
            >
              Your AI Onboarding Partner
            </span>
          )}
        </span>
      )}
    </span>
  );
}
