import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import {
  isPushSupported,
  isSubscribed,
  subscribeToPush,
  getNotificationPermission,
} from '../../lib/pushNotifications';
import styles from './NotificationPrompt.module.css';

const DISMISSED_KEY = 'robozzle-notification-prompt-dismissed';
const MIN_STREAK_FOR_PROMPT = 3;

export function NotificationPrompt() {
  const { user, isAuthenticated } = useAuthStore();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  // Check if we should show the prompt
  useEffect(() => {
    async function checkConditions() {
      // Must be authenticated
      if (!isAuthenticated || !user) {
        setShowPrompt(false);
        return;
      }

      // Must have at least 3-day streak
      if (user.currentStreak < MIN_STREAK_FOR_PROMPT) {
        setShowPrompt(false);
        return;
      }

      // Must support push notifications
      if (!isPushSupported()) {
        setShowPrompt(false);
        return;
      }

      // Check if already dismissed
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed === 'true') {
        setShowPrompt(false);
        return;
      }

      // Check if permission already denied
      if (getNotificationPermission() === 'denied') {
        setShowPrompt(false);
        return;
      }

      // Check if already subscribed
      const alreadySubscribed = await isSubscribed();
      setSubscriptionChecked(true);
      if (alreadySubscribed) {
        setShowPrompt(false);
        return;
      }

      // All conditions met - show prompt
      setShowPrompt(true);
    }

    checkConditions();
  }, [isAuthenticated, user]);

  const handleEnable = async () => {
    if (!user) return;

    setIsLoading(true);
    const success = await subscribeToPush(user.id);
    setIsLoading(false);

    if (success) {
      setShowPrompt(false);
    } else {
      // If permission was denied, don't show again
      if (getNotificationPermission() === 'denied') {
        localStorage.setItem(DISMISSED_KEY, 'true');
        setShowPrompt(false);
      }
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShowPrompt(false);
  };

  // Don't render anything until we've checked subscription status
  if (!subscriptionChecked) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className={styles.prompt}>
            <button
              className={styles.closeButton}
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>

            <div className={styles.icon}>
              <Bell size={24} />
            </div>

            <h3 className={styles.title}>Protect Your Streak!</h3>
            <p className={styles.description}>
              You have a {user?.currentStreak}-day streak! Enable notifications to get
              a reminder at 7pm if you haven't completed today's puzzle yet.
            </p>

            <div className={styles.buttons}>
              <button
                className={styles.enableButton}
                onClick={handleEnable}
                disabled={isLoading}
              >
                {isLoading ? 'Enabling...' : 'Enable Reminders'}
              </button>
              <button className={styles.laterButton} onClick={handleDismiss}>
                Not Now
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
