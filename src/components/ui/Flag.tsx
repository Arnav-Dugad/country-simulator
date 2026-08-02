import { useState } from 'react';
import clsx from 'clsx';
import type { CustomFlag } from '../../game/types';
import { flagUrl } from '../../game/data/countries';

/**
 * Renders a real national flag from the flag CDN, or draws a custom flag as
 * inline SVG when the player founded their own nation.
 */
export function Flag({
  iso2,
  custom,
  className,
  width = 160,
  rounded = true,
  title,
}: {
  iso2?: string;
  custom?: CustomFlag | null;
  className?: string;
  width?: 20 | 40 | 80 | 160 | 320 | 640;
  rounded?: boolean;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (iso2 && !failed) {
    return (
      <img
        src={flagUrl(iso2, width)}
        alt={title ? `Flag of ${title}` : 'National flag'}
        title={title}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={clsx(
          'object-cover ring-1 ring-white/15',
          rounded && 'rounded-md',
          className,
        )}
      />
    );
  }

  if (custom) {
    return (
      <CustomFlagSvg
        flag={custom}
        title={title}
        className={clsx('ring-1 ring-white/15', rounded && 'rounded-md', className)}
      />
    );
  }

  // Neither a real flag nor a custom one: a neutral placeholder beats a broken image.
  return (
    <div
      title={title}
      className={clsx(
        'flex items-center justify-center bg-ink-700 text-xs text-slate-500 ring-1 ring-white/15',
        rounded && 'rounded-md',
        className,
      )}
    >
      ⚑
    </div>
  );
}

export function CustomFlagSvg({
  flag,
  className,
  title,
}: {
  flag: CustomFlag;
  className?: string;
  title?: string;
}) {
  const [a, b, c] = flag.colors;
  const W = 90;
  const H = 60;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" role="img" aria-label={title ?? 'Custom flag'}>
      {title && <title>{title}</title>}
      <rect width={W} height={H} fill={a} />

      {flag.pattern === 'horizontal' && (
        <>
          <rect y={H / 2} width={W} height={H / 2} fill={b} />
        </>
      )}

      {flag.pattern === 'vertical' && <rect x={W / 2} width={W / 2} height={H} fill={b} />}

      {flag.pattern === 'triband-h' && (
        <>
          <rect y={H / 3} width={W} height={H / 3} fill={b} />
          <rect y={(2 * H) / 3} width={W} height={H / 3} fill={c} />
        </>
      )}

      {flag.pattern === 'triband-v' && (
        <>
          <rect x={W / 3} width={W / 3} height={H} fill={b} />
          <rect x={(2 * W) / 3} width={W / 3} height={H} fill={c} />
        </>
      )}

      {flag.pattern === 'cross' && (
        <>
          <rect x={26} width={12} height={H} fill={b} />
          <rect y={24} width={W} height={12} fill={b} />
          <rect x={29} width={6} height={H} fill={c} />
          <rect y={27} width={W} height={6} fill={c} />
        </>
      )}

      {flag.pattern === 'diagonal' && (
        <>
          <polygon points={`0,0 ${W},0 0,${H}`} fill={b} />
          <polygon points={`0,0 ${W * 0.34},0 0,${H * 0.5}`} fill={c} />
        </>
      )}

      {flag.pattern === 'canton' && (
        <>
          <rect y={H / 2} width={W} height={H / 2} fill={b} />
          <rect width={W * 0.42} height={H * 0.5} fill={c} />
        </>
      )}

      {flag.pattern === 'sun' && (
        <>
          <rect y={H / 2} width={W} height={H / 2} fill={b} />
          <circle cx={W / 2} cy={H / 2} r={15} fill={c} />
        </>
      )}

      {flag.emblem && (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={flag.pattern === 'sun' ? 15 : 22}
          fill={flag.pattern === 'sun' ? a : c}
          style={{ paintOrder: 'stroke', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' }}
        >
          {flag.emblem}
        </text>
      )}
    </svg>
  );
}
