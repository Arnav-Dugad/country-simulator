// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { GameState, SetupConfig } from '../game/types';
import { getCountry } from '../game/data/countries';
import { TECHNOLOGIES } from '../game/data/technologies';
import { createGame, defaultSetup } from '../game/engine/createGame';
import { tick } from '../game/engine/tick';
import { resolveEvent } from '../game/engine/events';
import { EVENT_INDEX } from '../game/data/events';
import { useGameStore } from '../store/gameStore';
import { saveGameLocally } from '../game/storage';
import { useUiStore, type PanelId } from '../store/uiStore';
import { GameShell } from '../components/layout/GameShell';
import { EventModal } from '../components/game/EventModal';
import { GameOverModal } from '../components/game/GameOverModal';
import { SetupWizard } from '../components/setup/SetupWizard';
import { LandingPage } from '../pages/LandingPage';
import { AuthPage } from '../pages/AuthPage';
import { LeaderboardPage } from '../pages/LeaderboardPage';
import { Dashboard } from '../components/panels/Dashboard';
import { BudgetPanel, EconomyPanel } from '../components/panels/EconomyPanels';
import { CabinetPanel, PoliciesPanel, PoliticsPanel, ProvincesPanel } from '../components/panels/GovernancePanels';
import { DecreesPanel } from '../components/panels/DecreesPanel';
import { TradePanel } from '../components/panels/TradePanel';
import { AdvisoryBoard } from '../components/panels/AdvisoryBoard';
import { WorldMap } from '../components/panels/WorldMap';
import { ProfilePage } from '../pages/ProfilePage';
import { allRecommendations } from '../game/engine/advisory';
import { setTax } from '../game/engine/actions';
import { computeBudget } from '../game/selectors';
import { COUNTRY_COORDS } from '../game/data/geography';
import { ConstructionPanel, ResearchPanel } from '../components/panels/ProgressPanels';
import { EnvironmentPanel, SocietyPanel } from '../components/panels/SocietyPanels';
import { DiplomacyPanel, IntelligencePanel, MilitaryPanel } from '../components/panels/PowerPanels';
import { AchievementsPanel, HistoryPanel, ObjectivesPanel } from '../components/panels/MetaPanels';
import { CrisisPanel } from '../components/panels/CrisisPanel';
import { FactionsPanel } from '../components/panels/FactionsPanel';
import { WorldPanel } from '../components/panels/WorldPanel';

/** Fails the test if the component tree logged a React error while rendering. */
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const consoleErrors: string[] = [];

beforeEach(() => {
  consoleErrors.length = 0;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '));
  });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

function expectNoReactErrors(label: string): void {
  // Ignore the noise recharts emits about zero-size containers in jsdom.
  const real = consoleErrors.filter(
    (e) => !e.includes('width(0) and height(0)') && !e.includes('The width'),
  );
  expect(real, `${label} logged React errors:\n${real.join('\n')}`).toHaveLength(0);
}

function setupFor(countryId: string, overrides: Partial<SetupConfig> = {}): SetupConfig {
  const country = getCountry(countryId)!;
  return {
    ...defaultSetup(),
    mode: 'real',
    countryId,
    nationName: country.name,
    adjective: country.name,
    capital: country.capital,
    region: country.region,
    iso2: country.iso2,
    currencyCode: country.currency,
    government: country.government,
    leaderName: 'Test Leader',
    traits: ['charismatic'],
    ...overrides,
  };
}

/** A rich mid-campaign state, so panels render with real content, not zeros. */
function matureGame(): GameState {
  const state = createGame(setupFor('germany'), 2024);
  state.research.completed = TECHNOLOGIES.slice(0, 18).map((t) => t.id);
  state.buildings = { 'solar-farm': 3, 'hospital-network': 2, 'wonder-peace-forum': 1, 'nuclear-plant': 1 };
  state.activePolicies = ['universal-healthcare', 'carbon-tax', 'free-university'];
  state.advisors = ['adv-finance', 'adv-science'];
  state.orgs = ['un', 'wto'];
  state.treaties = [
    { id: 't1', type: 'trade', countryId: state.nations[0].id, signedTurn: 4, monthlyValue: 240 },
  ];
  state.wars = [
    {
      id: 'w1', attackerId: 'player', defenderId: state.nations[1].id, startTurn: 10, goal: 'punitive',
      warScore: 32, playerCasualties: 12000, enemyCasualties: 18000, monthlyCost: 900,
    },
  ];
  state.nations[1].atWarWithPlayer = true;
  state.nations[2].sanctioned = true;
  state.intelligence.activeOps = [
    {
      id: 'op1', type: 'espionage', targetId: state.nations[3].id, turnsRemaining: 2,
      successChance: 0.6, cost: 900, label: 'Industrial Espionage — test',
    },
  ];
  state.construction = [
    { instanceId: 'c1', buildingId: 'metro-system', turnsRemaining: 8, totalTurns: 22 },
  ];

  for (let i = 0; i < 80; i++) {
    while (state.eventQueue.length > 0) {
      resolveEvent(state, EVENT_INDEX[state.eventQueue[0].defId].choices[0].id);
    }
    tick(state);
  }
  return state;
}

const PANELS: { id: PanelId; label: string; Component: (props: { game: GameState }) => JSX.Element }[] = [
  { id: 'dashboard', label: 'Dashboard', Component: Dashboard },
  { id: 'objectives', label: 'Objectives', Component: ObjectivesPanel },
  { id: 'economy', label: 'Economy', Component: EconomyPanel },
  { id: 'budget', label: 'Treasury', Component: BudgetPanel },
  { id: 'policies', label: 'Policies', Component: PoliciesPanel },
  { id: 'decrees', label: 'Executive Actions', Component: DecreesPanel },
  { id: 'trade', label: 'Trade', Component: TradePanel },
  { id: 'politics', label: 'Politics', Component: PoliticsPanel },
  { id: 'cabinet', label: 'Cabinet', Component: CabinetPanel },
  { id: 'provinces', label: 'Provinces', Component: ProvincesPanel },
  { id: 'research', label: 'Research', Component: ResearchPanel },
  { id: 'construction', label: 'Construction', Component: ConstructionPanel },
  { id: 'society', label: 'Society', Component: SocietyPanel },
  { id: 'environment', label: 'Environment', Component: EnvironmentPanel },
  { id: 'military', label: 'Military', Component: MilitaryPanel },
  { id: 'diplomacy', label: 'Diplomacy', Component: DiplomacyPanel },
  { id: 'intelligence', label: 'Intelligence', Component: IntelligencePanel },
  { id: 'achievements', label: 'Achievements', Component: AchievementsPanel },
  { id: 'history', label: 'Chronicle', Component: HistoryPanel },
  { id: 'crises', label: 'Crisis Room', Component: CrisisPanel },
  { id: 'factions', label: 'Interest Groups', Component: FactionsPanel },
  { id: 'world', label: 'World Report', Component: WorldPanel },
];

describe('panels', () => {
  const game = matureGame();

  for (const panel of PANELS) {
    it(`renders the ${panel.label} panel without crashing`, () => {
      const { container } = render(
        <MemoryRouter>
          <panel.Component game={game} />
        </MemoryRouter>,
      );
      expect(container.textContent?.length ?? 0).toBeGreaterThan(80);
      expectNoReactErrors(panel.label);
    });
  }

  it('renders every panel for a brand-new campaign with empty history', () => {
    const fresh = createGame(setupFor('fiji'), 7);
    for (const panel of PANELS) {
      const { unmount, container } = render(
        <MemoryRouter>
          <panel.Component game={fresh} />
        </MemoryRouter>,
      );
      expect(container.textContent?.length ?? 0).toBeGreaterThan(40);
      unmount();
    }
    expectNoReactErrors('fresh campaign panels');
  });

  it('renders panels for a fully custom nation', () => {
    const custom = createGame(
      {
        ...defaultSetup(),
        mode: 'custom',
        countryId: null,
        nationName: 'Aurelia',
        adjective: 'Aurelian',
        capital: 'Solmara',
        leaderName: 'Vale Rhen',
        traits: ['visionary'],
        government: 'technocracy',
        ideology: 'progressive',
      },
      42,
    );
    for (const panel of PANELS) {
      const { unmount } = render(
        <MemoryRouter>
          <panel.Component game={custom} />
        </MemoryRouter>,
      );
      unmount();
    }
    expectNoReactErrors('custom nation panels');
  });
});

describe('game shell', () => {
  it('renders the shell and navigates between panels', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    useGameStore.setState({ game, playing: false });
    useUiStore.setState({ panel: 'dashboard' });

    render(
      <MemoryRouter>
        <GameShell game={game}>
          <Dashboard game={game} />
        </GameShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByText(game.identity.name).length).toBeGreaterThan(0);

    const nav = document.querySelector('aside nav');
    expect(nav).not.toBeNull();
    // Each nav row now carries a pin button as well, and the nav label can pick
    // up a badge count, so target the label element and click its button.
    const researchLabel = within(nav as HTMLElement).getByText('Research');
    const research = researchLabel.closest('button');
    expect(research).not.toBeNull();
    await user.click(research as HTMLElement);
    expect(useUiStore.getState().panel).toBe('research');

    expectNoReactErrors('game shell');
  });

  it('never blanks the body when panels are switched rapidly', async () => {
    // Regression: the shell used to wrap the panel body in an
    // `AnimatePresence mode="wait"`. Switching tabs while the previous panel
    // was still animating out could leave the new one unmounted, so the
    // content area went empty and stayed empty. Nothing waits to be removed
    // now, so a burst of switches must always leave something rendered.
    const game = matureGame();
    useGameStore.setState({ game, playing: false });
    useUiStore.setState({ panel: 'dashboard' });

    const { rerender, container } = render(
      <MemoryRouter>
        <GameShell game={game}>
          <div data-testid="panel-body">dashboard</div>
        </GameShell>
      </MemoryRouter>,
    );

    const order: PanelId[] = [
      'economy', 'research', 'crises', 'factions', 'world', 'budget', 'military', 'dashboard',
    ];
    for (const panel of order) {
      act(() => {
        useUiStore.getState().setPanel(panel);
      });
      rerender(
        <MemoryRouter>
          <GameShell game={game}>
            <div data-testid="panel-body">{panel}</div>
          </GameShell>
        </MemoryRouter>,
      );
      // The body must be present and carrying the current panel, every time.
      const body = container.querySelector('[data-testid="panel-body"]');
      expect(body, `panel body vanished switching to ${panel}`).not.toBeNull();
      expect(body?.textContent).toBe(panel);
    }

    expectNoReactErrors('rapid panel switching');
  });

  it('advances a month from the top bar', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('japan'), 5);
    useGameStore.setState({ game, playing: false });

    render(
      <MemoryRouter>
        <GameShell game={game}>
          <div>panel</div>
        </GameShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByLabelText('Advance one month'));
    expect(useGameStore.getState().game!.turn).toBe(1);
    expectNoReactErrors('advance month');
  });
});

describe('event modal', () => {
  it('renders a pending event and applies the chosen option', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('brazil'), 99);
    // Queue a known event so the assertion does not depend on the RNG.
    game.eventQueue = [{ defId: 'mass-protests', turn: game.turn }];
    useGameStore.setState({ game, playing: false });

    render(<EventModal game={game} />);

    expect(screen.getByText('Mass Demonstrations')).toBeTruthy();
    const def = EVENT_INDEX['mass-protests'];
    for (const choice of def.choices) {
      expect(screen.getByText(choice.label)).toBeTruthy();
    }

    const buttons = screen.getAllByRole('button', { name: /Choose this/i });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]);

    expect(useGameStore.getState().game!.eventQueue).toHaveLength(0);
    expectNoReactErrors('event modal');
  });

  it('renders every event definition without crashing', () => {
    const game = createGame(setupFor('india'), 3);
    for (const def of Object.values(EVENT_INDEX)) {
      const staged: GameState = { ...game, eventQueue: [{ defId: def.id, turn: 0 }] };
      const { unmount } = render(<EventModal game={staged} />);
      expect(screen.getByText(def.title)).toBeTruthy();
      unmount();
    }
    expectNoReactErrors('all events');
  });
});

describe('game over', () => {
  it('renders a victory result', () => {
    const game = matureGame();
    game.gameOver = { reason: 'Every objective met.', victory: true, turn: game.turn, title: 'Great Power' };
    useGameStore.setState({ game });

    render(<GameOverModal game={game} />);
    expect(screen.getByText('Great Power')).toBeTruthy();
    expect(screen.getByText(/Final score/i)).toBeTruthy();
    expectNoReactErrors('victory screen');
  });

  it('renders a defeat result', () => {
    const game = matureGame();
    game.gameOver = { reason: 'Sovereign default.', victory: false, turn: game.turn, title: 'Bankruptcy' };
    useGameStore.setState({ game });

    render(<GameOverModal game={game} />);
    expect(screen.getByText('Bankruptcy')).toBeTruthy();
    expectNoReactErrors('defeat screen');
  });
});

describe('setup wizard', () => {
  it('walks the full real-nation flow and produces a valid config', async () => {
    const user = userEvent.setup();
    const onBegin = vi.fn();
    render(<SetupWizard onBegin={onBegin} />);

    // Steps animate in and out, so every assertion after a click must await
    // the new step mounting rather than reading the DOM synchronously.
    const next = async () => user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 1 — mode. "Govern a Real Nation" is preselected.
    await next();

    // Step 2 — nation. Search narrows the grid, then pick the result.
    await user.type(await screen.findByPlaceholderText(/Search by country/i), 'Japan');
    await user.click(await screen.findByText('Japan'));
    await next();

    // Step 3 — government (preselected from the country).
    expect(await screen.findByText(/Choose a system of government/i)).toBeTruthy();
    await next();

    // Step 4 — leader. A name is required.
    await user.type(await screen.findByPlaceholderText(/Vale Rhen/i), 'Aiko Tanaka');
    await next();

    // Step 5 — traits. At least one is required.
    await user.click(await screen.findByText('Charismatic'));
    await next();

    // Steps 6–10 have valid defaults.
    for (let i = 0; i < 5; i++) {
      await screen.findByRole('button', { name: /Continue/i });
      await next();
    }

    await user.click(await screen.findByRole('button', { name: /Take Office/i }));

    expect(onBegin).toHaveBeenCalledTimes(1);
    const config = onBegin.mock.calls[0][0] as SetupConfig;
    expect(config.countryId).toBe('japan');
    expect(config.leaderName).toBe('Aiko Tanaka');
    expect(config.traits).toContain('charismatic');

    // The config must actually produce a playable game.
    const game = createGame(config, 1);
    expect(game.identity.name).toBe('Japan');
    expect(game.economy.gdp).toBeGreaterThan(0);
    expectNoReactErrors('setup wizard');
  });

  it('blocks progress until each required field is filled', async () => {
    const user = userEvent.setup();
    render(<SetupWizard onBegin={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Continue/i }));
    // No nation chosen yet, so Continue must be disabled.
    expect(await screen.findByPlaceholderText(/Search by country/i)).toBeTruthy();
    const cont = screen.getByRole('button', { name: /Continue/i });
    expect(cont.hasAttribute('disabled')).toBe(true);
    // Announced once to assistive tech; the narrow-screen repeat is aria-hidden.
    expect(screen.getByRole('status').textContent).toMatch(/Choose a nation to govern/i);
    expectNoReactErrors('wizard validation');
  });

  it('shows the flag designer for a custom nation', async () => {
    const user = userEvent.setup();
    render(<SetupWizard onBegin={vi.fn()} />);

    await user.click(screen.getByText('Found a New Nation'));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Anchored: "e.g. Aurelia" is also a substring of the adjective field's
    // placeholder, "e.g. Aurelian".
    await user.type(await screen.findByPlaceholderText(/^e\.g\. Aurelia$/i), 'Aurelia');
    await user.type(await screen.findByPlaceholderText(/^e\.g\. Solmara$/i), 'Solmara');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('Design your flag')).toBeTruthy();
    expect(screen.getByText('Nordic Cross')).toBeTruthy();
    expectNoReactErrors('flag designer');
  });
});

describe('pages', () => {
  it('renders the landing page', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Run a country/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start a new campaign/i })).toBeTruthy();
    expectNoReactErrors('landing page');
  });

  it('renders the auth page in offline mode without Firebase', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    );
    // No Firebase env in tests, so it must degrade rather than crash.
    expect(screen.getByText(/Accounts are not available here/i)).toBeTruthy();
    expectNoReactErrors('auth page');
  });

  it('renders the leaderboard page in offline mode', () => {
    render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Leaderboard unavailable/i)).toBeTruthy();
    expectNoReactErrors('leaderboard page');
  });

  it('renders the profile page with no campaigns', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Backbencher/i), 'starting rank').toBeTruthy();
    expect(screen.getByText(/No campaigns yet/i)).toBeTruthy();
    expectNoReactErrors('empty profile page');
  });

  it('renders the profile page with a career and moves between its tabs', async () => {
    const user = userEvent.setup();
    // Seed local storage with two finished campaigns so the career has content.
    const won = matureGame();
    won.gameOver = { reason: 'Objective met.', victory: true, turn: won.turn, title: 'Great Power' };
    saveGameLocally(won);

    const lost = createGame(setupFor('nigeria'), 555);
    lost.score = 4200;
    lost.gameOver = { reason: 'Sovereign default.', victory: false, turn: 90, title: 'Bankruptcy' };
    saveGameLocally(lost);

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    // Overview shows aggregated career statistics, not a single campaign.
    expect(screen.getByText(/Career records/i)).toBeTruthy();
    expect(screen.getByText(/Win rate/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Campaigns/i }));
    expect(await screen.findByText(/Germany/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Accolades/i }));
    expect(await screen.findByText(/Victory paths/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Settings/i }));
    expect(await screen.findByText(/Reduce motion/i)).toBeTruthy();

    expectNoReactErrors('profile page with career');
  });
});

describe('advisory board', () => {
  it('renders the cabinet’s advice and runs a one-click action', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('germany'), 8001);
    // Guarantee at least one actionable recommendation: no research running.
    game.research.current = null;
    game.economy.treasury = 1e9;
    useGameStore.setState({ game, playing: false });

    const advice = allRecommendations(game);
    const actionable = advice.find((r) => r.action);
    expect(actionable, 'the fixture should produce an actionable recommendation').toBeDefined();

    render(<AdvisoryBoard game={game} limit={5} />);
    expect(screen.getByText(actionable!.headline)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: actionable!.action!.label }));

    // The action ran against the store, not just the local component.
    const updated = useGameStore.getState().game!;
    expect(JSON.stringify(updated)).not.toBe(JSON.stringify(game));
    expectNoReactErrors('advisory board');
  });

  it('says so plainly when there is nothing to raise', () => {
    const game = createGame(setupFor('norway'), 8002);
    // A country with nothing wrong on any axis the board inspects.
    game.approval = 85;
    game.stability = 90;
    game.corruption = 5;
    game.economy.inflation = 2;
    game.economy.unemployment = 3;
    game.economy.growth = 3;
    game.economy.debt = 0;
    game.economy.treasury = 0;
    game.advisors = ['adv-finance', 'adv-growth', 'adv-defence', 'adv-foreign', 'adv-science'];
    game.research.current = 'modern-banking';
    game.orgs = ['un', 'wto', 'nato', 'g20'];
    game.energy.demand = 50;
    game.energy.production.hydro = 200;
    game.environment.emissions = 20;
    for (const n of game.nations) n.relations = 40;
    // Self-sufficient in every commodity, so nothing is short.
    for (const holding of Object.values(game.resources)) {
      holding.production = holding.consumption + 1;
    }
    // And a budget close enough to balance that neither the deficit nor the
    // surplus advice fires.
    const gdpMonthly = (game.economy.gdp * 1000) / 12;
    for (let i = 0; i < 40; i++) {
      const net = computeBudget(game).net / gdpMonthly;
      if (Math.abs(net) < 0.02) break;
      setTax(game, 'income', game.taxes.income + (net < 0 ? 1 : -1));
    }

    const remaining = allRecommendations(game);

    // Nothing is *wrong* — no emergency and no warning should survive.
    const pressing = remaining.filter((r) => r.severity !== 'opportunity');
    expect(pressing.map((r) => r.id), 'a well-run country should have nothing pressing').toEqual([]);

    // But the board is contractually never silent: with nothing to fix it must
    // still propose the best thing to do next, because there always is one.
    expect(remaining.length, 'the board must always offer a next step').toBeGreaterThan(0);
    expect(remaining.every((r) => r.severity === 'opportunity')).toBe(true);

    render(<AdvisoryBoard game={game} limit={3} />);
    expect(screen.getByText(remaining[0].headline)).toBeTruthy();
    expectNoReactErrors('quiet advisory board');
  });
});

describe('world map', () => {
  it('renders a marker for every placed nation and reports a click', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    const onSelect = vi.fn();

    const { container } = render(<WorldMap game={game} onSelect={onSelect} />);

    const placed = game.nations.filter((n) => COUNTRY_COORDS[n.id]);
    expect(placed.length, 'most nations should be placed').toBeGreaterThan(30);

    const markers = container.querySelectorAll('g[role="button"]');
    expect(markers.length).toBe(placed.length);

    await user.click(markers[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(placed.some((n) => n.id === onSelect.mock.calls[0][0])).toBe(true);

    expectNoReactErrors('world map');
  });

  it('keeps every marker inside the map bounds', () => {
    const game = matureGame();
    const { container } = render(<WorldMap game={game} onSelect={vi.fn()} />);

    const svg = container.querySelector('svg')!;
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);

    for (const marker of svg.querySelectorAll('g[role="button"] circle')) {
      const cx = Number(marker.getAttribute('cx'));
      const cy = Number(marker.getAttribute('cy'));
      expect(Number.isFinite(cx) && Number.isFinite(cy), 'marker coordinates must be finite').toBe(true);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(width);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(height);
    }
  });

  it('switches colouring mode', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    const onModeChange = vi.fn();

    render(<WorldMap game={game} onSelect={vi.fn()} mode="relations" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: /Military strength/i }));
    expect(onModeChange).toHaveBeenCalledWith('power');
    expectNoReactErrors('map mode switch');
  });

  it('renders for a custom nation with no real country behind it', () => {
    const custom = createGame(
      {
        ...defaultSetup(),
        mode: 'custom',
        countryId: null,
        nationName: 'Aurelia',
        capital: 'Solmara',
        leaderName: 'Vale Rhen',
        traits: ['visionary'],
        region: 'oceania',
      },
      8003,
    );
    const { container } = render(<WorldMap game={custom} onSelect={vi.fn()} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expectNoReactErrors('custom nation map');
  });
});

describe('trade panel', () => {
  it('opens a negotiation and signs an agreement', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('japan'), 8004);
    // Make every partner willing, so the acceptance roll cannot flake.
    for (const n of game.nations) {
      n.relations = 90;
      n.trust = 100;
    }
    useGameStore.setState({ game, playing: false });

    render(<TradePanel game={game} />);

    // Japan is short of oil, so the import button is the primary action.
    const importButtons = screen.getAllByRole('button', { name: /^Import$/i });
    expect(importButtons.length).toBeGreaterThan(0);
    await user.click(importButtons[0]);

    // The negotiation modal lists suppliers.
    expect(await screen.findByText(/Choose a supplier/i)).toBeTruthy();

    const propose = await screen.findByRole('button', { name: /Propose to/i });
    // Retry the acceptance roll a few times; refusal is a legitimate outcome.
    for (let i = 0; i < 15 && useGameStore.getState().game!.tradeAgreements.length === 0; i++) {
      await user.click(propose);
    }
    expect(
      useGameStore.getState().game!.tradeAgreements.length,
      'a maximally friendly partner should sign within fifteen attempts',
    ).toBeGreaterThan(0);

    expectNoReactErrors('trade negotiation');
  });

  it('shows live agreements and their price advantage', () => {
    const game = matureGame();
    const partner = game.nations.find((n) => (n.resources.oil ?? 0) > 60)!;
    game.tradeAgreements = [
      {
        id: 'ta1', countryId: partner.id, resource: 'oil', direction: 'import',
        quantity: 4, lockedPrice: 0.8, signedTurn: 10, termMonths: 120, suspended: false,
      },
      {
        id: 'ta2', countryId: game.nations[1].id, resource: 'grain', direction: 'export',
        quantity: 2, lockedPrice: 1.4, signedTurn: 20, termMonths: 60, suspended: true,
      },
    ];

    const { container } = render(<TradePanel game={game} />);
    // The balance tab shows the contracted flow on both commodities.
    expect(container.textContent).toMatch(/contracted/i);
    // One live agreement, one suspended, so the header counts must reflect it.
    expect(screen.getByText(/Suspended/)).toBeTruthy();
    expectNoReactErrors('trade agreements');
  });
});

/* ================================================================== */
/* Coalition, trade disputes, the inspector and delegated decisions     */
/* ================================================================== */

describe('coalition government', () => {
  it('offers a pact with each rival party and names their price', () => {
    const game = createGame(setupFor('germany'), 77);
    game.governance.capital = 300;
    useGameStore.setState({ game, playing: false });

    const { container } = render(<PoliticsPanel game={game} />);
    expect(container.textContent).toMatch(/floor of the house/i);
    // Every rival is on offer, with the concession stated in the same card.
    for (const party of game.parties.filter((p) => p.id !== `party-${game.leader.ideology}`)) {
      expect(screen.getAllByText(new RegExp(party.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length)
        .toBeGreaterThan(0);
    }
    expect(container.textContent).toMatch(/capital/i);
    expectNoReactErrors('coalition offers');
  });

  it('forms a coalition through the store and then shows it as government', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('germany'), 78);
    game.governance.capital = 400;
    useGameStore.setState({ game, playing: false });

    const { rerender } = render(<PoliticsPanel game={game} />);
    const offer = screen.getAllByRole('button', { name: /Bring .* into government/i })[0];
    await user.click(offer);

    const next = useGameStore.getState().game!;
    expect(next.governance.coalition.length).toBe(1);

    rerender(<PoliticsPanel game={next} />);
    expect(screen.getByText(/In government with you/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dismiss from government/i })).toBeTruthy();
    expectNoReactErrors('coalition formed');
  });

  it('tells a government with no legislature that there is nothing to bargain with', () => {
    const game = createGame(setupFor('saudi-arabia', { government: 'absolute-monarchy' }), 79);
    useGameStore.setState({ game, playing: false });
    const { container } = render(<PoliticsPanel game={game} />);
    expect(container.textContent).toMatch(/no legislature|does not answer to a chamber/i);
    expectNoReactErrors('coalition without a chamber');
  });
});

describe('trade disputes', () => {
  it('shows who is retaliating, why, and what it costs', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    game.taxes.tariff = 32;
    game.governance.capital = 200;
    const angry = game.nations[0];
    angry.tradeGrievance = 78;
    angry.tariffOnPlayer = 18;
    useGameStore.setState({ game, playing: false });

    render(<TradePanel game={game} />);
    // The headline warning names the scale of it.
    expect(screen.getByText(/Trade war/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Disputes/i }));
    expect(screen.getAllByText(/Export competitiveness/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(angry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length)
      .toBeGreaterThan(0);
    // And offers the way out, for every partner it can be offered to.
    expect(screen.getAllByRole('button', { name: /Settle for \d+ capital/i }).length).toBeGreaterThan(0);
    expectNoReactErrors('trade disputes');
  });

  it('says plainly when there is no dispute at all', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    for (const n of game.nations) {
      n.tradeGrievance = 0;
      n.tariffOnPlayer = 0;
    }
    useGameStore.setState({ game, playing: false });

    render(<TradePanel game={game} />);
    await user.click(screen.getByRole('button', { name: /Disputes/i }));
    expect(screen.getByText(/No trade disputes/i)).toBeTruthy();
    expectNoReactErrors('no trade disputes');
  });
});

describe('the "why is this number" inspector', () => {
  it('opens the engine\'s own arithmetic for an index and itemises it', async () => {
    const user = userEvent.setup();
    const game = matureGame();
    useGameStore.setState({ game, playing: false });

    render(<EconomyPanel game={game} />);
    await user.click(screen.getByRole('button', { name: /Why is inflation this number/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Terms — these add up/i)).toBeTruthy();
    expect(within(dialog).getByText(/^Total$/)).toBeTruthy();
    // The three headline pieces: where it is, where it is going, and the rate.
    expect(within(dialog).getByText(/^Now$/)).toBeTruthy();
    expect(within(dialog).getByText(/Heading for/i)).toBeTruthy();
    expectNoReactErrors('inspector');
  });

  it('is removed entirely when the player turns it off', () => {
    const game = matureGame();
    useGameStore.setState({ game, playing: false });
    useUiStore.getState().setPref('showInspector', false);

    render(<EconomyPanel game={game} />);
    expect(screen.queryByRole('button', { name: /Why is .* this number/i })).toBeNull();

    useUiStore.getState().setPref('showInspector', true);
    expectNoReactErrors('inspector disabled');
  });
});

describe('decision presentation', () => {
  function queuedGame(): GameState {
    const game = createGame(setupFor('germany'), 1234);
    const def = Object.values(EVENT_INDEX).find((d) => d.severity === 'major')!;
    game.eventQueue = [{ defId: def.id, turn: game.turn }];
    return game;
  }

  it('marks the cabinet\'s own pick in the dialogue and can take it in one click', async () => {
    const user = userEvent.setup();
    const game = queuedGame();
    useGameStore.setState({ game, playing: false });

    render(<EventModal game={game} />);
    expect(screen.getAllByText(/Cabinet's pick/i).length).toBe(1);

    await user.click(screen.getByRole('button', { name: /Let the cabinet decide/i }));
    expect(useGameStore.getState().game!.eventQueue).toHaveLength(0);
    expectNoReactErrors('cabinet pick');
  });

  it('docks the decision into a banner instead of a dialogue when asked to', () => {
    const game = queuedGame();
    useGameStore.setState({ game, playing: false });
    useUiStore.getState().setPref('eventMode', 'inline');

    const { container } = render(
      <MemoryRouter>
        <GameShell game={game}>
          <div>panel</div>
        </GameShell>
      </MemoryRouter>,
    );

    // The top bar and the banner both flag it, which is the point.
    expect(screen.getAllByText(/Decision required/i).length).toBeGreaterThan(0);
    // Nothing is covering the screen: the panel underneath is still there.
    expect(container.textContent).toContain('panel');
    expect(screen.queryByRole('dialog')).toBeNull();

    useUiStore.getState().setPref('eventMode', 'modal');
    expectNoReactErrors('inline decision');
  });

  it('settles a routine decision without ever showing it, and says so', () => {
    const game = createGame(setupFor('germany'), 4242);
    const minor = Object.values(EVENT_INDEX).find((d) => d.severity === 'minor')!;
    game.eventQueue = [{ defId: minor.id, turn: game.turn }];
    useGameStore.setState({ game, playing: false });
    useUiStore.getState().setPref('eventMode', 'delegate-all');

    act(() => {
      useGameStore.getState().advance(1);
    });

    const next = useGameStore.getState().game!;
    expect(next.eventQueue).toHaveLength(0);
    expect(next.turn).toBeGreaterThan(game.turn);
    // Delegation is never silent.
    const toasts = useUiStore.getState().toasts;
    expect(toasts.some((t) => /cabinet decided/i.test(t.title))).toBe(true);
    expect(next.log.some((entry) => entry.text.includes(minor.title))).toBe(true);

    useUiStore.getState().setPref('eventMode', 'modal');
  });
});

describe('executive actions panel', () => {
  it('enacts a decree through the store and puts it on cooldown', async () => {
    const user = userEvent.setup();
    const game = createGame(setupFor('germany'), 4321);
    game.economy.treasury = 1e9;
    useGameStore.setState({ game, playing: false });

    const { rerender } = render(<DecreesPanel game={game} />);

    // "Address the Nation" is cheap and available from turn one.
    expect(screen.getByText('Address the Nation')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: /^Enact$/i });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]);

    const updated = useGameStore.getState().game!;
    expect(Object.keys(updated.decreeCooldowns).length, 'a decree was recorded').toBeGreaterThan(0);

    rerender(<DecreesPanel game={updated} />);
    expect(screen.getAllByText(/mo$/).length, 'a cooldown badge appears').toBeGreaterThan(0);

    expectNoReactErrors('decrees panel');
  });
});
