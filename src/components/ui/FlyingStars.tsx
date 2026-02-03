import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import styles from './FlyingStars.module.css';

interface StarParticle {
  id: number;
  delay: number;
  offsetX: number;
  offsetY: number;
}

export function FlyingStars() {
  const { pendingStarAnimation, clearStarAnimation } = useAuthStore();
  const [particles, setParticles] = useState<StarParticle[]>([]);
  const [targetPosition, setTargetPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get target position (star counter in header)
  useEffect(() => {
    if (pendingStarAnimation) {
      const starCounter = document.getElementById('header-star-counter');
      if (starCounter) {
        const rect = starCounter.getBoundingClientRect();
        setTargetPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }
  }, [pendingStarAnimation]);

  // Generate particles when animation is triggered
  useEffect(() => {
    if (pendingStarAnimation && targetPosition) {
      const starCount = Math.min(pendingStarAnimation, 10); // Cap at 10 particles
      const newParticles: StarParticle[] = [];

      for (let i = 0; i < starCount; i++) {
        newParticles.push({
          id: i,
          delay: i * 0.15, // Slower stagger
          offsetX: (Math.random() - 0.5) * 80,
          offsetY: (Math.random() - 0.5) * 50,
        });
      }

      setParticles(newParticles);

      // Clear animation after all particles have animated
      const totalDuration = (starCount * 0.15) + 1500; // stagger + animation duration
      const timer = setTimeout(() => {
        setParticles([]);
        clearStarAnimation();
      }, totalDuration);

      return () => clearTimeout(timer);
    }
  }, [pendingStarAnimation, targetPosition, clearStarAnimation]);

  if (!pendingStarAnimation || !targetPosition) return null;

  // Start position: center-bottom of viewport
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight * 0.6;

  return (
    <div ref={containerRef} className={styles.container}>
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className={styles.star}
            initial={{
              x: startX + particle.offsetX,
              y: startY + particle.offsetY,
              scale: 0,
              opacity: 0,
            }}
            animate={{
              x: targetPosition.x,
              y: targetPosition.y,
              scale: [0, 1.8, 1.2, 0.6],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.2,
              delay: particle.delay,
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            <Star size={28} fill="#F59E0B" color="#F59E0B" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Star count badge that appears at the start */}
      {pendingStarAnimation > 0 && (
        <motion.div
          className={styles.countBadge}
          initial={{
            x: startX,
            y: startY - 40,
            scale: 0,
            opacity: 0,
          }}
          animate={{
            scale: [0, 1.4, 1.2],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.8,
            times: [0, 0.2, 0.6, 1],
          }}
        >
          +{pendingStarAnimation}
        </motion.div>
      )}
    </div>
  );
}
