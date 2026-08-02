import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Cloud, CloudOff, Crown, Download, Globe2, LogIn, LogOut, Sparkles, Trash2, Trophy,
  UserRound,
} from 'lucide-react';
import type { SaveMeta } from '../firebase/saves';
import { listCloudSaves, loadCloudSave } from '../firebase/saves';
import { deleteLocalSave, listLocalSaves, loadLocalSave, readAutosave } from '../game/storage';
import { COUNTRIES } from '../game/data/countries';
import { ACHIEVEMENTS } from '../game/data/achievements';
import { POLICIES } from '../game/data/policies';
import { TECHNOLOGIES } from '../game/data/technologies';
import { BUILDINGS } from '../game/data/buildings';
import { EVENTS } from '../game/data/events';
import { MONTH_SHORT, formatBillions } from '../game/selectors';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { Badge, Button, Card, EmptyState, Reveal, Spinner } from '../components/ui/primitives';
import { Flag } from '../components/ui/Flag';

const FEATURES = [
  {
    icon: '🏛️',
    title: 'A state that actually works',
    body: 'Taxes fund departments, departments move indices, indices move growth, growth moves elections. Every number in the game is produced by something else in the game.',
  },
  {
    icon: '🌍',
    title: `${COUNTRIES.length} real nations`,
    body: 'Real populations, GDP, currencies, resource endowments, governments and flags. Or found your own country and design its flag from scratch.',
  },
  {
    icon: '📜',
    title: `${POLICIES.length} policies, ${TECHNOLOGIES.length} technologies`,
    body: 'Every policy is a genuine trade-off, and every technology raises the ceiling on what your economy can become.',
  },
  {
    icon: '⚡',
    title: `${EVENTS.length} branching situations`,
    body: 'Recessions, coups, pandemics, oil discoveries and general strikes. Risky options can backfire — and a well-run state gambles better.',
  },
  {
    icon: '🏗️',
    title: `${BUILDINGS.length} projects and wonders`,
    body: 'From gas turbines to fusion plants, container ports to an orbital elevator. Each takes real time to deliver.',
  },
  {
    icon: '🏆',
    title: `${ACHIEVEMENTS.length} achievements`,
    body: 'Seven victory paths, a composite score across eight pillars, and a global leaderboard to put it on.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { user, available, logout } = useAuthStore();
  const load = useGameStore((s) => s.load);
  const notify = useUiStore((s) => s.notify);

  const [localSaves, setLocalSaves] = useState<SaveMeta[]>([]);
  const [cloudSaves, setCloudSaves] = useState<SaveMeta[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const autosave = useMemo(() => readAutosave(), []);

  useEffect(() => {
    setLocalSaves(listLocalSaves());
  }, []);

  useEffect(() => {
    if (!user) {
      setCloudSaves([]);
      return;
    }
    let cancelled = false;
    setLoadingCloud(true);
    listCloudSaves(user.uid)
      .then((saves) => {
        if (!cancelled) setCloudSaves(saves);
      })
      .catch(() => {
        if (!cancelled) notify('warning', 'Could not load cloud saves', 'Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCloud(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, notify]);

  const resume = () => {
    if (!autosave) return;
    if (load(autosave)) navigate('/play');
    else notify('warning', 'Could not resume', 'That save could not be read.');
  };

  const openLocal = (id: string) => {
    const state = loadLocalSave(id);
    if (state && load(state)) navigate('/play');
    else notify('warning', 'Could not load', 'That save is missing or corrupted.');
  };

  const openCloud = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    try {
      const state = await loadCloudSave(user.uid, id);
      if (state && load(state)) navigate('/play');
      else notify('warning', 'Could not load', 'That cloud save could not be read.');
    } catch {
      notify('warning', 'Could not load', 'The server did not respond.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🏛️</span>
          <span className="font-display text-lg font-bold text-white">Sovereign</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/leaderboard">
            <Button variant="ghost" size="sm" icon={<Trophy size={15} />}>
              <span className="hidden sm:inline">Leaderboard</span>
            </Button>
          </Link>
          <Link to="/profile">
            <Button variant="ghost" size="sm" icon={<UserRound size={15} />}>
              <span className="hidden sm:inline">Profile</span>
            </Button>
          </Link>
          {available ? (
            user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">{user.displayName ?? user.email}</span>
                <Button variant="ghost" size="sm" icon={<LogOut size={15} />} onClick={logout}>
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </div>
            ) : (
              <Link to="/auth">
                <Button variant="secondary" size="sm" icon={<LogIn size={15} />}>
                  Sign in
                </Button>
              </Link>
            )
          ) : (
            <Badge tone="neutral" className="hidden sm:inline-flex">
              <CloudOff size={11} /> Offline mode
            </Badge>
          )}
        </nav>
      </header>

      <section className="relative mb-14 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge tone="gold" className="mb-5">
            <Sparkles size={11} /> Ultra-premium country simulator
          </Badge>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-white">Run a country.</span>
            <br />
            <span className="text-gradient-aurora">Leave a legacy.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            Take command of any of {COUNTRIES.length} real nations — or found your own. Balance the budget, win
            elections, negotiate treaties, decarbonise the grid, and try to still be in office in fifty years.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/new">
              <Button variant="primary" size="lg" icon={<Crown size={18} />}>
                Start a new campaign
              </Button>
            </Link>
            {autosave && !autosave.gameOver && (
              <Button variant="secondary" size="lg" icon={<ArrowRight size={18} />} onClick={resume}>
                Resume {autosave.identity.name}
              </Button>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
            <span>{COUNTRIES.length} nations</span>
            <span>·</span>
            <span>{POLICIES.length} policies</span>
            <span>·</span>
            <span>{TECHNOLOGIES.length} technologies</span>
            <span>·</span>
            <span>{BUILDINGS.length} projects</span>
            <span>·</span>
            <span>{EVENTS.length} events</span>
            <span>·</span>
            <span>{ACHIEVEMENTS.length} achievements</span>
          </div>
        </motion.div>

        <motion.div
          className="mt-12 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          {['us', 'cn', 'in', 'de', 'br', 'ng', 'jp', 'gb', 'fr', 'za', 'id', 'mx', 'no', 'sg', 'au', 'eg'].map((iso, i) => (
            <motion.div
              key={iso}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.035, duration: 0.4 }}
            >
              <Flag iso2={iso} width={80} className="h-7 w-10 shadow-lg transition-transform hover:scale-110" />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {(autosave || localSaves.length > 0 || cloudSaves.length > 0 || loadingCloud) && (
        <Reveal>
          <section className="mb-14">
            <h2 className="mb-4 text-lg font-bold text-white">Continue a campaign</h2>

            {loadingCloud && (
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                <Spinner size={13} /> Loading cloud saves…
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cloudSaves.map((save) => (
                <SaveCard
                  key={`cloud-${save.id}`}
                  save={save}
                  source="cloud"
                  busy={busyId === save.id}
                  onOpen={() => openCloud(save.id)}
                />
              ))}
              {localSaves
                .filter((save) => !cloudSaves.some((c) => c.id === save.id))
                .map((save) => (
                  <SaveCard
                    key={`local-${save.id}`}
                    save={save}
                    source="local"
                    onOpen={() => openLocal(save.id)}
                    onDelete={() => {
                      deleteLocalSave(save.id);
                      setLocalSaves(listLocalSaves());
                    }}
                  />
                ))}
            </div>

            {!loadingCloud && cloudSaves.length === 0 && localSaves.length === 0 && (
              <EmptyState icon="💾" title="No saved campaigns" body="Start a new campaign to begin." />
            )}
          </section>
        </Reveal>
      )}

      <section className="mb-14">
        <Reveal>
          <h2 className="mb-2 text-center text-2xl font-bold text-white">Everything is connected</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-slate-400">
            There are no isolated systems. Cut the education budget and, ten years later, productivity falls, growth
            slows, crime rises and your approval goes with it.
          </p>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.06}>
              <div className="glass h-full p-6 transition hover:border-white/20">
                <span className="mb-3 block text-3xl">{feature.icon}</span>
                <h3 className="text-base font-bold text-white">{feature.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {available && !user && (
        <Reveal>
          <Card className="mb-14 text-center" padded>
            <Cloud size={26} className="mx-auto mb-3 text-gold-400" />
            <h3 className="text-base font-bold text-white">Sign in to sync across devices</h3>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
              An account gives you cloud saves, a place on the global leaderboard, and the ability to pick a campaign
              back up on any device. You can also play entirely offline — saves are kept in this browser.
            </p>
            <Link to="/auth" className="mt-4 inline-block">
              <Button variant="primary" icon={<LogIn size={16} />}>
                Create an account
              </Button>
            </Link>
          </Card>
        </Reveal>
      )}

      <footer className="border-t border-white/[0.07] pt-6 text-center text-[11px] text-slate-600">
        <p className="flex flex-wrap items-center justify-center gap-2">
          <Globe2 size={12} />
          Sovereign — a systemic country simulator. Flags via flagcdn.com. Country data is approximate and for play,
          not reference.
        </p>
      </footer>
    </div>
  );
}

function SaveCard({
  save, source, busy, onOpen, onDelete,
}: {
  save: SaveMeta;
  source: 'cloud' | 'local';
  busy?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="glass group flex items-start gap-3 p-4 transition hover:border-white/20">
      <Flag
        iso2={save.iso2 || undefined}
        custom={save.flagColors ? { pattern: 'triband-v', colors: save.flagColors as [string, string, string], emblem: '★' } : null}
        width={80}
        className="h-9 w-12 shrink-0"
        title={save.nationName}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-white">{save.nationName}</p>
          <Badge tone={source === 'cloud' ? 'info' : 'neutral'}>
            {source === 'cloud' ? <Cloud size={9} /> : <Download size={9} />}
          </Badge>
        </div>
        <p className="truncate text-[11px] text-slate-500">{save.leaderName}</p>
        <p className="num mt-1 text-[11px] text-slate-400">
          {MONTH_SHORT[Math.max(0, Math.min(11, save.month - 1))]} {save.year} · {formatBillions(save.gdp)} ·{' '}
          {save.score.toLocaleString()} pts
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onOpen} loading={busy}>
            {save.gameOver ? 'Review' : 'Continue'}
          </Button>
          {onDelete && (
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete save">
              <Trash2 size={13} />
            </Button>
          )}
          {save.gameOver && <Badge tone={save.victory ? 'good' : 'bad'}>{save.victory ? 'Won' : 'Ended'}</Badge>}
        </div>
      </div>
    </div>
  );
}
