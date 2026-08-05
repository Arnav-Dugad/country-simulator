import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { NAV, NAV_INDEX, navBadges } from '../layout/GameShell';
import { POLICIES } from '../../game/data/policies';
import { TECHNOLOGIES } from '../../game/data/technologies';
import { BUILDINGS } from '../../game/data/buildings';
import { DECREES } from '../../game/data/decrees';
import { useUiStore, type PanelId } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';

/**
 * The command palette.
 *
 * A country simulator has twenty-two panels and several hundred individual
 * things a player can enact, research or build. Hunting for any of them
 * through the navigation is the single largest friction in the game, so this
 * finds all of it from one keystroke — and where the target is directly
 * actionable it runs the action rather than merely navigating to it.
 */

interface Command {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: string;
  /** Extra text the search matches against. */
  keywords: string;
  run: () => void;
}

export function CommandPalette({ game }: { game: GameState }) {
  const open = useUiStore((s) => s.paletteOpen);
  const setPalette = useUiStore((s) => s.setPalette);
  const setPanel = useUiStore((s) => s.setPanel);
  const recent = useUiStore((s) => s.recentPanels);
  const store = useGameStore();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // Focus after the entry animation has begun so it is not stolen back.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const badges = navBadges(game);
    const out: Command[] = [];

    for (const item of NAV) {
      const count = badges[item.id];
      out.push({
        id: `panel-${item.id}`,
        label: item.label,
        hint: count ? `${count} needing attention` : item.group,
        group: 'Go to',
        icon: '→',
        keywords: item.keywords,
        run: () => setPanel(item.id),
      });
    }

    // Only offer actions that would actually succeed — a palette that lists
    // things you cannot do is worse than one that lists fewer things.
    for (const tech of TECHNOLOGIES) {
      if (game.research.completed.includes(tech.id)) continue;
      if (game.research.active.some((p) => p.techId === tech.id)) continue;
      if (game.research.queue.includes(tech.id)) continue;
      if (!tech.requires.every((r) => game.research.completed.includes(r))) continue;
      out.push({
        id: `tech-${tech.id}`,
        label: `Research ${tech.name}`,
        hint: `${tech.cost.toLocaleString()} pts · tier ${tech.tier}`,
        group: 'Research',
        icon: tech.icon,
        keywords: `${tech.branch} ${tech.description}`,
        run: () => store.startResearch(tech.id),
      });
    }

    for (const policy of POLICIES) {
      if (game.activePolicies.includes(policy.id)) continue;
      out.push({
        id: `policy-${policy.id}`,
        label: `Enact ${policy.name}`,
        hint: policy.category,
        group: 'Legislation',
        icon: policy.icon,
        keywords: policy.description,
        run: () => store.enactPolicy(policy.id),
      });
    }

    for (const building of BUILDINGS) {
      out.push({
        id: `build-${building.id}`,
        label: `Build ${building.name}`,
        hint: `${building.buildTime} months · ${building.category}`,
        group: 'Construction',
        icon: building.icon,
        keywords: building.description,
        run: () => store.build(building.id),
      });
    }

    for (const decree of DECREES) {
      out.push({
        id: `decree-${decree.id}`,
        label: decree.name,
        hint: decree.category,
        group: 'Executive actions',
        icon: decree.icon,
        keywords: decree.description,
        run: () => store.enactDecree(decree.id),
      });
    }

    return out;
  }, [game, setPanel, store]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // With no query, show recent panels first, then the rest of navigation.
      const recentCommands = recent
        .map((id) => commands.find((c) => c.id === `panel-${id as PanelId}`))
        .filter((c): c is Command => c !== undefined)
        .map((c) => ({ ...c, group: 'Recent' }));
      const rest = NAV.filter((n) => !recent.includes(n.id))
        .map((n) => commands.find((c) => c.id === `panel-${n.id}`))
        .filter((c): c is Command => c !== undefined);
      return [...recentCommands, ...rest].slice(0, 14);
    }

    const scored = commands
      .map((c) => {
        const label = c.label.toLowerCase();
        const keywords = c.keywords.toLowerCase();
        let score = 0;
        if (label.startsWith(q)) score = 100;
        else if (label.includes(q)) score = 70;
        else if (keywords.includes(q)) score = 40;
        else if (c.group.toLowerCase().includes(q)) score = 20;
        else return null;
        // Navigation ranks above content: it is what most searches want.
        if (c.group === 'Go to') score += 15;
        return { c, score };
      })
      .filter((x): x is { c: Command; score: number } => x !== null)
      .sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label));

    return scored.slice(0, 40).map((x) => x.c);
  }, [commands, query, recent]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return <AnimatePresence />;

  const run = (command: Command | undefined) => {
    if (!command) return;
    command.run();
    setPalette(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      >
        <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-md" onClick={() => setPalette(false)} aria-hidden />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="glass-strong relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
          initial={{ opacity: 0, y: -12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
            <Search size={17} className="shrink-0 text-slate-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPalette(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(results.length - 1, c + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  run(results[cursor]);
                }
              }}
              placeholder="Jump to a ministry, or research, enact or build something…"
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
              aria-label="Search commands"
            />
            <kbd className="hidden shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-slate-500 sm:block">
              Esc
            </kbd>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-500">
                Nothing matches “{query}”.
              </p>
            ) : (
              results.map((command, i) => {
                const previousGroup = i > 0 ? results[i - 1].group : null;
                return (
                  <div key={command.id}>
                    {command.group !== previousGroup && (
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {command.group}
                      </p>
                    )}
                    <button
                      data-index={i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => run(command)}
                      className={clsx(
                        'focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                        i === cursor ? 'bg-gold-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.05]',
                      )}
                    >
                      <span className="w-5 shrink-0 text-center text-sm">{command.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{command.label}</span>
                      <span className="shrink-0 truncate text-[10px] text-slate-500">{command.hint}</span>
                      {i === cursor && <CornerDownLeft size={12} className="shrink-0 text-gold-400" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[10px] text-slate-600">
            <span>
              <kbd className="rounded bg-white/[0.07] px-1">↑</kbd>
              <kbd className="ml-0.5 rounded bg-white/[0.07] px-1">↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded bg-white/[0.07] px-1">↵</kbd> run
            </span>
            <span className="ml-auto">
              Actions that are not currently possible will say why.
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Panel label lookup used by the next-move strip and toasts. */
export function panelLabel(id: PanelId): string {
  return NAV_INDEX[id]?.label ?? id;
}
