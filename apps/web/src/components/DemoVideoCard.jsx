import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Clock } from 'lucide-react';

/**
 * Reusable demo video player with a polished poster overlay.
 *
 * Renders the poster + a big Play button on first paint. Clicking swaps to the
 * actual <video> element, which loads on-demand (preload=metadata) so the
 * landing-page hero stays light for users who never click.
 *
 * Props:
 *   src         video URL (defaults to /demo.mp4)
 *   poster      poster image URL (defaults to /demo-poster.jpg)
 *   duration    label shown on the play overlay (e.g. "5 min")
 *   aspect      tailwind aspect ratio class (default aspect-video)
 *   className   extra container classes
 */
export default function DemoVideoCard({
  src      = '/demo.mp4',
  poster   = '/demo-poster.jpg',
  duration = '5 min',
  aspect   = 'aspect-video',
  className = '',
}) {
  const [activated, setActivated] = useState(false);
  const videoRef = useRef(null);

  function start() {
    setActivated(true);
    requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
  }

  return (
    <div
      className={`relative ${aspect} w-full overflow-hidden rounded-2xl border bg-card shadow-xl ${className}`}
      style={{
        boxShadow: '0 24px 60px -20px rgba(239,106,26,0.25), 0 8px 24px -8px rgba(0,0,0,0.15)',
      }}
    >
      {/* Subtle gradient frame */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{ boxShadow: 'inset 0 0 0 1px hsl(var(--primary) / 0.15)' }}
      />

      {!activated ? (
        <button
          type="button"
          onClick={start}
          className="group absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
          aria-label="Play kaushalstack demo"
        >
          <img
            src={poster}
            alt="kaushalstack product demo"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            loading="lazy"
          />
          {/* Dark gradient for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/20" />

          {/* Play button */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18 }}
          >
            <span className="relative flex items-center justify-center w-20 h-20 rounded-full bg-white/95 shadow-xl group-hover:bg-white">
              {/* pulse */}
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: 'hsl(var(--primary) / 0.35)' }}
                animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
              <Play className="w-8 h-8 text-primary fill-primary translate-x-0.5" />
            </span>
          </motion.div>

          {/* Bottom-left tag */}
          <div className="absolute left-4 bottom-4 flex items-center gap-3 text-white">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest bg-black/35 backdrop-blur px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" /> {duration} demo
            </span>
            <span className="hidden sm:inline text-sm font-medium drop-shadow">
              See the round table in action
            </span>
          </div>
        </button>
      ) : (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full bg-black"
        />
      )}
    </div>
  );
}
