import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, tutorialOnboardingSteps, type OnboardingStep } from '../../stores/onboardingStore';

interface SpotlightTooltipProps {
  step: OnboardingStep;
  onDismiss: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function SpotlightTooltipContent({ step, onDismiss, onNext, onPrev, hasNext, hasPrev }: SpotlightTooltipProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [offScreenDirection, setOffScreenDirection] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const hasScrolledRef = useRef(false);

  const updatePosition = useCallback(() => {
    const element = document.getElementById(step.targetId);
    if (element) {
      // Auto-scroll element into view on first render
      if (!hasScrolledRef.current) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        hasScrolledRef.current = true;
      }

      const rect = element.getBoundingClientRect();

      // Check if element is off-screen
      const isOffTop = rect.bottom < 0;
      const isOffBottom = rect.top > window.innerHeight;
      const isOffLeft = rect.right < 0;
      const isOffRight = rect.left > window.innerWidth;

      if (isOffTop) setOffScreenDirection('top');
      else if (isOffBottom) setOffScreenDirection('bottom');
      else if (isOffLeft) setOffScreenDirection('left');
      else if (isOffRight) setOffScreenDirection('right');
      else setOffScreenDirection(null);
      const padding = 8;
      setTargetRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      const tooltipWidth = 280;
      const tooltipHeight = 140;
      const gap = 16;
      const viewportPadding = 16;

      // Calculate position for each direction
      const positions: Record<string, { top: number; left: number; fits: boolean }> = {
        bottom: {
          top: rect.bottom + gap,
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
          fits: rect.bottom + gap + tooltipHeight < window.innerHeight - viewportPadding,
        },
        top: {
          top: rect.top - tooltipHeight - gap,
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
          fits: rect.top - tooltipHeight - gap > viewportPadding,
        },
        right: {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.right + gap,
          fits: rect.right + gap + tooltipWidth < window.innerWidth - viewportPadding,
        },
        left: {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.left - tooltipWidth - gap,
          fits: rect.left - tooltipWidth - gap > viewportPadding,
        },
      };

      // Try preferred position first, then fallback to others
      const preferredOrder = [
        step.position || 'bottom',
        'bottom',
        'top',
        'right',
        'left',
      ];

      let chosen = positions.bottom; // fallback
      for (const pos of preferredOrder) {
        if (positions[pos].fits) {
          chosen = positions[pos];
          break;
        }
      }

      // Clamp to viewport
      let { top, left } = chosen;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipWidth - viewportPadding));
      top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipHeight - viewportPadding));

      setTooltipPosition({ top, left });
    }
  }, [step.targetId, step.position]);

  useEffect(() => {
    updatePosition();

    // Update on resize/scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    // Also poll briefly in case element isn't rendered yet
    const pollInterval = setInterval(updatePosition, 100);
    const pollTimeout = setTimeout(() => clearInterval(pollInterval), 2000);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      clearInterval(pollInterval);
      clearTimeout(pollTimeout);
    };
  }, [updatePosition]);

  if (!targetRect) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
      }}
      onClick={onDismiss}
    >
      {/* Dark overlay with cutout */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              x={targetRect.left}
              y={targetRect.top}
              width={targetRect.width}
              height={targetRect.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Highlight border around target - only show if on screen */}
      {!offScreenDirection && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            position: 'absolute',
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: 12,
            border: '3px solid #22D3EE',
            boxShadow: '0 0 20px rgba(34, 211, 238, 0.5)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Off-screen indicator - glowing edge with arrow */}
      {offScreenDirection && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            position: 'fixed',
            ...(offScreenDirection === 'top' && {
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 200,
              height: 60,
              background: 'linear-gradient(to bottom, rgba(34, 211, 238, 0.6), transparent)',
              borderRadius: '0 0 100px 100px',
            }),
            ...(offScreenDirection === 'bottom' && {
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 200,
              height: 60,
              background: 'linear-gradient(to top, rgba(34, 211, 238, 0.6), transparent)',
              borderRadius: '100px 100px 0 0',
            }),
            ...(offScreenDirection === 'left' && {
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 60,
              height: 200,
              background: 'linear-gradient(to right, rgba(34, 211, 238, 0.6), transparent)',
              borderRadius: '0 100px 100px 0',
            }),
            ...(offScreenDirection === 'right' && {
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 60,
              height: 200,
              background: 'linear-gradient(to left, rgba(34, 211, 238, 0.6), transparent)',
              borderRadius: '100px 0 0 100px',
            }),
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{
            fontSize: 24,
            color: '#22D3EE',
            textShadow: '0 0 10px rgba(34, 211, 238, 0.8)',
          }}>
            {offScreenDirection === 'top' && '↑ Scroll up'}
            {offScreenDirection === 'bottom' && '↓ Scroll down'}
            {offScreenDirection === 'left' && '←'}
            {offScreenDirection === 'right' && '→'}
          </span>
        </motion.div>
      )}

      {/* Tooltip */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15 }}
        style={{
          position: 'absolute',
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: 280,
          background: '#1E293B',
          border: '1px solid #475569',
          borderRadius: 12,
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{
          color: '#22D3EE',
          fontWeight: 700,
          fontSize: '1.125rem',
          marginBottom: 8,
          marginTop: 0,
        }}>
          {step.title}
        </h3>
        <p style={{
          color: '#CBD5E1',
          fontSize: '0.875rem',
          marginBottom: 16,
          marginTop: 0,
          lineHeight: 1.5,
        }}>
          {step.description}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left side - Back button or Skip all */}
          <div>
            {hasPrev ? (
              <button
                onClick={onPrev}
                style={{
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  color: '#94A3B8',
                  background: 'transparent',
                  border: '1px solid #475569',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                ← Back
              </button>
            ) : (
              <button
                onClick={onDismiss}
                style={{
                  padding: '8px 12px',
                  fontSize: '0.875rem',
                  color: '#94A3B8',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                Skip tutorial
              </button>
            )}
          </div>

          {/* Right side - Next/Done button */}
          <div style={{ display: 'flex', gap: 8 }}>
            {hasNext ? (
              <button
                onClick={onNext}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  background: '#22D3EE',
                  color: '#0F172A',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={onDismiss}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  background: '#22D3EE',
                  color: '#0F172A',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function SpotlightTooltip() {
  const { currentSpotlight, hideSpotlight, nextSpotlight, prevSpotlight, tutorialStep, currentStepIndex } = useOnboardingStore();

  // Get steps for current tutorial
  const currentSteps = tutorialOnboardingSteps[tutorialStep] || [];
  const hasNext = currentStepIndex < currentSteps.length - 1;
  const hasPrev = currentStepIndex > 0;

  // Don't render if no spotlight
  if (!currentSpotlight) return null;

  return createPortal(
    <AnimatePresence>
      {currentSpotlight && (
        <SpotlightTooltipContent
          key={currentSpotlight.id}
          step={currentSpotlight}
          onDismiss={hideSpotlight}
          onNext={nextSpotlight}
          onPrev={prevSpotlight}
          hasNext={hasNext}
          hasPrev={hasPrev}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}
