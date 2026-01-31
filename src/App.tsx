import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/ui';
import { Home, DailyChallenge, Tutorial, Classic, Leaderboard, Auth, DevMode } from './pages';
import { UsernamePrompt } from './components/auth';
import { useAuthStore } from './stores/authStore';

function App() {
  const { fetchProfile, fetchProgress } = useAuthStore();

  // Initialize auth state on mount
  useEffect(() => {
    fetchProfile();
    fetchProgress();
  }, [fetchProfile, fetchProgress]);

  return (
    <BrowserRouter basename="/robozzle">
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/daily" element={<DailyChallenge />} />
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
