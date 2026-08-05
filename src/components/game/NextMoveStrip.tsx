import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Lightbulb, ShieldAlert, Sparkles, TriangleAlert, X } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import type { Recommendation } from '../../game/engine/advisory';
import { buildRecommendations } from '../../game/engine/advisory';
import { useGameStore } from '../../store/gameStore';
import { useUiStore } from '../../store/uiStore';
import { NAV_INDEX } from '../layout/GameShell';

/**
 * The persistent "next move" strip.
 *
 * The single most common question in a game with this much surface area is
 * "what should I be doing right now?". This answers it without the player
 * having to go looking: one line, always visible, always derived from the live
 * state, with the action attached where one exists.
 *
 * It is never empty. The advisory engine falls through to the best available
 * opportunity when nothing is wrong, because in a country there always is a
 * next thing.
 */
export function NextMoveStrip({ game }: { game: GameState }) {
  const setPanel = useUiStore((s) => s.setPanel);
  const setPref = useUiStore((s) => s.setPref);
  const [expanded, setExpanded] = useState(false);

  // Three, so expanding shows genuine alternatives rather than a longer list
  // of the same idea.
  const recommendations = useMemo(() => buildRecommendations(game, 3), [game]);
  const primary = recommendations[0];
  const rest = recommendations.slice(1);

  if (!primary) return null;

  return (
    <div className="sticky top-14 z-20 border-b border-white/[0.07] bg-ink-900/85 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-5">
        <SeverityMark severity={primary.severity} />

        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 truncate">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Next move
            </span>
            <span className="truncate text-xs font-medium text-white">{primary.headline}</span>
          </p>
        </div>

        <ActionButtons rec={primary} game={game} />

        <button
          onClick={() => setPanel(primary.panel)}
          className="focus-ring hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white sm:flex"
        >
          {NAV_INDEX[primary.panel]?.label ?? primary.panel}
          <ArrowRight size={11} />
        </button>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={expanded ? 'Collapse advice' : 'Show more advice'}
          aria-expanded={expanded}
        >
          <ChevronDown size={14} className={clsx('transition-transform', expanded && 'rotate-180')} />
        </button>

        <button
          onClick={() => setPref('showNextMove', false)}
          className="focus-ring shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Hide the next-move strip"
          title="Hide — you can turn it back on in the Chronicle"
        >
          <X size={13} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/[0.05]"
          >
            <div className="space-y-2 px-3 py-3 sm:px-5">
              <p className="text-[11px] leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">
                  {primary.advisorName} · {primary.advisorRole}:
                </span>{' '}
                {primary.detail}
              </p>

              {rest.length > 0 && (
                <div className="space-y-1.5 border-t border-white/[0.05] pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Also on the desk
                  </p>
                  {rest.map((rec) => (
                    <div key={rec.id} className="flex items-center gap-2">
                      <SeverityMark severity={rec.severity} small />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{rec.headline}</span>
                      <ActionButtons rec={rec} game={game} small />
                      <button
                        onClick={() => setPanel(rec.panel)}
                        className="focus-ring shrink-0 rounded px-1.5 py-1 text-[10px] text-slate-500 transition hover:text-white"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SeverityMark({ severity, small }: { severity: Recommendation['severity']; small?: boolean }) {
  const size = small ? 11 : 14;
  if (severity === 'critical') {
    return <ShieldAlert size={size} className="shrink-0 animate-pulse text-aurora-red" />;
  }
  if (severity === 'warning') {
    return <TriangleAlert size={size} className="shrink-0 text-aurora-amber" />;
  }
  return <Lightbulb size={size} className="shrink-0 text-aurora-blue" />;
}

/**
 * Runs a recommendation's one-click action.
 *
 * Shared with the advisory board so both surfaces execute a recommendation in
 * exactly the same way — there is one implementation of "do what the cabinet
 * suggested", not two that can drift.
 */
export function useRecommendationRunner() {
  const store = useGameStore();
  return (rec: Recommendation) => {
    const action = rec.action;
    if (!action) return;
    switch (action.kind) {
      case 'policy': store.enactPolicy(action.id); break;
      case 'decree': store.enactDecree(action.id); break;
      case 'research': store.startResearch(action.id); break;
      case 'build': store.build(action.id); break;
      case 'org': store.joinOrg(action.id as Parameters<typeof store.joinOrg>[0]); break;
      case 'budget': store.setBudget(action.dept, action.level); break;
      case 'tax': store.setTax(action.key, action.value); break;
      case 'crisis': store.respondToCrisis(action.crisisId, action.responseId); break;
      case 'offer':
        if (action.accept) store.acceptOffer(action.offerId);
        else store.declineOffer(action.offerId);
        break;
      case 'agenda': store.declareAgenda(action.id); break;
      case 'branch': store.setBranchFunding(action.branch, action.weight); break;
      case 'coalition': store.openCoalition(action.partyId); break;
      case 'settle-trade': store.settleTrade(action.countryId); break;
    }
  };
}

function ActionButtons({ rec, game, small }: { rec: Recommendation; game: GameState; small?: boolean }) {
  const run = useRecommendationRunner();
  if (!rec.action) return null;
  return (
    <button
      onClick={() => run(rec)}
      disabled={game.gameOver !== null}
      className={clsx(
        'focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 font-semibold text-ink-950 transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        small ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]',
      )}
    >
      <Sparkles size={small ? 9 : 11} />
      <span className="max-w-[12rem] truncate">{rec.action.label}</span>
    </button>
  );
}
