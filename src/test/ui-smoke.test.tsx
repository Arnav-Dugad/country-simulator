// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
import { ConstructionPanel, ResearchPanel } from '../components/panels/ProgressPanels';
import { EnvironmentPanel, SocietyPanel } from '../components/panels/SocietyPanels';
import { DiplomacyPanel, IntelligencePanel, MilitaryPanel } from '../components/panels/PowerPanels';
import { AchievementsPanel, HistoryPanel, ObjectivesPanel } from '../components/panels/MetaPanels';

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
    const research = within(nav as HTMLElement).getByRole('button', { name: /Research/i });
    await user.click(research);
    expect(useUiStore.getState().panel).toBe('research');

    expectNoReactErrors('game shell');
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
});
