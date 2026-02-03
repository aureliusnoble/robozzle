import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/ui';
import { Home, Daily, DailyEasy, DailyChallenge, DailyArchive, Tutorial, Classic, Leaderboard, Auth, DevMode } from './pages';
import { UsernamePrompt } from './components/auth';
import { useAuthStore } from './stores/authStore';
import { usePuzzleStore } from './stores/puzzleStore';

function App() {
  const { fetchProfile, fetchProgress } = useAuthStore();
  const { prefetchDailyChallenges } = usePuzzleStore();

  // Initialize auth state and prefetch daily puzzles on mount
  useEffect(() => {
    fetchProfile();
    fetchProgress();
    // Prefetch daily challenges (uses cache if valid, fetches if stale)
    prefetchDailyChallenges();
  }, [fetchProfile, fetchProgress, prefetchDailyChallenges]);

  return (
    <BrowserRouter basename="/robozzle">
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/daily" element={<Daily />} />
          <Route path="/daily/easy" element={<DailyEasy />} />
          <Route path="/daily/challenge" element={<DailyChallenge />} />
          <Route path="/daily/archive" element={<DailyArchive />} />
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="/classic" element={<Classic />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dev" element={<DevMode />} />
        </Routes>
      </Layout>
      {/* Username prompt for Google OAuth users who need to set a username */}
      <UsernamePrompt />
    </BrowserRouter>
  );
}

export default App;
