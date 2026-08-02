import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import clsx from 'clsx';
import { useUiStore, type ToastKind } from '../../store/uiStore';

const TONE: Record<ToastKind, { icon: typeof Info; ring: string; accent: string }> = {
  success: { icon: CheckCircle2, ring: 'border-aurora-lime/30', accent: 'text-aurora-lime' },
  warning: { icon: AlertTriangle, ring: 'border-aurora-amber/30', accent: 'text-aurora-amber' },
  danger: { icon: ShieldAlert, ring: 'border-aurora-red/35', accent: 'text-aurora-red' },
  info: { icon: Info, ring: 'border-aurora-blue/30', accent: 'text-aurora-blue' },
};

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = TONE[toast.kind];
          const Icon = tone.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className={clsx('glass-strong pointer-events-auto flex items-start gap-3 border p-3.5', tone.ring)}
              role="status"
            >
              <Icon size={17} className={clsx('mt-0.5 shrink-0', tone.accent)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">{toast.title}</p>
                <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-400">{toast.body}</p>
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="focus-ring -mr-1 -mt-1 rounded p-1 text-slate-500 transition hover:text-white"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
