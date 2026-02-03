import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import styles from './AuthForms.module.css';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const { resetPassword } = useAuthStore();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await resetPassword(email);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setSent(true);
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        className={styles.container}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✉️</span>
          <h2 className={styles.title}>Check your email</h2>
          <p className={styles.subtitle}>
            We've sent a password reset link to {email}
          </p>
        </div>
        <button className={styles.cancelButton} onClick={onBackToLogin}>
          Back to Sign In
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className={styles.title}>Reset Password</h2>
      <p className={styles.subtitle}>Enter your email to receive a reset link</p>

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

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <button className={styles.cancelButton} onClick={onBackToLogin}>
        Back to Sign In
      </button>
    </motion.div>
  );
}
