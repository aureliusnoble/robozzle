import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import styles from './AuthForms.module.css';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSwitchToForgotPassword: () => void;
  onSuccess?: () => void;
}

export function LoginForm({ onSwitchToSignup, onSwitchToForgotPassword, onSuccess }: LoginFormProps) {
  const { signIn, signInWithGoogle } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      onSuccess?.();
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className={styles.title}>Welcome Back</h2>
      <p className={styles.subtitle}>Sign in to track your progress</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            className={styles.forgotButton}
            onClick={onSwitchToForgotPassword}
          >
            Forgot password?
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <button
        type="button"
        className={styles.googleButton}
        onClick={handleGoogleSignIn}
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <p className={styles.switchText}>
        Don't have an account?{' '}
        <button className={styles.switchButton} onClick={onSwitchToSignup}>
          Sign up
        </button>
      </p>
    </motion.div>
  );
}
