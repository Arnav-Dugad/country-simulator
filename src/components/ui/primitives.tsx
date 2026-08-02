import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  title,
  subtitle,
  icon,
  action,
  padded = true,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={clsx('glass overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 shrink-0 text-lg leading-none">{icon}</span>}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={clsx(padded && 'p-5')}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 font-semibold shadow-glow-gold hover:from-gold-400 hover:to-gold-500',
  secondary: 'bg-white/[0.07] text-white hover:bg-white/[0.13] border border-white/10',
  ghost: 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
  danger: 'bg-aurora-red/85 text-white hover:bg-aurora-red font-semibold',
  success: 'bg-aurora-lime/85 text-ink-950 font-semibold hover:bg-aurora-lime',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'focus-ring inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-200 active:scale-[0.97]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && 'w-full',
        (disabled || loading) && 'pointer-events-none opacity-45',
        className,
      )}
    >
      {loading ? <Spinner size={size === 'lg' ? 18 : 14} /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Meter                                                               */
/* ------------------------------------------------------------------ */

/** Colour ramp for a 0–100 index. `inverted` flips it for "bad when high". */
export function meterColor(value: number, inverted = false): string {
  const v = inverted ? 100 - value : value;
  if (v >= 75) return '#7ee787';
  if (v >= 55) return '#a8d84f';
  if (v >= 38) return '#ffb648';
  if (v >= 20) return '#ff8f4f';
  return '#ff5c6c';
}

export function Meter({
  value,
  max = 100,
  inverted = false,
  color,
  className,
  height = 6,
  showTrack = true,
}: {
  value: number;
  max?: number;
  inverted?: boolean;
  color?: string;
  className?: string;
  height?: number;
  showTrack?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = color ?? meterColor(pct, inverted);
  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full', showTrack && 'bg-white/[0.08]', className)}
      style={{ height }}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${fill}aa, ${fill})`, boxShadow: `0 0 12px -2px ${fill}` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated number                                                     */
/* ------------------------------------------------------------------ */

/**
 * Eases a displayed number toward its target. Purely cosmetic — the value in
 * the store is always the truth, this only animates how it is rendered.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  duration = 620,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    const delta = value - from;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + delta * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  const safe = Number.isFinite(display) ? display : 0;
  return (
    <span className={className}>
      {prefix}
      {safe.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  hint,
  delta,
  invertDelta = false,
  icon,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number;
  invertDelta?: boolean;
  icon?: ReactNode;
  accent?: string;
  className?: string;
}) {
  const good = delta === undefined ? null : invertDelta ? delta < 0 : delta > 0;
  return (
    <div className={clsx('glass group relative overflow-hidden p-4', className)}>
      {accent && (
        <span
          className="absolute inset-x-0 top-0 h-px opacity-70"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
        {icon && <span className="text-sm opacity-60 transition-opacity group-hover:opacity-100">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-2xl font-bold text-white">{value}</span>
        {delta !== undefined && Math.abs(delta) > 0.005 && (
          <span
            className={clsx(
              'num rounded px-1.5 py-0.5 text-[11px] font-semibold',
              good ? 'bg-aurora-lime/15 text-aurora-lime' : 'bg-aurora-red/15 text-aurora-red',
            )}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-ink-950/85 backdrop-blur-md"
            onClick={dismissable ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={clsx(
              'glass-strong relative flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-2xl',
              widths[size],
            )}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            {(title || dismissable) && (
              <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div className="min-w-0">
                  {title && <h2 className="text-lg font-bold text-white">{title}</h2>}
                  {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
                </div>
                {dismissable && (
                  <button
                    onClick={onClose}
                    className="focus-ring -mr-1 -mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                )}
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <footer className="border-t border-white/10 px-6 py-4">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'gold';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-white/[0.08] text-slate-300 border-white/10',
    good: 'bg-aurora-lime/12 text-aurora-lime border-aurora-lime/25',
    bad: 'bg-aurora-red/12 text-aurora-red border-aurora-red/25',
    warn: 'bg-aurora-amber/12 text-aurora-amber border-aurora-amber/25',
    info: 'bg-aurora-blue/12 text-aurora-blue border-aurora-blue/25',
    gold: 'bg-gold-500/12 text-gold-400 border-gold-500/30',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.13 }}
            className="glass-strong pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-lg px-3 py-2 text-xs leading-relaxed text-slate-200"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'focus-ring relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition',
            value === tab.id ? 'text-ink-950' : 'text-slate-400 hover:text-white',
          )}
        >
          {value === tab.id && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-lg bg-gold-500"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={clsx('num text-[10px]', value === tab.id ? 'text-ink-950/70' : 'text-slate-500')}>
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 text-4xl opacity-40">{icon}</div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="mt-1 max-w-sm text-xs text-slate-400">{body}</p>
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  hint,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={clsx(disabled && 'opacity-50')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className="num text-xs font-semibold text-white">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="focus-ring"
        aria-label={label}
      />
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
