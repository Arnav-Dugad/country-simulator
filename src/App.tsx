import { useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useUiStore } from './store/uiStore';
import { Backdrop } from './components/ui/Backdrop';
import { Toasts } from './components/ui/Toasts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { SetupPage } from './pages/SetupPage';
import { GamePage } from './pages/GamePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  const init = useAuthStore((s) => s.init);
  const reduceMotion = useUiStore((s) => s.prefs.reduceMotion);

  // Subscribe to Firebase auth once for the lifetime of the app.
  useEffect(() => init(), [init]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  return (
    <ErrorBoundary>
      <Router>
        <Backdrop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/new" element={<SetupPage />} />
          <Route path="/play" element={<GamePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toasts />
      </Router>
    </ErrorBoundary>
  );
}
