import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import type { GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { GameShell } from '../components/layout/GameShell';
import { EventModal } from '../components/game/EventModal';
import { GameOverModal } from '../components/game/GameOverModal';
import { Dashboard } from '../components/panels/Dashboard';
import { BudgetPanel, EconomyPanel } from '../components/panels/EconomyPanels';
import { CabinetPanel, PoliciesPanel, PoliticsPanel, ProvincesPanel } from '../components/panels/GovernancePanels';
import { DecreesPanel } from '../components/panels/DecreesPanel';
import { TradePanel } from '../components/panels/TradePanel';
import { ConstructionPanel, ResearchPanel } from '../components/panels/ProgressPanels';
import { EnvironmentPanel, SocietyPanel } from '../components/panels/SocietyPanels';
import { DiplomacyPanel, IntelligencePanel, MilitaryPanel } from '../components/panels/PowerPanels';
import { AchievementsPanel, HistoryPanel, ObjectivesPanel } from '../components/panels/MetaPanels';

/** Autosaves to the cloud roughly once a game-year while signed in. */
const CLOUD_SYNC_INTERVAL_TURNS = 12;

export function GamePage() {
  const game = useGameStore((s) => s.game);
  const panel = useUiStore((s) => s.panel);

  if (!game) return <Navigate to="/" replace />;

  return (
    <>
      <GameShell game={game}>
        <PanelHost game={game} panel={panel} />
      </GameShell>

      <CloudAutosave game={game} />
      {game.eventQueue.length > 0 && !game.gameOver && <EventModal game={game} />}
      {game.gameOver && <GameOverModal game={game} />}
    </>
  );
}

function PanelHost({ game, panel }: { game: GameState; panel: ReturnType<typeof useUiStore.getState>['panel'] }) {
  switch (panel) {
    case 'dashboard': return <Dashboard game={game} />;
    case 'objectives': return <ObjectivesPanel game={game} />;
    case 'economy': return <EconomyPanel game={game} />;
    case 'budget': return <BudgetPanel game={game} />;
    case 'policies': return <PoliciesPanel game={game} />;
    case 'decrees': return <DecreesPanel game={game} />;
    case 'politics': return <PoliticsPanel game={game} />;
    case 'cabinet': return <CabinetPanel game={game} />;
    case 'provinces': return <ProvincesPanel game={game} />;
    case 'research': return <ResearchPanel game={game} />;
    case 'construction': return <ConstructionPanel game={game} />;
    case 'society': return <SocietyPanel game={game} />;
    case 'environment': return <EnvironmentPanel game={game} />;
    case 'military': return <MilitaryPanel game={game} />;
    case 'diplomacy': return <DiplomacyPanel game={game} />;
    case 'trade': return <TradePanel game={game} />;
    case 'intelligence': return <IntelligencePanel game={game} />;
    case 'achievements': return <AchievementsPanel game={game} />;
    case 'history': return <HistoryPanel game={game} />;
    default: return <Dashboard game={game} />;
  }
}

/**
 * Pushes a cloud save every game-year and when a campaign ends. Local
 * autosaving happens on every commit inside the store; this is the
 * cross-device layer on top of it.
 */
function CloudAutosave({ game }: { game: GameState }) {
  const user = useAuthStore((s) => s.user);
  const autosaveToCloud = useUiStore((s) => s.prefs.autosaveToCloud);
  const { saveToCloud, lastSyncedTurn } = useGameStore();

  useEffect(() => {
    if (!user || !autosaveToCloud) return;
    const dueForInterval = game.turn > 0 && game.turn % CLOUD_SYNC_INTERVAL_TURNS === 0;
    const dueForEnding = game.gameOver !== null;
    if ((dueForInterval || dueForEnding) && game.turn !== lastSyncedTurn) {
      void saveToCloud(user.uid);
    }
  }, [game.turn, game.gameOver, user, autosaveToCloud, lastSyncedTurn, saveToCloud]);

  return null;
}
