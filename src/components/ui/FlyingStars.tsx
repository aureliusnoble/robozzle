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
  curve: number;
}

interface SparkleParticle {
  id: string;
  starId: number;
  offsetAngle: number;
  offsetDistance: number;
  size: number;
  delay: number;
}

interface ImpactParticle {
  id: number;
  angle: number;
  distance: number;
  size: number;
}

// Animation timing constants
const INITIAL_DELAY = 0.8; // Wait before animation starts (let user see the board)
const FLIGHT_DURATION = 2.5; // How long each star takes to fly
const STAGGER_DELAY = FLIGHT_DURATION * 0.5; // Each star appears when previous is 50% through flight

export function FlyingStars() {
  const { pendingStarAnimation, clearStarAnimation, incrementAnimatedStars } = useAuthStore();
  const [particles, setParticles] = useState<StarParticle[]>([]);
  const [sparkles, setSparkles] = useState<SparkleParticle[]>([]);
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
      const starIcon = document.getElementById('header-star-icon');
      if (starIcon) {
        const rect = starIcon.getBoundingClientRect();
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

    // Increment the displayed star counter
    incrementAnimatedStars();

    // Trigger header bounce
    setHeaderBounce(true);
    setTimeout(() => setHeaderBounce(false), 200);

    // Create impact particles for each star
    const newImpactParticles: ImpactParticle[] = [];
    for (let i = 0; i < 6; i++) {
      newImpactParticles.push({
        id: Date.now() + i + Math.random() * 1000,
        angle: (i * 60) + (Math.random() - 0.5) * 30,
        distance: 25 + Math.random() * 35,
        size: 5 + Math.random() * 6,
      });
    }
    setImpactParticles(prev => [...prev, ...newImpactParticles]);

    // Clear impact particles after animation
    setTimeout(() => {
      setImpactParticles(prev => prev.filter(p => !newImpactParticles.some(np => np.id === p.id)));
    }, 600);

    // Show impact flash
    setShowImpact(true);
    setTimeout(() => setShowImpact(false), 150);
  }, [incrementAnimatedStars]);

  // Generate particles when animation is triggered
  useEffect(() => {
    if (pendingStarAnimation && targetPosition && startPosition) {
      // Use EXACT star count - no minimum or maximum
      const starCount = pendingStarAnimation;
      const newParticles: StarParticle[] = [];
      const newSparkles: SparkleParticle[] = [];

      for (let i = 0; i < starCount; i++) {
        const starDelay = INITIAL_DELAY + (i * STAGGER_DELAY);

        newParticles.push({
          id: i,
          delay: starDelay,
          offsetX: (Math.random() - 0.5) * 100,
          offsetY: (Math.random() - 0.5) * 60,
          rotation: Math.random() * 360,
          curve: (Math.random() - 0.5) * 120,
        });

        // Add sparkle particles around each star (4-6 sparkles per star)
        const sparkleCount = 4 + Math.floor(Math.random() * 3);
        for (let j = 0; j < sparkleCount; j++) {
          newSparkles.push({
            id: `${i}-${j}`,
            starId: i,
            offsetAngle: (j * (360 / sparkleCount)) + (Math.random() - 0.5) * 30,
            offsetDistance: 20 + Math.random() * 25,
            size: 4 + Math.random() * 6,
            delay: starDelay, // Same timing as parent star
          });
        }
      }

      setParticles(newParticles);
      setSparkles(newSparkles);
      impactCountRef.current = 0;

      // Calculate total animation duration based on star count
      // Initial delay + last star starts at (starCount-1) * STAGGER_DELAY, then takes FLIGHT_DURATION
      const totalDuration = (INITIAL_DELAY * 1000) + ((starCount - 1) * STAGGER_DELAY * 1000) + (FLIGHT_DURATION * 1000) + 800;

      const timer = setTimeout(() => {
        setParticles([]);
        setSparkles([]);
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
              scale: 2.5,
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
                startPosition.y + particle.offsetY - 80,
                targetPosition.y,
              ],
              scale: [2.5, 2.0, 0.5],
              opacity: [0, 1, 1, 0],
              // End at 0° (point up) to match header star orientation
              // Use 360 or 720 to ensure smooth forward rotation of at least 270°
              rotate: (() => {
                const endRotation = particle.rotation > 90 ? 720 : 360;
                const midRotation = particle.rotation + (endRotation - particle.rotation) / 2;
                return [particle.rotation, midRotation, endRotation];
              })(),
            }}
            transition={{
              duration: FLIGHT_DURATION,
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

      {/* Sparkle particles around each star */}
      <AnimatePresence>
        {sparkles.map((sparkle) => {
          const parentStar = particles.find(p => p.id === sparkle.starId);
          if (!parentStar) return null;

          const rad = (sparkle.offsetAngle * Math.PI) / 180;
          const sparkleStartX = startPosition.x + parentStar.offsetX + Math.cos(rad) * sparkle.offsetDistance;
          const sparkleStartY = startPosition.y + parentStar.offsetY + Math.sin(rad) * sparkle.offsetDistance;

          return (
            <motion.div
              key={sparkle.id}
              className={styles.sparkle}
              style={{
                width: sparkle.size,
                height: sparkle.size,
              }}
              initial={{
                x: sparkleStartX,
                y: sparkleStartY,
                scale: 0,
                opacity: 0,
              }}
              animate={{
                x: [
                  sparkleStartX,
                  startPosition.x + parentStar.offsetX + parentStar.curve + Math.cos(rad) * (sparkle.offsetDistance * 0.8),
                  targetPosition.x + Math.cos(rad) * 15,
                ],
                y: [
                  sparkleStartY,
                  startPosition.y + parentStar.offsetY - 80 + Math.sin(rad) * (sparkle.offsetDistance * 0.8),
                  targetPosition.y + Math.sin(rad) * 15,
                ],
                scale: [0, 1.2, 0],
                opacity: [0, 0.9, 0],
              }}
              transition={{
                duration: FLIGHT_DURATION,
                delay: sparkle.delay,
                ease: [0.2, 0.6, 0.3, 1],
                times: [0, 0.4, 1],
              }}
            />
          );
        })}
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
            y: startPosition.y - 70,
            scale: 0,
            opacity: 0,
          }}
          animate={{
            scale: [0, 1.6, 1.4],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            delay: INITIAL_DELAY * 0.5, // Appear slightly before stars start
            duration: Math.min(3, (pendingStarAnimation * STAGGER_DELAY) + 1.5),
            times: [0, 0.12, 0.4, 1],
          }}
        >
          +{pendingStarAnimation}
        </motion.div>
      )}
    </div>
  );
}

// Export timing constants for use in other components
export const getStarAnimationDuration = (starCount: number): number => {
  // Returns duration in milliseconds
  // Initial delay + stagger delays + flight duration + buffer
  return (INITIAL_DELAY * 1000) + ((starCount - 1) * STAGGER_DELAY * 1000) + (FLIGHT_DURATION * 1000) + 1000;
};
