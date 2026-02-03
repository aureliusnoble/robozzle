import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultView?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, defaultView = 'login' }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>(defaultView);

  const handleSuccess = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className={styles.closeButton} onClick={onClose}>
              ✕
            </button>

            {view === 'login' && (
              <LoginForm
                onSwitchToSignup={() => setView('signup')}
                onSwitchToForgotPassword={() => setView('forgot')}
                onSuccess={handleSuccess}
              />
            )}
            {view === 'signup' && (
              <SignupForm
                onSwitchToLogin={() => setView('login')}
                onSuccess={handleSuccess}
              />
            )}
            {view === 'forgot' && (
              <ForgotPasswordForm
                onBackToLogin={() => setView('login')}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
