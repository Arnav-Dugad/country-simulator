import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useUiStore } from '../../store/uiStore';

/**
 * The animated backdrop: a slow aurora, a masked grid, and a handful of drifting
 * motes. Fixed and pointer-events-none, so it never interferes with the UI.
 * Everything here is skipped when the player turns motion off.
 */
export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  const reduceMotion = useUiStore((s) => s.prefs.reduceMotion);

  const motes = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: (i * 37 + 11) % 100,
        top: (i * 53 + 23) % 100,
        size: 1 + ((i * 7) % 3),
        delay: (i % 9) * 0.8,
        duration: 16 + ((i * 5) % 14),
      })),
    [],
  );

  return (
    <>
      <div className="aurora" style={{ opacity: 0.55 + intensity * 0.45 }} />
      <div className="grid-lines" />

      {!reduceMotion && (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none fixed -left-40 top-[-10%] -z-10 h-[46rem] w-[46rem] rounded-full opacity-[0.16] blur-[130px]"
            style={{ background: 'radial-gradient(circle, #4f8cff, transparent 68%)' }}
            animate={{ x: [0, 90, -30, 0], y: [0, 70, 140, 0] }}
            transition={{ duration: 46, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none fixed -right-52 bottom-[-18%] -z-10 h-[42rem] w-[42rem] rounded-full opacity-[0.14] blur-[130px]"
            style={{ background: 'radial-gradient(circle, #9d6bff, transparent 68%)' }}
            animate={{ x: [0, -80, 40, 0], y: [0, -90, -40, 0] }}
            transition={{ duration: 54, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            {motes.map((m) => (
              <motion.span
                key={m.id}
                className="absolute rounded-full bg-white/50"
                style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.size, height: m.size }}
                animate={{ y: [0, -110, 0], opacity: [0, 0.7, 0] }}
                transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </>
      )}

      {/* Vignette keeps the eye on the centre of the screen. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 42%, rgba(4,6,13,0.75) 100%)' }}
      />
    </>
  );
}
