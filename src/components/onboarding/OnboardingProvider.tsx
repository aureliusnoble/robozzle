import { useEffect, useRef, type ReactNode } from 'react';
import { SpotlightTooltip } from './SpotlightTooltip';
import { useOnboardingStore } from '../../stores/onboardingStore';

interface OnboardingProviderProps {
  children: ReactNode;
  tutorialStep?: number;
}

export function OnboardingProvider({ children, tutorialStep }: OnboardingProviderProps) {
  const startOnboarding = useOnboardingStore((state) => state.startOnboarding);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    // Only trigger onboarding once per mount
    if (tutorialStep !== undefined && tutorialStep > 0 && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Small delay to ensure DOM elements are rendered
      const timer = setTimeout(() => {
        startOnboarding(tutorialStep);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tutorialStep, startOnboarding]);

  // Reset on unmount so it triggers again on next page load
  useEffect(() => {
    return () => {
      hasTriggeredRef.current = false;
    };
  }, []);

  return (
    <>
      {children}
      <SpotlightTooltip />
    </>
  );
}
