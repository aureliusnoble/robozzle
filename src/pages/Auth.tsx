import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm, SignupForm } from '../components/auth';
import { useAuthStore } from '../stores/authStore';
import styles from './Auth.module.css';

export function Auth() {
  const [view, setView] = useState<'login' | 'signup'>('login');
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSuccess = () => {
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {view === 'login' ? (
          <LoginForm
            onSwitchToSignup={() => setView('signup')}
            onSuccess={handleSuccess}
          />
        ) : (
          <SignupForm
            onSwitchToLogin={() => setView('login')}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </div>
  );
}
