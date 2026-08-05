import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertOctagon, Award, BarChart3, Building2, ChevronsRight, CloudUpload, Command,
  Factory, FlaskConical, Gauge, Gavel, Globe2, Landmark, LayoutDashboard, Leaf, LogOut, Menu,
  MoreHorizontal, Pause, Pin, Play, Scale, ScrollText, Search, Shield, Ship, Swords, Target,
  Undo2, Users, Wallet, X,
} from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { MONTH_SHORT, formatBillions, formatMoney } from '../../game/selectors';
import { researchCapacity } from '../../game/engine/research';
import { useGameStore } from '../../store/gameStore';
import { useUiStore, type PanelId } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Badge, Button, CountUp, Meter, Tooltip, meterColor } from '../ui/primitives';
import { Flag } from '../ui/Flag';
import { CommandPalette } from '../game/CommandPalette';
import { ShortcutSheet } from '../game/ShortcutSheet';
import { NextMoveStrip } from '../game/NextMoveStrip';
import { DecisionBanner } from '../game/DecisionBanner';
import { Inspect } from '../game/Inspector';

export interface NavItem {
  id: PanelId;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
  /** Extra words the command palette matches against. */
  keywords: string;
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Situation Room', icon: LayoutDashboard, group: 'Overview', keywords: 'home overview summary vitals' },
  { id: 'objectives', label: 'Objectives & Plans', icon: Target, group: 'Overview', keywords: 'victory goal agenda five year plan' },
  { id: 'crises', label: 'Crisis Room', icon: AlertOctagon, group: 'Overview', keywords: 'emergency disaster response' },
  { id: 'economy', label: 'Economy', icon: BarChart3, group: 'Government', keywords: 'gdp growth inflation sectors' },
  { id: 'budget', label: 'Treasury', icon: Wallet, group: 'Government', keywords: 'tax budget debt bonds sovereign fund central bank' },
  { id: 'policies', label: 'Legislation', icon: ScrollText, group: 'Government', keywords: 'policy law bill enact' },
  { id: 'decrees', label: 'Executive Actions', icon: Gavel, group: 'Government', keywords: 'decree order emergency' },
  { id: 'politics', label: 'Politics', icon: Landmark, group: 'Government', keywords: 'parliament parties election approval capital' },
  { id: 'factions', label: 'Interest Groups', icon: Scale, group: 'Government', keywords: 'faction business labour military clergy press regions' },
  { id: 'cabinet', label: 'Cabinet', icon: Users, group: 'Government', keywords: 'advisors ministers appoint' },
  { id: 'provinces', label: 'Provinces', icon: Building2, group: 'Government', keywords: 'region autonomy unrest martial law separatism' },
  { id: 'research', label: 'Research', icon: FlaskConical, group: 'Development', keywords: 'tech science laboratory parallel queue' },
  { id: 'construction', label: 'Construction', icon: Factory, group: 'Development', keywords: 'build buildings wonders projects' },
  { id: 'society', label: 'Society', icon: Users, group: 'Development', keywords: 'population health education happiness' },
  { id: 'environment', label: 'Environment', icon: Leaf, group: 'Development', keywords: 'climate emissions energy grid water' },
  { id: 'military', label: 'Defence', icon: Swords, group: 'Power', keywords: 'army navy air cyber space war nuclear doctrine' },
  { id: 'diplomacy', label: 'Diplomacy', icon: Globe2, group: 'Power', keywords: 'nations treaties offers embassy sanctions' },
  { id: 'world', label: 'World Report', icon: Activity, group: 'Power', keywords: 'global cycle tension blocs foreign wars' },
  { id: 'trade', label: 'Trade', icon: Ship, group: 'Power', keywords: 'commodities resources contracts imports exports' },
  { id: 'intelligence', label: 'Intelligence', icon: Shield, group: 'Power', keywords: 'spy covert ops dossiers' },
  { id: 'achievements', label: 'Achievements', icon: Award, group: 'Record', keywords: 'trophies unlocks' },
  { id: 'history', label: 'Chronicle', icon: ScrollText, group: 'Record', keywords: 'log history charts records' },
];

export const NAV_INDEX = Object.fromEntries(NAV.map((n) => [n.id, n])) as Record<PanelId, NavItem>;

const GROUPS = ['Overview', 'Government', 'Development', 'Power', 'Record'];

/** Number keys 1–9 jump to these panels. */
const QUICK_KEYS: PanelId[] = [
  'dashboard', 'economy', 'budget', 'policies', 'research',
  'construction', 'military', 'diplomacy', 'crises',
];

/**
 * The four destinations that earn a permanent place on a phone screen.
 *
 * Chosen for how often a decision actually starts there, not by category:
 * the situation room, the money, the legislation, and whatever is currently
 * on fire. Everything else lives behind "More", which opens the full drawer.
 */
const MOBILE_TABS: PanelId[] = ['dashboard', 'budget', 'policies', 'crises'];

/**
 * Whether the viewport is narrow enough for the bottom bar.
 *
 * The bar is rendered conditionally rather than hidden with `lg:hidden`,
 * because it repeats the top bar's play and advance controls. Hiding it in CSS
 * would leave two buttons with the same accessible name in the tree at every
 * width, which is a real problem for anyone navigating by screen reader and
 * not merely an inconvenience for the tests.
 */
function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 1023px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setCompact(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return compact;
}

export function GameShell({ game, children }: { game: GameState; children: React.ReactNode }) {
  const panel = useUiStore((s) => s.panel);
  const setPanel = useUiStore((s) => s.setPanel);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebar = useUiStore((s) => s.setSidebar);
  const setPalette = useUiStore((s) => s.setPalette);
  const setHelp = useUiStore((s) => s.setHelp);
  const reduceMotion = useUiStore((s) => s.prefs.reduceMotion);
  const showNextMove = useUiStore((s) => s.prefs.showNextMove);
  const mobileNavPref = useUiStore((s) => s.prefs.mobileNav);
  const compact = useCompactViewport();
  const mobileNav = mobileNavPref && compact;

  const { playing, setPlaying, advance, rewind } = useGameStore();

  // Close the mobile drawer whenever the viewport grows past the breakpoint.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebar(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setSidebar]);

  /* ------------------------- Keyboard shortcuts ------------------------- */
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never hijack a key the player is typing into a field.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (!game.gameOver && game.eventQueue.length === 0) setPlaying(!playing);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault();
        if (!game.gameOver && game.eventQueue.length === 0) advance(1);
        return;
      }
      if (e.key === 'z') {
        e.preventDefault();
        rewind();
        return;
      }
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= QUICK_KEYS.length) {
        e.preventDefault();
        setPanel(QUICK_KEYS[digit - 1]);
      }
    },
    [advance, game.eventQueue.length, game.gameOver, playing, rewind, setHelp, setPalette, setPanel, setPlaying],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar game={game} />
      <DecisionBanner game={game} />
      {showNextMove && !game.gameOver && <NextMoveStrip game={game} />}

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

        <main
          className={clsx(
            'min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6',
            // Room for the bottom bar plus the home indicator, so the last
            // control on a panel is never trapped underneath it.
            mobileNav && 'pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-6',
          )}
        >
          {/*
            The panel body is a plain keyed element with an enter animation and
            no exit. An earlier version wrapped it in `AnimatePresence mode="wait"`,
            which meant switching tabs while the previous panel was still
            animating out could leave the new one unmounted — the blank-panel
            bug. Nothing is ever waiting to be removed here, so content is
            always on screen.
          */}
          <motion.div
            key={panel}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {mobileNav && <MobileNav game={game} panel={panel} onSelect={setPanel} onMore={() => setSidebar(true)} />}

      <CommandPalette game={game} />
      <ShortcutSheet />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile navigation                                                   */
/* ------------------------------------------------------------------ */

/**
 * A bottom tab bar on small screens.
 *
 * A hamburger is one tap too many for the panels a player moves between every
 * month. The four most-used destinations sit under the thumb; "More" opens the
 * full drawer with all twenty-two, and the advance button rides on the right
 * so a month can be played without ever reaching the top of the screen.
 */
function MobileNav({
  game,
  panel,
  onSelect,
  onMore,
}: {
  game: GameState;
  panel: PanelId;
  onSelect: (id: PanelId) => void;
  onMore: () => void;
}) {
  const { advance, playing, setPlaying } = useGameStore();
  const counts = useMemo(() => navBadges(game), [game]);
  const eventPending = game.eventQueue.length > 0;
  const otherAlerts = useMemo(
    () =>
      (Object.entries(counts) as [PanelId, number][])
        .filter(([id, n]) => n > 0 && !MOBILE_TABS.includes(id))
        .reduce((sum, [, n]) => sum + n, 0),
    [counts],
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.09] bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl"
      aria-label="Primary"
    >
      <div className="flex items-stretch">
        {MOBILE_TABS.map((id) => {
          const item = NAV_INDEX[id];
          if (!item) return null;
          const Icon = item.icon;
          const active = panel === id;
          const count = counts[id] ?? 0;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={clsx(
                'focus-ring relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition',
                active ? 'text-gold-400' : 'text-slate-500',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <Icon size={19} />
                {count > 0 && (
                  <span className="num absolute -right-2 -top-1.5 min-w-[14px] rounded-full bg-gold-500 px-1 text-[9px] font-bold leading-[14px] text-ink-950">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-[9.5px] font-medium">{item.label.split(' ')[0]}</span>
              {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gold-400" />}
            </button>
          );
        })}

        <button
          onClick={onMore}
          className="focus-ring relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-slate-500 transition"
          aria-label="All ministries"
        >
          <span className="relative">
            <MoreHorizontal size={19} />
            {otherAlerts > 0 && (
              <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-gold-500" />
            )}
          </span>
          <span className="text-[9.5px] font-medium">More</span>
        </button>

        {!game.gameOver && (
          <div className="flex items-center gap-1 border-l border-white/[0.09] px-2">
            <button
              onClick={() => setPlaying(!playing)}
              disabled={eventPending}
              className={clsx(
                'focus-ring flex h-10 w-10 items-center justify-center rounded-xl transition',
                playing ? 'bg-white/10 text-white' : 'text-slate-400',
                eventPending && 'opacity-35',
              )}
              aria-label={playing ? 'Pause' : 'Auto-advance'}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button
              onClick={() => advance(1)}
              disabled={eventPending}
              className={clsx(
                'focus-ring flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500 text-ink-950 shadow-glow-gold transition active:scale-95',
                eventPending && 'opacity-35',
              )}
              aria-label="Advance one month"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/** Counts that draw the eye to whatever currently needs a decision. */
export function navBadges(game: GameState): Partial<Record<PanelId, number>> {
  const idleLabs = Math.max(0, researchSlotsFree(game));
  return {
    research: idleLabs,
    construction: game.construction.length,
    diplomacy: game.wars.filter((w) => !w.resolved).length + game.offers.length,
    cabinet: Math.max(0, 5 - game.advisors.length),
    crises: game.crises.length,
    factions: game.factions.filter((f) => f.satisfaction < 30).length,
    objectives: game.agenda ? 0 : 1,
  };
}

/**
 * Free laboratories.
 *
 * Reads the engine's own `researchCapacity` rather than restating the unlock
 * list — an earlier copy of that list here drifted the moment a fifth source
 * was added, and the badge quietly started lying.
 */
function researchSlotsFree(game: GameState): number {
  return researchCapacity(game) - game.research.active.length;
}

function NavList({ panel, onSelect, game }: { panel: PanelId; onSelect: (id: PanelId) => void; game: GameState }) {
  const pinned = useUiStore((s) => s.prefs.pinnedPanels);
  const togglePinned = useUiStore((s) => s.togglePinned);
  const counts = useMemo(() => navBadges(game), [game]);
  const [query, setQuery] = useState('');

  const pinnedItems = pinned
    .map((id) => NAV_INDEX[id as PanelId])
    .filter((item): item is NavItem => item !== undefined);

  // Filtering the drawer beats scrolling twenty-two entries on a phone.
  const q = query.trim().toLowerCase();
  const matches = q
    ? NAV.filter(
        (n) => n.label.toLowerCase().includes(q) || n.keywords.includes(q) || n.group.toLowerCase().includes(q),
      )
    : null;

  return (
    <nav className="space-y-4">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a ministry…"
          aria-label="Filter ministries"
          className="focus-ring w-full rounded-lg border border-white/10 bg-ink-800/60 py-2 pl-8 pr-2 text-xs text-white placeholder:text-slate-600"
        />
      </div>

      {matches !== null ? (
        <ul className="space-y-0.5">
          {matches.length === 0 && (
            <li className="px-3 py-4 text-center text-[11px] text-slate-600">Nothing matches “{query}”.</li>
          )}
          {matches.map((item) => (
            <NavButton
              key={`search-${item.id}`}
              item={item}
              active={panel === item.id}
              count={counts[item.id]}
              pinned={pinned.includes(item.id)}
              onSelect={onSelect}
              onTogglePin={togglePinned}
              layoutGroup="nav-active-search"
            />
          ))}
        </ul>
      ) : (
        <>
      {pinnedItems.length > 0 && (
        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-600">Pinned</p>
          <ul className="space-y-0.5">
            {pinnedItems.map((item) => (
              <NavButton
                key={`pin-${item.id}`}
                item={item}
                active={panel === item.id}
                count={counts[item.id]}
                pinned
                onSelect={onSelect}
                onTogglePin={togglePinned}
                layoutGroup="nav-active-pinned"
              />
            ))}
          </ul>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{group}</p>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === group).map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={panel === item.id}
                count={counts[item.id]}
                pinned={pinned.includes(item.id)}
                onSelect={onSelect}
                onTogglePin={togglePinned}
                layoutGroup="nav-active"
              />
            ))}
          </ul>
        </div>
      ))}

      <p className="hidden px-3 pt-2 text-[10px] leading-relaxed text-slate-600 lg:block">
        Press <kbd className="rounded bg-white/10 px-1">Ctrl</kbd>+<kbd className="rounded bg-white/10 px-1">K</kbd> to
        jump anywhere, <kbd className="rounded bg-white/10 px-1">?</kbd> for shortcuts.
      </p>
        </>
      )}
    </nav>
  );
}

function NavButton({
  item, active, count, pinned, onSelect, onTogglePin, layoutGroup,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  pinned: boolean;
  onSelect: (id: PanelId) => void;
  onTogglePin: (id: PanelId) => void;
  layoutGroup: string;
}) {
  const Icon = item.icon;
  return (
    <li className="group/nav relative">
      <button
        onClick={() => onSelect(item.id)}
        className={clsx(
          'focus-ring relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-8 text-xs font-medium transition',
          active ? 'text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white',
        )}
      >
        {active && (
          <motion.span
            layoutId={layoutGroup}
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(item.id);
        }}
        className={clsx(
          'focus-ring absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded p-1 transition',
          pinned
            ? 'text-gold-400 opacity-100'
            : 'text-slate-600 opacity-0 hover:text-white group-hover/nav:opacity-100 focus:opacity-100',
        )}
        aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
        title={pinned ? 'Unpin' : 'Pin to top'}
      >
        <Pin size={11} className={pinned ? 'fill-current' : undefined} />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function TopBar({ game }: { game: GameState }) {
  const { playing, setPlaying, setSpeed, advance, quit, saveToCloud, syncing, rewind, rewindDepth } =
    useGameStore();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setPalette = useUiStore((s) => s.setPalette);
  const user = useAuthStore((s) => s.user);

  const eventPending = game.eventQueue.length > 0;
  const finished = game.gameOver !== null;
  const symbol = game.identity.currency.symbol;
  const canRewind = rewindDepth() > 0;

  const vitals = useMemo(
    () => [
      { label: 'Approval', value: game.approval, tone: meterColor(game.approval), explain: 'approval' as const },
      { label: 'Stability', value: game.stability, tone: meterColor(game.stability), explain: 'stability' as const },
      { label: 'Integrity', value: 100 - game.corruption, tone: meterColor(100 - game.corruption), explain: 'corruption' as const },
      { label: 'Mandate', value: game.governance.mandate, tone: meterColor(game.governance.mandate), explain: 'mandate' as const },
    ],
    [game.approval, game.stability, game.corruption, game.governance.mandate],
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

        <div className="mx-auto hidden items-center gap-4 xl:flex">
          {vitals.map((v) => (
            <div key={v.label} className="flex items-center gap-0.5">
              <Tooltip label={`${v.label}: ${v.value.toFixed(1)} / 100`}>
                <div className="w-20">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{v.label}</span>
                    <span className="num text-[11px] font-semibold" style={{ color: v.tone }}>
                      {Math.round(v.value)}
                    </span>
                  </div>
                  <Meter value={v.value} height={3} />
                </div>
              </Tooltip>
              <Inspect game={game} id={v.explain} label={v.label} />
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Tooltip
            label={`Political capital — spent on legislation, decrees and plans. Income ${game.governance.capitalPerMonth >= 0 ? '+' : ''}${game.governance.capitalPerMonth.toFixed(1)}/month, cap ${Math.round(game.governance.capitalCap)}.`}
          >
            <div className="hidden text-right lg:block">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Capital</p>
              <p className="num text-sm font-bold text-aurora-violet">
                {Math.floor(game.governance.capital)}
                <span className="ml-1 text-[10px] font-medium text-slate-500">
                  {game.governance.capitalPerMonth >= 0 ? '+' : ''}
                  {game.governance.capitalPerMonth.toFixed(1)}
                </span>
              </p>
            </div>
          </Tooltip>

          <div className="hidden text-right sm:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Treasury</p>
            <p className={clsx('num text-sm font-bold', game.economy.treasury > 0 ? 'text-gold-400' : 'text-aurora-red')}>
              <CountUp value={game.economy.treasury} decimals={0} duration={520} />
            </p>
          </div>
          <div className="hidden text-right md:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">GDP</p>
            <p className="num text-sm font-bold text-white">{formatBillions(game.economy.gdp, symbol)}</p>
          </div>

          <div className="hidden h-8 w-px bg-white/10 sm:block" />

          {/*
            The palette is the fastest route to any of ~200 actions, and it was
            previously desktop-only — the icon-only button below the `md`
            breakpoint gives a phone the same reach.
          */}
          <Tooltip label="Jump to anything (Ctrl+K)">
            <button
              onClick={() => setPalette(true)}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-white/[0.05] p-2 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-white md:px-2.5 md:py-1.5"
              aria-label="Search everything"
            >
              <Command size={13} />
              <span className="hidden md:inline">Jump…</span>
            </button>
          </Tooltip>

          {!finished && (
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1">
              <Tooltip label={canRewind ? 'Rewind one month (Z)' : 'Nothing to rewind'}>
                <button
                  onClick={rewind}
                  disabled={!canRewind}
                  className={clsx(
                    'focus-ring rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white',
                    !canRewind && 'cursor-not-allowed opacity-30',
                  )}
                  aria-label="Rewind one month"
                >
                  <Undo2 size={15} />
                </button>
              </Tooltip>

              <Tooltip label={eventPending ? 'Resolve the pending decision first' : playing ? 'Pause (Space)' : 'Auto-advance (Space)'}>
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

              <Tooltip label="Advance one month (→)">
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

          {game.crises.length > 0 && !eventPending && (
            <Badge tone="bad" className="hidden animate-pulse sm:inline-flex">
              {game.crises.length} crisis{game.crises.length === 1 ? '' : 'es'}
            </Badge>
          )}

          {game.settings.neverEndGame && !eventPending && (
            <Tooltip label="Eternal mode: no loss condition can end this campaign.">
              <Badge tone="info" className="hidden 2xl:inline-flex">♾️ Eternal</Badge>
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
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Capital</span>
          <span className="num text-[11px] font-semibold text-aurora-violet">
            {Math.floor(game.governance.capital)}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:hidden">
          <Gauge size={11} className="text-slate-500" />
          <span className="num text-[11px] font-semibold text-gold-400">{formatMoney(game.economy.treasury, symbol)}</span>
        </div>
      </div>
    </header>
  );
}
