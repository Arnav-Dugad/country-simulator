import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award, BarChart3, Building2, ChevronsRight, CloudUpload, Factory, FlaskConical, Gauge,
  Gavel, Globe2, Landmark, LayoutDashboard, Leaf, LogOut, Menu, Pause, Play, ScrollText, Shield,
  Ship, Swords, Target, Users, Wallet, X,
} from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { MONTH_SHORT, formatBillions, formatMoney } from '../../game/selectors';
import { useGameStore } from '../../store/gameStore';
import { useUiStore, type PanelId } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Badge, Button, CountUp, Meter, Tooltip, meterColor } from '../ui/primitives';
import { Flag } from '../ui/Flag';

const NAV: { id: PanelId; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: 'dashboard', label: 'Situation Room', icon: LayoutDashboard, group: 'Overview' },
  { id: 'objectives', label: 'Objectives', icon: Target, group: 'Overview' },
  { id: 'economy', label: 'Economy', icon: BarChart3, group: 'Government' },
  { id: 'budget', label: 'Treasury', icon: Wallet, group: 'Government' },
  { id: 'policies', label: 'Legislation', icon: ScrollText, group: 'Government' },
  { id: 'decrees', label: 'Executive Actions', icon: Gavel, group: 'Government' },
  { id: 'politics', label: 'Politics', icon: Landmark, group: 'Government' },
  { id: 'cabinet', label: 'Cabinet', icon: Users, group: 'Government' },
  { id: 'provinces', label: 'Provinces', icon: Building2, group: 'Government' },
  { id: 'research', label: 'Research', icon: FlaskConical, group: 'Development' },
  { id: 'construction', label: 'Construction', icon: Factory, group: 'Development' },
  { id: 'society', label: 'Society', icon: Users, group: 'Development' },
  { id: 'environment', label: 'Environment', icon: Leaf, group: 'Development' },
  { id: 'military', label: 'Defence', icon: Swords, group: 'Power' },
  { id: 'diplomacy', label: 'Diplomacy', icon: Globe2, group: 'Power' },
  { id: 'trade', label: 'Trade', icon: Ship, group: 'Power' },
  { id: 'intelligence', label: 'Intelligence', icon: Shield, group: 'Power' },
  { id: 'achievements', label: 'Achievements', icon: Award, group: 'Record' },
  { id: 'history', label: 'Chronicle', icon: ScrollText, group: 'Record' },
];

const GROUPS = ['Overview', 'Government', 'Development', 'Power', 'Record'];

export function GameShell({ game, children }: { game: GameState; children: React.ReactNode }) {
  const { panel, setPanel, sidebarOpen, setSidebar } = useUiStore();

  // Close the mobile drawer whenever the viewport grows past the breakpoint.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebar(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setSidebar]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar game={game} />

      <div className="flex flex-1">
        <aside className="sticky top-[3.75rem] hidden h-[calc(100vh-3.75rem)] w-56 shrink-0 overflow-y-auto border-r border-white/[0.07] px-3 py-4 lg:block">
          <NavList panel={panel} onSelect={setPanel} game={game} />
        </aside>

        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebar(false)}
              />
              <motion.aside
                className="glass-strong fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto rounded-none px-3 py-4 lg:hidden"
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              >
                <div className="mb-3 flex items-center justify-between px-2">
                  <span className="font-display text-sm font-bold text-white">Ministries</span>
                  <button onClick={() => setSidebar(false)} className="focus-ring rounded p-1.5 text-slate-400 hover:text-white" aria-label="Close menu">
                    <X size={16} />
                  </button>
                </div>
                <NavList panel={panel} onSelect={setPanel} game={game} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={panel}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function NavList({ panel, onSelect, game }: { panel: PanelId; onSelect: (id: PanelId) => void; game: GameState }) {
  // Badges draw the eye to whatever currently needs a decision.
  const counts: Partial<Record<PanelId, number>> = {
    research: game.research.current ? 0 : 1,
    construction: game.construction.length,
    diplomacy: game.wars.filter((w) => !w.resolved).length,
    cabinet: Math.max(0, 5 - game.advisors.length),
  };

  return (
    <nav className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{group}</p>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === group).map((item) => {
              const Icon = item.icon;
              const active = panel === item.id;
              const count = counts[item.id];
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    className={clsx(
                      'focus-ring group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition',
                      active ? 'text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-lg border border-gold-500/30 bg-gold-500/[0.1]"
                        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                      />
                    )}
                    <Icon size={15} className={clsx('relative z-10 shrink-0', active && 'text-gold-400')} />
                    <span className="relative z-10 flex-1 truncate text-left">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className="num relative z-10 rounded-full bg-gold-500/20 px-1.5 text-[10px] font-semibold text-gold-400">
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function TopBar({ game }: { game: GameState }) {
  const { playing, setPlaying, setSpeed, advance, quit, saveToCloud, syncing } = useGameStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);

  const eventPending = game.eventQueue.length > 0;
  const finished = game.gameOver !== null;
  const symbol = game.identity.currency.symbol;

  const vitals = useMemo(
    () => [
      { label: 'Approval', value: game.approval, tone: meterColor(game.approval) },
      { label: 'Stability', value: game.stability, tone: meterColor(game.stability) },
      { label: 'Integrity', value: 100 - game.corruption, tone: meterColor(100 - game.corruption) },
      { label: 'Happiness', value: game.society.happiness, tone: meterColor(game.society.happiness) },
    ],
    [game.approval, game.stability, game.corruption, game.society.happiness],
  );

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/75 backdrop-blur-2xl">
      <div className="flex h-14 items-center gap-3 px-3 py-2.5 sm:px-5">
        <button onClick={toggleSidebar} className="focus-ring rounded-lg p-2 text-slate-400 hover:text-white lg:hidden" aria-label="Open menu">
          <Menu size={18} />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <Flag
            iso2={game.identity.iso2 || undefined}
            custom={game.identity.customFlag}
            width={80}
            className="h-7 w-10 shrink-0"
            title={game.identity.name}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-white">{game.identity.name}</p>
            <p className="num truncate text-[11px] leading-tight text-slate-500">
              {MONTH_SHORT[game.month - 1]} {game.year} · Turn {game.turn}
            </p>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-5 xl:flex">
          {vitals.map((v) => (
            <Tooltip key={v.label} label={`${v.label}: ${v.value.toFixed(1)} / 100`}>
              <div className="w-24">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{v.label}</span>
                  <span className="num text-[11px] font-semibold" style={{ color: v.tone }}>
                    {Math.round(v.value)}
                  </span>
                </div>
                <Meter value={v.value} height={3} />
              </div>
            </Tooltip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Treasury</p>
            <p className={clsx('num text-sm font-bold', game.economy.treasury > 0 ? 'text-gold-400' : 'text-aurora-red')}>
              <CountUp
                value={game.economy.treasury}
                decimals={0}
                prefix=""
                suffix=""
                duration={520}
              />
            </p>
          </div>
          <div className="hidden text-right md:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">GDP</p>
            <p className="num text-sm font-bold text-white">{formatBillions(game.economy.gdp, symbol)}</p>
          </div>

          <div className="hidden h-8 w-px bg-white/10 sm:block" />

          {!finished && (
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1">
              <Tooltip label={eventPending ? 'Resolve the pending decision first' : playing ? 'Pause' : 'Auto-advance'}>
                <button
                  onClick={() => setPlaying(!playing)}
                  disabled={eventPending}
                  className={clsx(
                    'focus-ring rounded-lg p-1.5 transition',
                    playing ? 'bg-gold-500 text-ink-950' : 'text-slate-300 hover:bg-white/10 hover:text-white',
                    eventPending && 'cursor-not-allowed opacity-40',
                  )}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
              </Tooltip>

              <Tooltip label="Advance one month">
                <button
                  onClick={() => advance(1)}
                  disabled={eventPending}
                  className={clsx(
                    'focus-ring rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white',
                    eventPending && 'cursor-not-allowed opacity-40',
                  )}
                  aria-label="Advance one month"
                >
                  <ChevronsRight size={15} />
                </button>
              </Tooltip>

              <div className="flex items-center gap-0.5 border-l border-white/10 pl-1">
                {([1, 2, 3] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSpeed(speed)}
                    className={clsx(
                      'focus-ring h-6 w-6 rounded text-[10px] font-bold transition',
                      game.settings.autoSpeed === speed ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white',
                    )}
                    aria-label={`Speed ${speed}`}
                  >
                    {'▸'.repeat(speed)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {eventPending && <Badge tone="warn" className="hidden animate-pulse sm:inline-flex">Decision required</Badge>}

          {game.settings.neverEndGame && !eventPending && (
            <Tooltip label="Eternal mode: no loss condition can end this campaign.">
              <Badge tone="info" className="hidden lg:inline-flex">♾️ Eternal</Badge>
            </Tooltip>
          )}

          {user && (
            <Tooltip label={syncing ? 'Saving…' : 'Save to cloud'}>
              <Button size="sm" variant="ghost" onClick={() => saveToCloud(user.uid)} loading={syncing} aria-label="Save to cloud">
                {!syncing && <CloudUpload size={15} />}
              </Button>
            </Tooltip>
          )}

          <Tooltip label="Leave campaign">
            <Button size="sm" variant="ghost" onClick={quit} aria-label="Leave campaign">
              <LogOut size={15} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Mobile vitals strip */}
      <div className="flex items-center gap-3 overflow-x-auto border-t border-white/[0.05] px-3 py-1.5 xl:hidden">
        {vitals.map((v) => (
          <div key={v.label} className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{v.label}</span>
            <span className="num text-[11px] font-semibold" style={{ color: v.tone }}>
              {Math.round(v.value)}
            </span>
          </div>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:hidden">
          <Gauge size={11} className="text-slate-500" />
          <span className="num text-[11px] font-semibold text-gold-400">{formatMoney(game.economy.treasury, symbol)}</span>
        </div>
      </div>
    </header>
  );
}
