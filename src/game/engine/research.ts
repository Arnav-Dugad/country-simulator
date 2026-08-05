import type { GameState, ResearchProject, Technology } from '../types';
import { TECHNOLOGIES, TECH_INDEX } from '../data/technologies';
import { clamp } from '../selectors';

/**
 * Parallel research.
 *
 * A campaign starts with one laboratory. Everything after that is earned:
 * concurrent slots are unlocked by technology, by policy and by building the
 * institutions that could plausibly run two national programmes at once.
 *
 * Output is *not* multiplied by having more slots — it is divided between
 * them. Running three projects means each finishes roughly a third as fast.
 * What parallelism buys is the ability to keep three branches moving rather
 * than being forced to finish one before starting another, plus the overhead
 * saving of never leaving output stranded when a project completes mid-month.
 */

/** Hard ceiling, so a maxed-out campaign cannot run the whole tree at once. */
export const MAX_RESEARCH_SLOTS = 5;

/** Sources that grant an additional concurrent project. */
export const SLOT_SOURCES: { kind: 'tech' | 'policy' | 'building'; id: string; label: string }[] = [
  { kind: 'tech', id: 'research-consortia', label: 'Research Consortia' },
  { kind: 'tech', id: 'national-lab-network', label: 'National Laboratory Network' },
  { kind: 'policy', id: 'open-science-mandate', label: 'Open Science Mandate' },
  { kind: 'building', id: 'science-academy', label: 'National Academy of Sciences' },
];

/** Total concurrent projects this state can run, including the free first one. */
export function researchCapacity(s: GameState): number {
  let slots = 1;
  for (const source of SLOT_SOURCES) {
    const has =
      source.kind === 'tech'
        ? s.research.completed.includes(source.id)
        : source.kind === 'policy'
          ? s.activePolicies.includes(source.id)
          : (s.buildings[source.id] ?? 0) > 0;
    if (has) slots += 1;
  }
  return Math.min(MAX_RESEARCH_SLOTS, slots + Math.max(0, s.research.bonusSlots ?? 0));
}

/** The slot unlocks this state does not yet have, for the UI to advertise. */
export function lockedSlotSources(s: GameState): typeof SLOT_SOURCES {
  return SLOT_SOURCES.filter((source) =>
    source.kind === 'tech'
      ? !s.research.completed.includes(source.id)
      : source.kind === 'policy'
        ? !s.activePolicies.includes(source.id)
        : (s.buildings[source.id] ?? 0) === 0,
  );
}

/**
 * Reconciles the research block into a consistent shape.
 *
 * Three things can leave it inconsistent: a save written before parallel
 * research existed, a test or console poking `current` directly, and a slot
 * being lost when a policy is repealed. This is the single place that fixes
 * all three, and it is called at the top of every research operation.
 */
export function normaliseResearch(s: GameState): void {
  const r = s.research;
  if (!Array.isArray(r.active)) r.active = [];
  if (!Array.isArray(r.queue)) r.queue = [];
  if (typeof r.bonusSlots !== 'number' || !Number.isFinite(r.bonusSlots)) r.bonusSlots = 0;

  // Drop anything unknown or already finished.
  r.active = r.active.filter(
    (p) => p && TECH_INDEX[p.techId] !== undefined && !r.completed.includes(p.techId),
  );
  r.queue = r.queue.filter((id) => TECH_INDEX[id] !== undefined && !r.completed.includes(id));

  // De-duplicate: the same technology must never occupy two slots.
  const seen = new Set<string>();
  r.active = r.active.filter((p) => {
    if (seen.has(p.techId)) return false;
    seen.add(p.techId);
    p.progress = Number.isFinite(p.progress) ? Math.max(0, p.progress) : 0;
    p.priority = Number.isFinite(p.priority) && p.priority > 0 ? p.priority : 1;
    return true;
  });
  r.queue = r.queue.filter((id) => !seen.has(id));

  // `current` set from outside (an old save, or a test) becomes slot zero.
  if (r.current && !seen.has(r.current) && TECH_INDEX[r.current] && !r.completed.includes(r.current)) {
    r.active.unshift({ techId: r.current, progress: Math.max(0, r.progress || 0), priority: 1 });
  }

  // Losing a slot parks the lowest-priority project back at the front of the
  // queue rather than destroying its progress.
  const capacity = researchCapacity(s);
  while (r.active.length > capacity) {
    const dropped = r.active.pop();
    if (dropped) r.queue.unshift(dropped.techId);
  }

  syncMirror(s);
}

/** Keeps the single-value view of research in step with the slot array. */
function syncMirror(s: GameState): void {
  s.research.current = s.research.active[0]?.techId ?? null;
  s.research.progress = s.research.active[0]?.progress ?? 0;
}

/** Technologies whose prerequisites are met and which are not already in play. */
export function startableTechs(s: GameState): Technology[] {
  const done = new Set(s.research.completed);
  const busy = new Set([...s.research.active.map((p) => p.techId), ...s.research.queue]);
  return TECHNOLOGIES.filter(
    (t) => !done.has(t.id) && !busy.has(t.id) && t.requires.every((r) => done.has(r)),
  );
}

export interface StartOutcome {
  ok: boolean;
  message: string;
  /** True when the request went into the queue rather than starting now. */
  queued?: boolean;
}

/**
 * Begins a technology, or queues it when every slot is busy.
 *
 * Queuing rather than failing is deliberate: the whole point of unlocking
 * parallel research is planning ahead, and making the player come back every
 * time a slot frees would be the opposite of that.
 */
export function beginResearch(s: GameState, techId: string, allowQueue = true): StartOutcome {
  normaliseResearch(s);
  const tech = TECH_INDEX[techId];
  if (!tech) return { ok: false, message: 'Unknown technology' };
  if (s.research.completed.includes(techId)) return { ok: false, message: 'Already researched' };
  if (s.research.active.some((p) => p.techId === techId)) {
    return { ok: false, message: 'Already under way' };
  }
  if (s.research.queue.includes(techId)) return { ok: false, message: 'Already queued' };

  const missing = tech.requires.filter((r) => !s.research.completed.includes(r));
  const missingInFlight = missing.filter(
    (r) => s.research.active.some((p) => p.techId === r) || s.research.queue.includes(r),
  );

  if (missing.length > 0) {
    // A prerequisite already in flight can be queued behind; one that is not
    // started anywhere is a genuine block.
    if (!allowQueue || missingInFlight.length !== missing.length) {
      return {
        ok: false,
        message: `Requires ${missing.map((m) => TECH_INDEX[m]?.name ?? m).join(', ')}`,
      };
    }
    s.research.queue.push(techId);
    return { ok: true, queued: true, message: `${tech.name} queued behind its prerequisites.` };
  }

  if (s.research.active.length >= researchCapacity(s)) {
    if (!allowQueue) return { ok: false, message: 'Every laboratory is occupied' };
    s.research.queue.push(techId);
    return { ok: true, queued: true, message: `${tech.name} queued — all laboratories are busy.` };
  }

  s.research.active.push({ techId, progress: 0, priority: 1 });
  applyBankedPoints(s, techId);
  syncMirror(s);
  return { ok: true, message: `Researching ${tech.name}.` };
}

/**
 * Spends banked points on a project the moment it starts.
 *
 * Without this, output generated while every slot was idle would be visible in
 * the UI and completely inert, which reads as a bug even though it is not.
 */
function applyBankedPoints(s: GameState, techId: string): void {
  const project = s.research.active.find((p) => p.techId === techId);
  const tech = TECH_INDEX[techId];
  if (!project || !tech || s.research.points <= 0) return;
  const usable = Math.min(s.research.points, Math.max(0, tech.cost - project.progress));
  project.progress += usable;
  s.research.points -= usable;
}

/** Stops a project, refunding nothing. Progress on it is lost. */
export function stopResearch(s: GameState, techId?: string): StartOutcome {
  normaliseResearch(s);
  const target = techId ?? s.research.active[0]?.techId;
  if (!target) return { ok: false, message: 'Nothing in progress' };
  const index = s.research.active.findIndex((p) => p.techId === target);
  if (index < 0) {
    // Might be sitting in the queue instead.
    const queueIndex = s.research.queue.indexOf(target);
    if (queueIndex < 0) return { ok: false, message: 'Not in progress' };
    s.research.queue.splice(queueIndex, 1);
    return { ok: true, message: `${TECH_INDEX[target]?.name ?? 'Project'} removed from the queue.` };
  }
  const [removed] = s.research.active.splice(index, 1);
  fillSlots(s);
  syncMirror(s);
  return { ok: true, message: `${TECH_INDEX[removed.techId]?.name ?? 'Project'} cancelled.` };
}

/** Sets how much of the monthly output a project receives, 0.25–3. */
export function setResearchPriority(s: GameState, techId: string, priority: number): StartOutcome {
  normaliseResearch(s);
  const project = s.research.active.find((p) => p.techId === techId);
  if (!project) return { ok: false, message: 'Not in progress' };
  project.priority = clamp(Math.round(priority * 4) / 4, 0.25, 3);
  return { ok: true, message: `${TECH_INDEX[techId]?.name ?? 'Project'} priority set.` };
}

/** Moves a queued technology up or down. */
export function reorderQueue(s: GameState, techId: string, delta: number): StartOutcome {
  normaliseResearch(s);
  const index = s.research.queue.indexOf(techId);
  if (index < 0) return { ok: false, message: 'Not queued' };
  const next = clamp(index + delta, 0, s.research.queue.length - 1);
  if (next === index) return { ok: false, message: 'Already at the end of the queue' };
  s.research.queue.splice(index, 1);
  s.research.queue.splice(next, 0, techId);
  return { ok: true, message: 'Queue reordered.' };
}

/** Pulls queued technologies into any free slot whose prerequisites are met. */
function fillSlots(s: GameState): void {
  const capacity = researchCapacity(s);
  let guard = 0;
  while (s.research.active.length < capacity && s.research.queue.length > 0 && guard++ < 32) {
    const index = s.research.queue.findIndex((id) => {
      const tech = TECH_INDEX[id];
      return tech !== undefined && tech.requires.every((r) => s.research.completed.includes(r));
    });
    if (index < 0) break;
    const [techId] = s.research.queue.splice(index, 1);
    s.research.active.push({ techId, progress: 0, priority: 1 });
    applyBankedPoints(s, techId);
  }
}

export interface ResearchTickResult {
  completed: Technology[];
}

/**
 * Advances every active project by one month.
 *
 * Output is split by priority weight. Whatever a project does not need to
 * finish spills over to the others rather than evaporating, so a nearly-done
 * project never wastes a month's production.
 */
export function advanceResearchProjects(s: GameState, output: number): ResearchTickResult {
  normaliseResearch(s);
  const completed: Technology[] = [];

  if (s.research.active.length === 0) {
    // Nothing running: bank it. `beginResearch` spends the bank on start.
    s.research.points = clamp(s.research.points + output, 0, 400_000);
    fillSlots(s);
    syncMirror(s);
    return { completed };
  }

  let remaining = output;
  // Two passes so spillover from an almost-finished project reaches the rest.
  for (let pass = 0; pass < 3 && remaining > 0.01; pass++) {
    const open = s.research.active.filter((p) => {
      const tech = TECH_INDEX[p.techId];
      return tech !== undefined && p.progress < tech.cost;
    });
    if (open.length === 0) break;

    const weightTotal = open.reduce((sum, p) => sum + p.priority, 0) || open.length;
    const pool = remaining;
    remaining = 0;

    for (const project of open) {
      const tech = TECH_INDEX[project.techId];
      if (!tech) continue;
      const share = (pool * project.priority) / weightTotal;
      const needed = Math.max(0, tech.cost - project.progress);
      const applied = Math.min(share, needed);
      project.progress += applied;
      remaining += share - applied;
    }
  }

  // Anything still unspent goes to the bank.
  if (remaining > 0) s.research.points = clamp(s.research.points + remaining, 0, 400_000);

  // Harvest finished projects.
  const survivors: ResearchProject[] = [];
  for (const project of s.research.active) {
    const tech = TECH_INDEX[project.techId];
    if (tech && project.progress >= tech.cost) {
      s.research.completed.push(tech.id);
      completed.push(tech);
    } else {
      survivors.push(project);
    }
  }
  s.research.active = survivors;

  if (completed.length > 0) fillSlots(s);
  syncMirror(s);
  return { completed };
}

/**
 * Instantly finishes a project by spending banked points.
 *
 * The premium is deliberate — buying your way past the last stretch of a
 * programme costs more than simply having waited for it.
 */
export function rushResearch(s: GameState, techId: string): StartOutcome {
  normaliseResearch(s);
  const project = s.research.active.find((p) => p.techId === techId);
  const tech = TECH_INDEX[techId];
  if (!project || !tech) return { ok: false, message: 'Not in progress' };
  const needed = Math.max(0, tech.cost - project.progress);
  const price = Math.ceil(needed * 1.6);
  if (s.research.points < price) {
    return {
      ok: false,
      message: `Needs ${price.toLocaleString()} banked points; you have ${Math.floor(s.research.points).toLocaleString()}.`,
    };
  }
  s.research.points -= price;
  project.progress = tech.cost;
  return { ok: true, message: `${tech.name} rushed to completion.` };
}

/** Months until a project finishes at the current split, or null if stalled. */
export function monthsRemaining(s: GameState, techId: string): number | null {
  const project = s.research.active.find((p) => p.techId === techId);
  const tech = TECH_INDEX[techId];
  if (!project || !tech || s.research.perMonth <= 0) return null;
  const weightTotal = s.research.active.reduce((sum, p) => sum + p.priority, 0) || 1;
  const share = (s.research.perMonth * project.priority) / weightTotal;
  if (share <= 0) return null;
  return Math.max(1, Math.ceil((tech.cost - project.progress) / share));
}
