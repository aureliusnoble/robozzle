import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import styles from './StreakAnimation.module.css';

interface FireParticle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  duration: number;
  delay: number;
}

// Animation timing constants
const GLOW_DURATION = 400; // Glow pulse duration
const PARTICLE_START = 100; // When particles start
const COUNTER_BOUNCE_START = 600; // When counter bounces
const TOTAL_DURATION = 1800; // Total animation duration

export function StreakAnimation() {
  const { pendingStreakAnimation, clearStreakAnimation } = useAuthStore();
  const [particles, setParticles] = useState<FireParticle[]>([]);
  const [targetPosition, setTargetPosition] = useState<{ x: number; y: number } | null>(null);
  const [showGlow, setShowGlow] = useState(false);
  const [counterBounce, setCounterBounce] = useState(false);

  // Get target position when animation starts
  useEffect(() => {
    if (pendingStreakAnimation) {
      // Scroll to top so user can see the animation
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Get target position (streak counter in header)
      const streakCounter = document.getElementById('header-streak-counter');
      if (streakCounter) {
        const rect = streakCounter.getBoundingClientRect();
        setTargetPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }
  }, [pendingStreakAnimation]);

  // Handle counter bounce effect
  const triggerCounterBounce = useCallback(() => {
    setCounterBounce(true);
    setTimeout(() => setCounterBounce(false), 200);
  }, []);

  // Apply bounce effect to header streak counter
  useEffect(() => {
    const streakCounter = document.getElementById('header-streak-counter');
    if (streakCounter) {
      if (counterBounce) {
        streakCounter.style.transform = 'scale(1.4)';
        streakCounter.style.transition = 'transform 0.15s ease-out';
      } else {
        streakCounter.style.transform = 'scale(1)';
        streakCounter.style.transition = 'transform 0.2s ease-in';
      }
    }
  }, [counterBounce]);

  // Generate particles and run animation sequence when triggered
  useEffect(() => {
    if (pendingStreakAnimation && targetPosition) {
      // Generate fire particles (10-14)
      const particleCount = 10 + Math.floor(Math.random() * 5);
      const newParticles: FireParticle[] = [];

      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: i,
          // Spread upward with some randomness (-60 to 60 degrees from vertical)
          angle: -90 + (Math.random() - 0.5) * 120,
          distance: 40 + Math.random() * 60,
          size: 6 + Math.random() * 8,
          duration: 0.8 + Math.random() * 0.4,
          delay: (PARTICLE_START / 1000) + (Math.random() * 0.2),
        });
      }

      setParticles(newParticles);

      // Start glow immediately
      setShowGlow(true);
      setTimeout(() => setShowGlow(false), GLOW_DURATION);

      // Trigger counter bounce
      setTimeout(triggerCounterBounce, COUNTER_BOUNCE_START);

      // Clean up animation after total duration
      const timer = setTimeout(() => {
        setParticles([]);
        clearStreakAnimation();
      }, TOTAL_DURATION);

      return () => clearTimeout(timer);
    }
  }, [pendingStreakAnimation, targetPosition, clearStreakAnimation, triggerCounterBounce]);

  if (!pendingStreakAnimation || !targetPosition) return null;

  return (
    <div className={styles.container}>
      {/* Glow pulse */}
      <AnimatePresence>
        {showGlow && (
          <motion.div
            className={styles.glow}
            style={{
              left: targetPosition.x,
              top: targetPosition.y,
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 2.5, opacity: [0, 0.8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: GLOW_DURATION / 1000, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Fire particles */}
      <AnimatePresence>
        {particles.map((particle) => {
          const rad = (particle.angle * Math.PI) / 180;
          const endX = targetPosition.x + Math.cos(rad) * particle.distance;
          const endY = targetPosition.y + Math.sin(rad) * particle.distance;

          return (
            <motion.div
              key={particle.id}
              className={styles.fireParticle}
              style={{
                width: particle.size,
                height: particle.size,
              }}
              initial={{
                x: targetPosition.x,
                y: targetPosition.y,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: endX,
                y: endY,
                scale: [1, 1.2, 0],
                opacity: [1, 0.9, 0],
              }}
              transition={{
                duration: particle.duration,
                delay: particle.delay,
                ease: 'easeOut',
              }}
            />
          );
        })}
      </AnimatePresence>

      {/* Center flash */}
      <AnimatePresence>
        {showGlow && (
          <motion.div
            className={styles.flash}
            style={{
              left: targetPosition.x,
              top: targetPosition.y,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Export timing for use in daily pages
export const getStreakAnimationDuration = (): number => {
  return TOTAL_DURATION;
};
