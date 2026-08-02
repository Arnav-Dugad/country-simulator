import { useNavigate } from 'react-router-dom';
import type { SetupConfig } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { SetupWizard } from '../components/setup/SetupWizard';

export function SetupPage() {
  const navigate = useNavigate();
  const start = useGameStore((s) => s.start);
  const setPanel = useUiStore((s) => s.setPanel);

  const begin = (config: SetupConfig) => {
    start(config);
    setPanel('dashboard');
    navigate('/play', { replace: true });
  };

  return <SetupWizard onBegin={begin} onCancel={() => navigate('/')} />;
}
