import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CloudOff, Crown, Medal, Trophy, UserRound } from 'lucide-react';
import clsx from 'clsx';
import type { LeaderboardEntry } from '../firebase/saves';
import { fetchLeaderboard } from '../firebase/saves';
import { DIFFICULTY_INDEX, VICTORY_INDEX } from '../game/data/definitions';
import { useAuthStore } from '../store/authStore';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/primitives';
import { Flag } from '../components/ui/Flag';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const { user, available } = useAuthStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(available);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    fetchLeaderboard(50)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the leaderboard. It may not be configured yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white">
          <ArrowLeft size={14} /> Back
        </Link>
        <Link to="/profile">
          <Button variant="ghost" size="sm" icon={<UserRound size={14} />}>
            Your profile
          </Button>
        </Link>
      </div>

      <header className="mb-8 text-center">
        <Trophy size={30} className="mx-auto mb-3 text-gold-400" />
        <h1 className="font-display text-3xl font-bold text-white">Global Leaderboard</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
          The highest-scoring campaigns played by anyone, anywhere. Score combines prosperity, wellbeing, governance,
          power, sustainability, knowledge, achievements and time in office — multiplied by difficulty.
        </p>
      </header>

      {!available ? (
        <Card>
          <div className="py-8 text-center">
            <CloudOff size={26} className="mx-auto mb-3 text-slate-500" />
            <h2 className="text-sm font-semibold text-white">Leaderboard unavailable</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
              This deployment has no Firebase configuration, so scores cannot be published or read. Everything else in
              the game works normally.
            </p>
          </div>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Spinner size={16} /> Loading rankings…
        </div>
      ) : error ? (
        <Card>
          <p className="py-8 text-center text-xs text-slate-400">{error}</p>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No scores submitted yet"
          body="Finish a campaign and submit your result to be the first on the board."
        />
      ) : (
        <Card padded={false}>
          <ol className="divide-y divide-white/[0.05]">
            {entries.map((entry, index) => {
              const mine = user?.uid === entry.uid;
              const goal = VICTORY_INDEX[entry.victoryGoal as keyof typeof VICTORY_INDEX];
              const difficulty = DIFFICULTY_INDEX[entry.difficulty as keyof typeof DIFFICULTY_INDEX];
              return (
                <motion.li
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(0.5, index * 0.025) }}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 transition',
                    mine ? 'bg-gold-500/[0.07]' : 'hover:bg-white/[0.02]',
                  )}
                >
                  <span className="num w-8 shrink-0 text-center text-sm font-bold text-slate-500">
                    {index < 3 ? MEDALS[index] : index + 1}
                  </span>

                  <Flag iso2={entry.iso2 || undefined} width={80} className="h-7 w-10 shrink-0" title={entry.nationName} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-white">{entry.displayName}</p>
                      {mine && <Badge tone="gold">You</Badge>}
                      {entry.victory && <Badge tone="good"><Crown size={9} /> Won</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {entry.nationName} · {entry.title} · {Math.floor(entry.turn / 12)}y in office
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {goal && <Badge tone="neutral">{goal.icon} {goal.name}</Badge>}
                      {difficulty && <Badge tone="info">{difficulty.name}</Badge>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="num text-base font-bold text-gold-400">{entry.score.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-600">points</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="mt-8 text-center">
        <Link to="/new">
          <Button variant="primary" icon={<Medal size={16} />}>
            Play for a place on the board
          </Button>
        </Link>
      </div>
    </div>
  );
}
