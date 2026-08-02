import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Share2, Trophy, Upload } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { ACHIEVEMENT_INDEX } from '../../game/data/achievements';
import { DIFFICULTY_INDEX, VICTORY_INDEX } from '../../game/data/definitions';
import { debtToGdp, formatBillions, formatPopulation, gdpPerCapita } from '../../game/selectors';
import { computeScore } from '../../game/engine/scoring';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, Button, Meter, Modal } from '../ui/primitives';
import { Flag } from '../ui/Flag';

export function GameOverModal({ game }: { game: GameState }) {
  const { quit, publishScore } = useGameStore();
  const user = useAuthStore((s) => s.user);
  const notify = useUiStore((s) => s.notify);
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(() => computeScore(game), [game]);
  const outcome = game.gameOver!;
  const goal = VICTORY_INDEX[game.settings.victoryGoal];
  const difficulty = DIFFICULTY_INDEX[game.settings.difficulty];
  const symbol = game.identity.currency.symbol;

  const pillars = [
    { label: 'Prosperity', value: score.prosperity, max: 1700, color: '#f5d073' },
    { label: 'Wellbeing', value: score.wellbeing, max: 1700, color: '#ff6bb5' },
    { label: 'Governance', value: score.governance, max: 1700, color: '#4f8cff' },
    { label: 'Power', value: score.power, max: 1500, color: '#ff5c6c' },
    { label: 'Sustainability', value: score.sustainability, max: 1400, color: '#7ee787' },
    { label: 'Knowledge', value: score.knowledge, max: 1500, color: '#3ddbd9' },
  ];

  const legacy = [
    ['Years in office', `${Math.floor(game.turn / 12)}y ${game.turn % 12}m`],
    ['Terms served', String(game.termsServed)],
    ['Final GDP', formatBillions(game.economy.gdp, symbol)],
    ['GDP per capita', `$${Math.round(gdpPerCapita(game)).toLocaleString()}`],
    ['Population', formatPopulation(game.society.population)],
    ['Debt / GDP', `${debtToGdp(game).toFixed(0)}%`],
    ['Technologies', `${game.research.completed.length}`],
    ['Policies enacted', `${game.activePolicies.length}`],
    ['Achievements', `${game.achievements.length}`],
    ['Wars won', String(game.wars.filter((w) => w.resolved === 'victory').length)],
  ] as const;

  const share = async () => {
    const text = `${game.leader.title} ${game.leader.name} of ${game.identity.name} — ${outcome.title}. Score ${score.total.toLocaleString()} after ${Math.floor(game.turn / 12)} years. #SovereignSim`;
    try {
      if (navigator.share) await navigator.share({ title: 'Sovereign', text });
      else {
        await navigator.clipboard.writeText(text);
        notify('success', 'Copied', 'Your result is on the clipboard.');
      }
    } catch {
      /* the user dismissed the share sheet */
    }
  };

  return (
    <Modal
      open
      onClose={() => {}}
      dismissable={false}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <span className="text-3xl">{outcome.victory ? '🏆' : '📉'}</span>
          <span>
            <span className={clsx('block text-2xl font-bold', outcome.victory ? 'text-gold-400' : 'text-slate-200')}>
              {outcome.title}
            </span>
            <span className="block text-xs font-normal text-slate-400">
              {outcome.victory ? 'Objective achieved' : 'The campaign has ended'}
            </span>
          </span>
        </span>
      }
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Flag
            iso2={game.identity.iso2 || undefined}
            custom={game.identity.customFlag}
            width={160}
            className="h-14 w-20 shrink-0"
            title={game.identity.name}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{game.identity.name}</p>
            <p className="text-xs text-slate-400">
              {game.leader.portrait} {game.leader.title} {game.leader.name}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{outcome.reason}</p>
          </div>
        </div>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
          className="rounded-2xl border border-gold-500/25 bg-gradient-to-b from-gold-500/[0.12] to-transparent p-6 text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500">Final score</p>
          <p className="num mt-1 text-5xl font-black text-gradient">{score.total.toLocaleString()}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Badge tone="gold">{goal.icon} {goal.name}</Badge>
            <Badge tone="info">{difficulty.name}</Badge>
            <Badge tone="neutral">×{difficulty.scoreMultiplier} multiplier</Badge>
          </div>
        </motion.div>

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Score composition</p>
          <div className="space-y-2.5">
            {pillars.map((pillar, i) => (
              <motion.div
                key={pillar.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.06 }}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-slate-300">{pillar.label}</span>
                  <span className="num text-xs font-semibold text-white">{pillar.value.toLocaleString()}</span>
                </div>
                <Meter value={pillar.value} max={pillar.max} color={pillar.color} height={4} />
              </motion.div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Legacy</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {legacy.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] pb-1.5">
                <dt className="text-[11px] text-slate-500">{label}</dt>
                <dd className="num text-xs font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {game.achievements.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Achievements earned ({game.achievements.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {game.achievements.map((id) => {
                const achievement = ACHIEVEMENT_INDEX[id];
                if (!achievement) return null;
                return (
                  <Badge key={id} tone="gold">
                    {achievement.icon} {achievement.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <Button variant="primary" icon={<Home size={16} />} onClick={quit}>
            Return to menu
          </Button>
          {user && (
            <Button
              variant="secondary"
              icon={submitted ? <Trophy size={16} /> : <Upload size={16} />}
              disabled={submitted}
              onClick={async () => {
                await publishScore(user.uid, user.displayName ?? 'Anonymous Leader');
                setSubmitted(true);
              }}
            >
              {submitted ? 'Submitted' : 'Submit to leaderboard'}
            </Button>
          )}
          <Button variant="ghost" icon={<Share2 size={16} />} onClick={share}>
            Share result
          </Button>
        </div>

        {!user && (
          <p className="text-center text-[11px] text-slate-500">
            Sign in to save campaigns to the cloud and submit scores to the global leaderboard.
          </p>
        )}
      </div>
    </Modal>
  );
}
