import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import styles from './AuthForms.module.css';
import modalStyles from './AuthModal.module.css';

export function UsernamePrompt() {
  const { needsUsername, setUsername, signOut } = useAuthStore();
  const [username, setUsernameValue] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (username.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }

    setIsLoading(true);
    const result = await setUsername(username);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    // Sign out if they don't want to create a username
    await signOut();
  };

  return (
    <AnimatePresence>
      {needsUsername && (
        <>
          <motion.div
            className={modalStyles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // No onClick - modal cannot be dismissed by clicking outside
          />
          <motion.div
            className={modalStyles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
          >
            <div className={styles.container}>
              <h2 className={styles.title}>Choose Your Username</h2>
              <p className={styles.subtitle}>
                Pick a unique username for your RoboZZle profile
              </p>

              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.field}>
                  <label htmlFor="username" className={styles.label}>
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    className={styles.input}
                    placeholder="robofan42"
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[a-zA-Z0-9_]+"
                    autoFocus
                  />
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Continue'}
                </button>

                <button
                  type="button"
                  className={styles.switchButton}
                  onClick={handleCancel}
                  style={{ marginTop: '1rem', display: 'block', width: '100%', textAlign: 'center' }}
                >
                  Cancel and sign out
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
