import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Award, Check, Cloud, CloudOff, Crown, Flame, Gauge, Globe2, LogOut,
  Pencil, Save, Settings2, Sparkles, Swords, Trash2, Trophy, X, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import type { LeaderboardEntry, SaveMeta } from '../firebase/saves';
import { deleteCloudSave, fetchLeaderboard, listCloudSaves, loadCloudSave } from '../firebase/saves';
import { updateDisplayName } from '../firebase/auth';
import { deleteLocalSave, listLocalSaves, loadLocalSave } from '../game/storage';
import { careerRank, computeCareerStats, mergeSaves } from '../game/career';
import { DIFFICULTY_INDEX, VICTORY_INDEX } from '../game/data/definitions';
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENT_POINTS } from '../game/data/achievements';
import { MONTH_SHORT, formatBillions, formatPopulation } from '../game/selectors';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { Badge, Button, Card, EmptyState, Meter, Modal, Reveal, Spinner, Stat, Tabs, Tooltip } from '../components/ui/primitives';
import { Flag } from '../components/ui/Flag';

type ProfileTab = 'overview' | 'campaigns' | 'accolades' | 'settings';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, available, logout } = useAuthStore();
  const load = useGameStore((s) => s.load);
  const notify = useUiStore((s) => s.notify);

  const [tab, setTab] = useState<ProfileTab>('overview');
  const [cloudSaves, setCloudSaves] = useState<SaveMeta[]>([]);
  const [localSaves, setLocalSaves] = useState<SaveMeta[]>(() => listLocalSaves());
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCloudSaves([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([listCloudSaves(user.uid), fetchLeaderboard(100)])
      .then(([savesResult, boardResult]) => {
        if (cancelled) return;
        if (savesResult.status === 'fulfilled') setCloudSaves(savesResult.value);
        if (boardResult.status === 'fulfilled') setBoard(boardResult.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saves = useMemo(() => mergeSaves(cloudSaves, localSaves), [cloudSaves, localSaves]);
  const stats = useMemo(() => computeCareerStats(saves), [saves]);
  const rank = useMemo(() => careerRank(stats.totalScore), [stats.totalScore]);

  const boardPlacement = useMemo(() => {
    if (!user) return null;
    const index = board.findIndex((e) => e.uid === user.uid);
    return index >= 0 ? { rank: index + 1, of: board.length, entry: board[index] } : null;
  }, [board, user]);

  const openSave = async (save: SaveMeta) => {
    setBusyId(save.id);
    try {
      const local = loadLocalSave(save.id);
      const state = local ?? (user ? await loadCloudSave(user.uid, save.id) : null);
      if (state && load(state)) navigate('/play');
      else notify('warning', 'Could not load', 'That campaign could not be read.');
    } catch {
      notify('warning', 'Could not load', 'The server did not respond.');
    } finally {
      setBusyId(null);
    }
  };

  const removeSave = async (save: SaveMeta) => {
    deleteLocalSave(save.id);
    setLocalSaves(listLocalSaves());
    if (user) {
      try {
        await deleteCloudSave(user.uid, save.id);
        setCloudSaves((prev) => prev.filter((s) => s.id !== save.id));
      } catch {
        notify('warning', 'Could not delete', 'The cloud copy could not be removed.');
      }
    }
    notify('success', 'Campaign deleted', `${save.nationName} has been removed.`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white">
          <ArrowLeft size={14} /> Back
        </Link>
        {user && (
          <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={() => logout().then(() => navigate('/'))}>
            Sign out
          </Button>
        )}
      </div>

      <ProfileHeader
        rank={rank}
        stats={stats}
        boardPlacement={boardPlacement}
        loading={loading}
      />

      <Reveal delay={0.08}>
        <Tabs
          className="mt-6"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview' as const, label: 'Overview', icon: <Gauge size={13} /> },
            { id: 'campaigns' as const, label: 'Campaigns', icon: <Globe2 size={13} />, count: saves.length },
            { id: 'accolades' as const, label: 'Accolades', icon: <Award size={13} /> },
            { id: 'settings' as const, label: 'Settings', icon: <Settings2 size={13} /> },
          ]}
        />
      </Reveal>

      <div className="mt-5">
        {loading && saves.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner size={16} /> Loading your career…
          </div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab stats={stats} saves={saves} onOpen={openSave} busyId={busyId} />}
            {tab === 'campaigns' && (
              <CampaignsTab saves={saves} onOpen={openSave} onDelete={removeSave} busyId={busyId} />
            )}
            {tab === 'accolades' && <AccoladesTab stats={stats} saves={saves} />}
            {tab === 'settings' && <SettingsTab />}
          </>
        )}
      </div>

      {!available && (
        <p className="mt-8 text-center text-[11px] text-slate-600">
          Running in offline mode — these statistics come from campaigns saved in this browser only.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function ProfileHeader({
  rank, stats, boardPlacement, loading,
}: {
  rank: ReturnType<typeof careerRank>;
  stats: ReturnType<typeof computeCareerStats>;
  boardPlacement: { rank: number; of: number; entry: LeaderboardEntry } | null;
  loading: boolean;
}) {
  const { user, available } = useAuthStore();
  const notify = useUiStore((s) => s.notify);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Offline Player';

  const commitName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return notify('warning', 'Name required', 'Enter a name to display.');
    setSaving(true);
    try {
      await updateDisplayName(trimmed);
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, displayName: trimmed } : null }));
      notify('success', 'Name updated', 'Your display name has been changed.');
      setEditing(false);
    } catch {
      notify('warning', 'Could not update', 'Your name could not be changed right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Reveal>
      <div className="glass relative overflow-hidden">
        {/* Rank-tinted wash behind the header. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{ background: `radial-gradient(ellipse at 20% 0%, ${rank.color}, transparent 62%)` }}
        />

        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-4xl"
            style={{ background: `${rank.color}1f`, border: `1px solid ${rank.color}44` }}
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              rank.icon
            )}
          </motion.div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={name}
                  maxLength={32}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && commitName()}
                  className="focus-ring min-w-0 flex-1 rounded-lg border border-white/15 bg-ink-800/80 px-3 py-1.5 text-lg font-bold text-white"
                />
                <Button size="sm" variant="primary" icon={<Save size={13} />} loading={saving} onClick={commitName}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setEditing(false)} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white">{displayName}</h1>
                {available && user && (
                  <Tooltip label="Change display name">
                    <button
                      onClick={() => {
                        setName(user.displayName ?? '');
                        setEditing(true);
                      }}
                      className="focus-ring rounded p-1.5 text-slate-500 transition hover:text-white"
                      aria-label="Edit display name"
                    >
                      <Pencil size={13} />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}

            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: rank.color }}>
              <span className="font-semibold">{rank.icon} {rank.title}</span>
              <span className="num text-xs text-slate-500">{rank.points.toLocaleString()} career points</span>
            </p>

            <div className="mt-3 max-w-md">
              <Meter value={rank.progress} height={5} color={rank.color} />
              <p className="mt-1 text-[11px] text-slate-500">
                {rank.nextTitle
                  ? `${(rank.nextAt! - rank.points).toLocaleString()} points to ${rank.nextTitle}`
                  : 'Highest rank attained'}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {available ? (
                user ? (
                  <Badge tone="info"><Cloud size={9} /> Synced</Badge>
                ) : (
                  <Badge tone="neutral"><CloudOff size={9} /> Not signed in</Badge>
                )
              ) : (
                <Badge tone="neutral"><CloudOff size={9} /> Offline mode</Badge>
              )}
              {boardPlacement && (
                <Badge tone="gold">
                  <Trophy size={9} /> #{boardPlacement.rank} of {boardPlacement.of} on the leaderboard
                </Badge>
              )}
              {stats.eternalCampaigns > 0 && <Badge tone="info">♾️ {stats.eternalCampaigns} eternal</Badge>}
              {loading && <Spinner size={12} className="text-slate-500" />}
            </div>
          </div>
        </div>

        {!user && available && (
          <div className="relative border-t border-white/10 px-6 py-4">
            <p className="text-xs text-slate-400">
              <Link to="/auth" className="font-semibold text-gold-400 underline underline-offset-2">
                Sign in
              </Link>{' '}
              to sync this career across devices and appear on the global leaderboard.
            </p>
          </div>
        )}
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab({
  stats, saves, onOpen, busyId,
}: {
  stats: ReturnType<typeof computeCareerStats>;
  saves: SaveMeta[];
  onOpen: (save: SaveMeta) => void;
  busyId: string | null;
}) {
  if (stats.campaigns === 0) {
    return (
      <EmptyState
        icon="🏛️"
        title="No campaigns yet"
        body="Your career statistics appear here once you have governed something. Start a campaign to begin."
      />
    );
  }

  const active = saves.filter((s) => !s.gameOver).slice(0, 3);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Campaigns" value={stats.campaigns} hint={`${stats.inProgress} in progress`} accent="#4f8cff" icon={<Globe2 size={14} />} />
          <Stat label="Best score" value={stats.bestScore.toLocaleString()} accent="#f5d073" icon={<Trophy size={14} />} />
          <Stat
            label="Win rate"
            value={stats.completed > 0 ? `${stats.winRate.toFixed(0)}%` : '—'}
            hint={`${stats.victories}W · ${stats.defeats}L`}
            accent="#7ee787"
          />
          <Stat
            label="Years governed"
            value={Math.floor(stats.yearsGoverned)}
            hint={`${stats.monthsGoverned.toLocaleString()} months`}
            accent="#9d6bff"
            icon={<Gauge size={14} />}
          />
        </div>
      </Reveal>

      {active.length > 0 && (
        <Reveal delay={0.04}>
          <Card title="Continue where you left off" icon="▶️">
            <div className="space-y-2">
              {active.map((save) => (
                <CampaignRow key={save.id} save={save} onOpen={onOpen} busy={busyId === save.id} />
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.08}>
          <Card title="Career records" icon="📈">
            <dl className="space-y-2.5">
              <Record label="Largest economy governed" value={formatBillions(stats.peakGdp)} />
              <Record label="Largest population" value={formatPopulation(stats.peakPopulation)} />
              <Record label="Happiest nation" value={stats.peakHappiness.toFixed(0)} />
              <Record label="Longest single campaign" value={`${Math.floor(stats.longestCampaignMonths / 12)} years`} />
              <Record label="Most achievements in one run" value={`${stats.bestAchievementCount} / ${ACHIEVEMENTS.length}`} />
              <Record label="Technologies researched" value={stats.totalTechnologies.toLocaleString()} />
              <Record label="Wars won" value={stats.totalWarsWon.toLocaleString()} />
              <Record label="Terms served" value={stats.totalTerms.toLocaleString()} />
              <Record label="Average score" value={Math.round(stats.averageScore).toLocaleString()} />
            </dl>
          </Card>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={0.1}>
            <Card title="Preferences observed" subtitle="What your campaigns say about you" icon="🎭">
              <div className="space-y-4">
                {stats.favouriteNation && (
                  <div className="flex items-center gap-3">
                    <Flag iso2={stats.favouriteNation.iso2 || undefined} width={80} className="h-8 w-11 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">Most-played nation</p>
                      <p className="truncate text-sm font-semibold text-white">{stats.favouriteNation.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {stats.favouriteNation.count} campaign{stats.favouriteNation.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                )}
                {stats.favouriteDifficulty && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Preferred difficulty</p>
                    <p className="text-sm font-semibold text-white">{stats.favouriteDifficulty.name}</p>
                    <p className="text-[11px] text-slate-500">
                      chosen {stats.favouriteDifficulty.count} time{stats.favouriteDifficulty.count === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </Reveal>

          {stats.bestCampaign && (
            <Reveal delay={0.12}>
              <Card title="Finest hour" subtitle="Your highest-scoring campaign" icon="👑">
                <CampaignRow save={stats.bestCampaign} onOpen={onOpen} busy={busyId === stats.bestCampaign.id} />
              </Card>
            </Reveal>
          )}
        </div>
      </div>
    </div>
  );
}

function Record({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="num text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

function CampaignsTab({
  saves, onOpen, onDelete, busyId,
}: {
  saves: SaveMeta[];
  onOpen: (save: SaveMeta) => void;
  onDelete: (save: SaveMeta) => void;
  busyId: string | null;
}) {
  const [confirm, setConfirm] = useState<SaveMeta | null>(null);

  if (saves.length === 0) {
    return <EmptyState icon="💾" title="No campaigns saved" body="Start a campaign and it will appear here." />;
  }

  return (
    <>
      <div className="space-y-2">
        {saves.map((save, i) => (
          <Reveal key={save.id} delay={Math.min(0.3, i * 0.03)}>
            <CampaignRow
              save={save}
              onOpen={onOpen}
              onDelete={() => setConfirm(save)}
              busy={busyId === save.id}
              detailed
            />
          </Reveal>
        ))}
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Delete this campaign?"
        subtitle={confirm ? `${confirm.nationName} — ${confirm.score.toLocaleString()} points` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => {
                if (confirm) onDelete(confirm);
                setConfirm(null);
              }}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-300">
          This removes the campaign from this browser and from the cloud. Leaderboard entries already submitted
          are not affected. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}

function CampaignRow({
  save, onOpen, onDelete, busy, detailed,
}: {
  save: SaveMeta;
  onOpen: (save: SaveMeta) => void;
  onDelete?: () => void;
  busy?: boolean;
  detailed?: boolean;
}) {
  const difficulty = DIFFICULTY_INDEX[save.difficulty as keyof typeof DIFFICULTY_INDEX];
  const goal = VICTORY_INDEX[save.victoryGoal as keyof typeof VICTORY_INDEX];

  return (
    <div className="glass flex items-center gap-3 p-3 transition hover:border-white/20">
      <Flag
        iso2={save.iso2 || undefined}
        custom={
          save.flagColors
            ? { pattern: 'triband-v', colors: save.flagColors as [string, string, string], emblem: '★' }
            : null
        }
        width={80}
        className="h-9 w-12 shrink-0"
        title={save.nationName}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-white">{save.nationName}</p>
          {save.eternal && <Badge tone="info">♾️</Badge>}
          {save.gameOver && <Badge tone={save.victory ? 'good' : 'bad'}>{save.victory ? 'Won' : 'Ended'}</Badge>}
          {!save.gameOver && <Badge tone="neutral">In progress</Badge>}
        </div>
        <p className="truncate text-[11px] text-slate-500">{save.leaderName}</p>
        <p className="num mt-0.5 text-[11px] text-slate-400">
          {MONTH_SHORT[Math.max(0, Math.min(11, save.month - 1))]} {save.year} ·{' '}
          {Math.floor(save.turn / 12)}y in office · {formatBillions(save.gdp)}
        </p>
        {detailed && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {difficulty && <Badge tone="neutral">{difficulty.name}</Badge>}
            {goal && <Badge tone="neutral">{goal.icon} {goal.name}</Badge>}
            {(save.achievements ?? 0) > 0 && <Badge tone="gold"><Award size={9} /> {save.achievements}</Badge>}
            {(save.technologies ?? 0) > 0 && <Badge tone="info"><Zap size={9} /> {save.technologies}</Badge>}
            {(save.warsWon ?? 0) > 0 && <Badge tone="bad"><Swords size={9} /> {save.warsWon}</Badge>}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="num text-sm font-bold text-gold-400">{save.score.toLocaleString()}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" loading={busy} onClick={() => onOpen(save)}>
            {save.gameOver ? 'Review' : 'Continue'}
          </Button>
          {onDelete && (
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete campaign">
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accolades                                                           */
/* ------------------------------------------------------------------ */

function AccoladesTab({
  stats, saves,
}: {
  stats: ReturnType<typeof computeCareerStats>;
  saves: SaveMeta[];
}) {
  // Save summaries carry a count, not the ids, so the gallery reports the best
  // single run rather than pretending to know exactly which ones were earned.
  const best = saves.reduce<SaveMeta | null>(
    (top, s) => ((s.achievements ?? 0) > (top?.achievements ?? -1) ? s : top),
    null,
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Objectives achieved" value={stats.goalsAchieved.length} hint={`of ${Object.keys(VICTORY_INDEX).length}`} accent="#f5d073" icon={<Crown size={14} />} />
          <Stat label="Best achievement run" value={`${stats.bestAchievementCount} / ${ACHIEVEMENTS.length}`} accent="#9d6bff" icon={<Award size={14} />} />
          <Stat label="Victories" value={stats.victories} accent="#7ee787" icon={<Trophy size={14} />} />
          <Stat label="Wars won" value={stats.totalWarsWon} accent="#ff5c6c" icon={<Swords size={14} />} />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Card title="Victory paths" subtitle="Objectives you have actually completed" icon="🎯">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.values(VICTORY_INDEX).map((goal) => {
              const done = stats.goalsAchieved.some((g) => g.id === goal.id);
              return (
                <div
                  key={goal.id}
                  className={clsx(
                    'flex items-start gap-2.5 rounded-xl border p-3 transition',
                    done ? 'border-gold-500/40 bg-gold-500/[0.07]' : 'border-white/10 opacity-60',
                  )}
                >
                  <span className={clsx('text-lg', !done && 'grayscale')}>{goal.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      {goal.name}
                      {done && <Check size={11} className="text-aurora-lime" />}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{goal.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Reveal>

      {best && (
        <Reveal delay={0.08}>
          <Card title="Most decorated campaign" icon="🏅">
            <div className="flex items-center gap-3">
              <Flag iso2={best.iso2 || undefined} width={160} className="h-12 w-16 shrink-0" title={best.nationName} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{best.nationName}</p>
                <p className="text-[11px] text-slate-500">{best.leaderName}</p>
                <div className="mt-2">
                  <Meter value={best.achievements ?? 0} max={ACHIEVEMENTS.length} height={5} color="#e5b447" />
                  <p className="num mt-1 text-[11px] text-slate-400">
                    {best.achievements ?? 0} of {ACHIEVEMENTS.length} achievements ·{' '}
                    {(((best.achievements ?? 0) / ACHIEVEMENTS.length) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <Card
          title="Achievement catalogue"
          subtitle={`${ACHIEVEMENTS.length} to earn, worth ${TOTAL_ACHIEVEMENT_POINTS} points in total`}
          icon="📜"
        >
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ACHIEVEMENTS.filter((a) => !a.hidden).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <span className="text-sm">{a.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{a.name}</span>
                <span className="num shrink-0 text-[10px] text-slate-500">{a.points}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Achievements are tracked per campaign — open a campaign's Achievements panel to see exactly which ones
            it has earned. Hidden achievements are not listed here.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const { prefs, setPref, notify } = useUiStore();
  const { user, available } = useAuthStore();
  const [confirmWipe, setConfirmWipe] = useState(false);

  const toggles: { key: keyof typeof prefs; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      key: 'reduceMotion',
      icon: <Sparkles size={14} />,
      label: 'Reduce motion',
      hint: 'Turns off the animated backdrop, drifting particles and transition animations. Useful on older hardware or if motion is uncomfortable.',
    },
    {
      key: 'autosaveToCloud',
      icon: <Cloud size={14} />,
      label: 'Autosave to cloud',
      hint: 'Pushes a cloud save roughly once per in-game year and whenever a campaign ends. Requires an account.',
    },
    {
      key: 'showTutorial',
      icon: <Flame size={14} />,
      label: 'Show guidance',
      hint: 'Displays the alert strip and contextual hints on the situation room.',
    },
  ];

  return (
    <div className="space-y-5">
      <Reveal>
        <Card title="Preferences" subtitle="Stored in this browser" icon="⚙️">
          <div className="space-y-3">
            {toggles.map((t) => {
              const enabled = Boolean(prefs[t.key]);
              const unavailable = t.key === 'autosaveToCloud' && (!available || !user);
              return (
                <button
                  key={t.key}
                  disabled={unavailable}
                  onClick={() => setPref(t.key, !enabled)}
                  className={clsx(
                    'focus-ring flex w-full items-start gap-3 rounded-xl border border-white/10 p-3 text-left transition hover:border-white/25',
                    unavailable && 'pointer-events-none opacity-45',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition',
                      enabled && !unavailable ? 'bg-gold-500' : 'bg-white/15',
                    )}
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      className={clsx('h-4 w-4 rounded-full bg-white shadow', enabled && !unavailable && 'ml-auto')}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      {t.icon} {t.label}
                      {unavailable && <Badge tone="neutral">Needs an account</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <Card title="Account" icon="👤">
          <dl className="space-y-2.5">
            <Record label="Signed in as" value={user?.email ?? 'Not signed in'} />
            <Record label="Display name" value={user?.displayName ?? '—'} />
            <Record label="Cloud sync" value={available ? (user ? 'Enabled' : 'Available — sign in') : 'Not configured'} />
          </dl>
          {!user && available && (
            <Link to="/auth" className="mt-4 inline-block">
              <Button variant="primary" size="sm">Sign in or create an account</Button>
            </Link>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.08}>
        <Card title="Local data" subtitle="Campaigns stored in this browser" icon="🗄️" className="border-aurora-red/25">
          <p className="text-xs leading-relaxed text-slate-400">
            Clearing local data removes every campaign saved in this browser and resets your preferences. Cloud
            saves and leaderboard entries are not affected.
          </p>
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} className="mt-3" onClick={() => setConfirmWipe(true)}>
            Clear local data
          </Button>
        </Card>
      </Reveal>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        size="sm"
        title="Clear all local data?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmWipe(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => {
                try {
                  for (const key of Object.keys(localStorage)) {
                    if (key.startsWith('sovereign:')) localStorage.removeItem(key);
                  }
                  notify('success', 'Local data cleared', 'This browser no longer holds any campaign data.');
                } catch {
                  notify('warning', 'Could not clear', 'Your browser refused the request.');
                }
                setConfirmWipe(false);
                window.location.href = '/';
              }}
            >
              Clear everything
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-300">
          Every locally saved campaign, the autosave and your preferences will be deleted. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

