import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import styles from './FlyingStars.module.css';

interface StarParticle {
  id: number;
  delay: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  curve: number; // How much the star curves during flight
}

interface ImpactParticle {
  id: number;
  angle: number;
  distance: number;
  size: number;
}

export function FlyingStars() {
  const { pendingStarAnimation, clearStarAnimation } = useAuthStore();
  const [particles, setParticles] = useState<StarParticle[]>([]);
  const [impactParticles, setImpactParticles] = useState<ImpactParticle[]>([]);
  const [targetPosition, setTargetPosition] = useState<{ x: number; y: number } | null>(null);
  const [startPosition, setStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [showImpact, setShowImpact] = useState(false);
  const [headerBounce, setHeaderBounce] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const impactCountRef = useRef(0);

  // Get positions and scroll to board when animation starts
  useEffect(() => {
    if (pendingStarAnimation) {
      // Scroll to top so user can see the animation
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Get target position (star counter in header)
      const starCounter = document.getElementById('header-star-counter');
      if (starCounter) {
        const rect = starCounter.getBoundingClientRect();
        setTargetPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }

      // Get start position (center of game board)
      const boardContainer = document.getElementById('board-scroll-container');
      if (boardContainer) {
        const rect = boardContainer.getBoundingClientRect();
        setStartPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      } else {
        // Fallback to center of viewport
        setStartPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.5,
        });
      }
    }
  }, [pendingStarAnimation]);

  // Handle star impact on header
  const handleStarImpact = useCallback(() => {
    impactCountRef.current += 1;

    // Trigger header bounce
    setHeaderBounce(true);
    setTimeout(() => setHeaderBounce(false), 200);

    // Only create impact particles for first few impacts
    if (impactCountRef.current <= 3) {
      const newImpactParticles: ImpactParticle[] = [];
      for (let i = 0; i < 8; i++) {
        newImpactParticles.push({
          id: Date.now() + i,
          angle: (i * 45) + (Math.random() - 0.5) * 20,
          distance: 30 + Math.random() * 40,
          size: 6 + Math.random() * 8,
        });
      }
      setImpactParticles(prev => [...prev, ...newImpactParticles]);

      // Clear impact particles after animation
      setTimeout(() => {
        setImpactParticles(prev => prev.filter(p => !newImpactParticles.some(np => np.id === p.id)));
      }, 600);
    }

    // Show impact flash
    setShowImpact(true);
    setTimeout(() => setShowImpact(false), 150);
  }, []);

  // Generate particles when animation is triggered
  useEffect(() => {
    if (pendingStarAnimation && targetPosition && startPosition) {
      // More particles - at least as many as stars earned, up to 20
      const starCount = Math.min(Math.max(pendingStarAnimation, 8), 20);
      const newParticles: StarParticle[] = [];

      for (let i = 0; i < starCount; i++) {
        newParticles.push({
          id: i,
          delay: i * 0.12, // Stagger
          offsetX: (Math.random() - 0.5) * 120,
          offsetY: (Math.random() - 0.5) * 80,
          rotation: Math.random() * 360,
          curve: (Math.random() - 0.5) * 150, // Horizontal curve during flight
        });
      }

      setParticles(newParticles);
      impactCountRef.current = 0;

      // Clear animation after all particles have animated
      const totalDuration = (starCount * 0.12) + 2500; // stagger + animation duration + buffer
      const timer = setTimeout(() => {
        setParticles([]);
        setImpactParticles([]);
        clearStarAnimation();
      }, totalDuration);

      return () => clearTimeout(timer);
    }
  }, [pendingStarAnimation, targetPosition, startPosition, clearStarAnimation]);

  // Apply bounce effect to header star counter
  useEffect(() => {
    const starCounter = document.getElementById('header-star-counter');
    if (starCounter) {
      if (headerBounce) {
        starCounter.style.transform = 'scale(1.4)';
        starCounter.style.transition = 'transform 0.15s ease-out';
      } else {
        starCounter.style.transform = 'scale(1)';
        starCounter.style.transition = 'transform 0.2s ease-in';
      }
    }
  }, [headerBounce]);

  if (!pendingStarAnimation || !targetPosition || !startPosition) return null;

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Flying stars */}
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className={styles.star}
            initial={{
              x: startPosition.x + particle.offsetX,
              y: startPosition.y + particle.offsetY,
              scale: 2.5, // Start BIG
              opacity: 0,
              rotate: particle.rotation,
            }}
            animate={{
              x: [
                startPosition.x + particle.offsetX,
                startPosition.x + particle.offsetX + particle.curve,
                targetPosition.x,
              ],
              y: [
                startPosition.y + particle.offsetY,
                startPosition.y + particle.offsetY - 100, // Arc upward first
                targetPosition.y,
              ],
              scale: [2.5, 2.0, 0.5], // Shrink as they fly
              opacity: [0, 1, 1, 0.8],
              rotate: [particle.rotation, particle.rotation + 180, particle.rotation + 360],
            }}
            transition={{
              duration: 1.8,
              delay: particle.delay,
              ease: [0.2, 0.6, 0.3, 1],
              times: [0, 0.4, 1],
            }}
            onAnimationComplete={() => handleStarImpact()}
          >
            <Star size={48} fill="#F59E0B" color="#F59E0B" strokeWidth={1} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Impact flash on header */}
      {showImpact && targetPosition && (
        <motion.div
          className={styles.impactFlash}
          style={{
            left: targetPosition.x,
            top: targetPosition.y,
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Impact particles bursting from header */}
      <AnimatePresence>
        {impactParticles.map((particle) => {
          const rad = (particle.angle * Math.PI) / 180;
          return (
            <motion.div
              key={particle.id}
              className={styles.impactParticle}
              initial={{
                x: targetPosition.x,
                y: targetPosition.y,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: targetPosition.x + Math.cos(rad) * particle.distance,
                y: targetPosition.y + Math.sin(rad) * particle.distance,
                scale: 0,
                opacity: 0,
              }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
              }}
              style={{
                width: particle.size,
                height: particle.size,
              }}
            />
          );
        })}
      </AnimatePresence>

      {/* Star count badge that appears at the start */}
      {pendingStarAnimation > 0 && (
        <motion.div
          className={styles.countBadge}
          initial={{
            x: startPosition.x,
            y: startPosition.y - 60,
            scale: 0,
            opacity: 0,
          }}
          animate={{
            scale: [0, 1.6, 1.4],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 2.2,
            times: [0, 0.15, 0.5, 1],
          }}
        >
          +{pendingStarAnimation}
        </motion.div>
      )}
    </div>
  );
}
