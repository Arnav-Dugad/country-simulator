import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import type { Recommendation } from '../../game/engine/advisory';
import { buildRecommendations } from '../../game/engine/advisory';
import { useUiStore } from '../../store/uiStore';
import { useRecommendationRunner } from '../game/NextMoveStrip';
import { Badge, Button, Card, EmptyState } from '../ui/primitives';
import { NAV_INDEX } from '../layout/GameShell';

const SEVERITY = {
  critical: {
    icon: ShieldAlert,
    label: 'Urgent',
    tone: 'bad' as const,
    border: 'border-aurora-red/35',
    wash: 'bg-aurora-red/[0.06]',
    accent: 'text-aurora-red',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Attention',
    tone: 'warn' as const,
    border: 'border-aurora-amber/30',
    wash: 'bg-aurora-amber/[0.05]',
    accent: 'text-aurora-amber',
  },
  opportunity: {
    icon: Lightbulb,
    label: 'Opportunity',
    tone: 'info' as const,
    border: 'border-aurora-blue/25',
    wash: 'bg-aurora-blue/[0.04]',
    accent: 'text-aurora-blue',
  },
};

/**
 * The cabinet's advice for the current month.
 *
 * Recommendations are derived fresh from the state on every render, so they
 * always describe the situation as it is right now rather than a cached
 * snapshot from whenever the panel was last opened.
 */
export function AdvisoryBoard({
  game,
  limit = 3,
  title = 'Your cabinet advises',
}: {
  game: GameState;
  limit?: number;
  title?: string;
}) {
  const recommendations = useMemo(() => buildRecommendations(game, limit), [game, limit]);

  if (recommendations.length === 0) {
    return (
      <Card title={title} icon="🗣️">
        <EmptyState
          icon="✅"
          title="Nothing pressing"
          body="Your ministers have nothing urgent to raise. The country is running itself for the moment — a good time to build something."
        />
      </Card>
    );
  }

  return (
    <Card
      title={title}
      subtitle="Read from the state each month, not scripted"
      icon="🗣️"
      action={<Badge tone="neutral">{recommendations.length}</Badge>}
    >
      <div className="space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {recommendations.map((rec, i) => (
            <motion.div
              key={rec.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ delay: Math.min(0.2, i * 0.05), duration: 0.3 }}
            >
              <RecommendationCard rec={rec} game={game} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function RecommendationCard({ rec, game }: { rec: Recommendation; game: GameState }) {
  const setPanel = useUiStore((s) => s.setPanel);
  // Shared with the next-move strip, so there is exactly one implementation of
  // "do what the cabinet suggested" and the two surfaces cannot drift.
  const runAction = useRecommendationRunner();
  const severity = SEVERITY[rec.severity];
  const Icon = severity.icon;

  return (
    <div className={clsx('rounded-xl border p-3.5', severity.border, severity.wash)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-lg leading-none">{rec.advisorIcon}</span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold text-white">{rec.advisorName}</span>
            <span className="text-[10px] text-slate-500">{rec.advisorRole}</span>
            <Badge tone={severity.tone} className="ml-auto shrink-0">
              <Icon size={9} /> {severity.label}
            </Badge>
          </div>

          <p className={clsx('mt-1.5 text-xs font-semibold', severity.accent)}>{rec.headline}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{rec.detail}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {rec.action && (
              <Button
                size="sm"
                variant="primary"
                icon={<Sparkles size={12} />}
                disabled={game.gameOver !== null}
                onClick={() => runAction(rec)}
              >
                {rec.action.label}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowRight size={12} />}
              onClick={() => setPanel(rec.panel)}
            >
              Open {NAV_INDEX[rec.panel]?.label ?? rec.panel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
