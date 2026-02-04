import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Onboarding spotlight steps for each tutorial
export interface OnboardingStep {
  id: string;
  targetId: string; // DOM element id to spotlight
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

// Onboarding steps for each tutorial mission
export const tutorialOnboardingSteps: Record<number, OnboardingStep[]> = {
  1: [
    {
      id: 'stars',
      targetId: 'game-stars',
      title: 'Collect the Stars!',
      description: 'Your goal is to collect ALL the golden stars. Program the robot to visit every star on the board!',
      position: 'right',
    },
    {
      id: 'board',
      targetId: 'game-board',
      title: 'The Puzzle Board',
      description: 'This is your puzzle. Guide the robot to collect the stars!',
      position: 'right',
    },
    {
      id: 'palette',
      targetId: 'instruction-palette',
      title: 'Instructions',
      description: 'Drag FORWARD and RIGHT to program the robot.',
      position: 'top',
    },
    {
      id: 'f1-slots',
      targetId: 'function-slots-f1',
      title: 'Program Slots',
      description: 'Drop instructions here. They run left to right.',
      position: 'top',
    },
    {
      id: 'f1-loop',
      targetId: 'function-tab-f1',
      title: 'F1 Loops Forever',
      description: 'See the ↻ symbol? F1 is special - when it finishes, it loops back to the start!',
      position: 'bottom',
    },
    {
      id: 'play-button',
      targetId: 'play-button',
      title: 'Run Your Program',
      description: 'Press Play to watch your robot execute!',
      position: 'left',
    },
    {
      id: 'step-button',
      targetId: 'step-button',
      title: 'Step Through',
      description: 'You can also step through your program one step at a time.',
      position: 'left',
    },
    {
      id: 'reset-button',
      targetId: 'reset-button',
      title: 'Reset to Edit',
      description: 'Once your program is running, you cannot edit it until you reset the player.',
      position: 'right',
    },
  ],
  2: [
    {
      id: 'color-selector',
      targetId: 'color-condition-selector',
      title: 'Color Conditions',
      description: 'Select a color before dragging, or tap a placed instruction to cycle colors. Instructions only run on matching tiles - otherwise they get skipped!',
      position: 'bottom',
    },
  ],
  3: [
    {
      id: 'f2-tab',
      targetId: 'function-tab-f2',
      title: 'Function F2',
      description: 'F2 is a helper function. When F2 finishes, control returns to exactly where it was called from in F1, and F1 continues with the next instruction.',
      position: 'bottom',
    },
    {
      id: 'f2-instruction',
      targetId: 'palette-f2',
      title: 'Call F2',
      description: 'Drag F2 into F1 to call it. Watch the Stack panel during execution - when F2 returns, F1 becomes active again!',
      position: 'top',
    },
    {
      id: 'call-stack-t3',
      targetId: 'call-stack',
      title: 'The Call Stack',
      description: "This shows which function is running. When F2 finishes, it 'pops' off and control returns to F1. The 'returns to' label shows where execution will continue!",
      position: 'top',
    },
  ],
  4: [
    {
      id: 'recursion',
      targetId: 'function-tab-f2',
      title: 'Recursion',
      description: 'A function can call itself! Put F2 inside F2 to create a loop that repeats until it hits the edge.',
      position: 'bottom',
    },
  ],
  5: [
    {
      id: 'paint-instruction',
      targetId: 'palette-paint_green',
      title: 'Paint Instructions',
      description: 'PAINT changes the tile color under the robot. Use this to affect how conditionals work on future passes!',
      position: 'top',
    },
  ],
  6: [
    {
      id: 'f3-intro',
      targetId: 'function-tab-f3',
      title: 'Function F3',
      description: 'F3 is another helper function, just like F2. In this puzzle, it handles what happens after F2 finishes.',
      position: 'bottom',
    },
    {
      id: 'call-stack',
      targetId: 'call-stack',
      title: 'The Call Stack',
      description: 'Watch the stack grow as functions call each other! Each badge shows a function waiting to continue. When a function finishes, it returns to the previous one.',
      position: 'top',
    },
    {
      id: 'return-to-f1',
      targetId: 'function-slots-f1',
      title: 'After F2 Returns',
      description: 'When F2 finishes, control returns to the function that called it, continuing from where F2 was called. The next instruction after F2 will run!',
      position: 'top',
    },
  ],
};

interface OnboardingState {
  // Persisted state
  seenElements: string[]; // Array instead of Set for persistence
  completedTutorials: number[];

  // Session state
  currentSpotlight: OnboardingStep | null;
  currentStepIndex: number;
  tutorialStep: number;

  // Actions
  markSeen: (element: string) => void;
  hasSeen: (element: string) => boolean;
  showSpotlight: (step: OnboardingStep) => void;
  hideSpotlight: () => void;
  nextSpotlight: () => void;
  prevSpotlight: () => void;
  setTutorialStep: (step: number) => void;
  completeTutorial: (step: number) => void;
  hasCompletedTutorial: (step: number) => boolean;
  startOnboarding: (tutorialStep: number) => void;
  resetOnboarding: () => void;
  syncWithProgress: (tutorialCompleted: number[]) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Persisted state
      seenElements: [],
      completedTutorials: [],

      // Session state (not persisted)
      currentSpotlight: null,
      currentStepIndex: 0,
      tutorialStep: 0,

      markSeen: (element: string) => {
        const { seenElements } = get();
        if (!seenElements.includes(element)) {
          set({ seenElements: [...seenElements, element] });
        }
      },

      hasSeen: (element: string) => {
        return get().seenElements.includes(element);
      },

      showSpotlight: (step: OnboardingStep) => {
        set({ currentSpotlight: step });
      },

      hideSpotlight: () => {
        const { currentSpotlight, seenElements } = get();
        if (currentSpotlight && !seenElements.includes(currentSpotlight.id)) {
          set({
            currentSpotlight: null,
            seenElements: [...seenElements, currentSpotlight.id],
          });
        } else {
          set({ currentSpotlight: null });
        }
      },

      nextSpotlight: () => {
        const { tutorialStep, currentStepIndex, currentSpotlight, seenElements } = get();
        const steps = tutorialOnboardingSteps[tutorialStep] || [];

        // Mark current as seen
        const newSeenElements = currentSpotlight && !seenElements.includes(currentSpotlight.id)
          ? [...seenElements, currentSpotlight.id]
          : seenElements;

        const nextIndex = currentStepIndex + 1;
        if (nextIndex < steps.length) {
          set({
            currentStepIndex: nextIndex,
            currentSpotlight: steps[nextIndex],
            seenElements: newSeenElements,
          });
        } else {
          set({
            currentSpotlight: null,
            seenElements: newSeenElements,
          });
        }
      },

      prevSpotlight: () => {
        const { tutorialStep, currentStepIndex } = get();
        const steps = tutorialOnboardingSteps[tutorialStep] || [];

        const prevIndex = currentStepIndex - 1;
        if (prevIndex >= 0) {
          set({
            currentStepIndex: prevIndex,
            currentSpotlight: steps[prevIndex],
          });
        }
      },

      setTutorialStep: (step: number) => {
        set({ tutorialStep: step, currentStepIndex: 0, currentSpotlight: null });
      },

      completeTutorial: (step: number) => {
        const { completedTutorials } = get();
        if (!completedTutorials.includes(step)) {
          set({ completedTutorials: [...completedTutorials, step] });
        }
      },

      hasCompletedTutorial: (step: number) => {
        return get().completedTutorials.includes(step);
      },

      startOnboarding: (tutorialStep: number) => {
        const steps = tutorialOnboardingSteps[tutorialStep] || [];

        // Always show onboarding from the beginning when opening a tutorial
        if (steps.length > 0) {
          set({
            tutorialStep,
            currentStepIndex: 0,
            currentSpotlight: steps[0],
          });
        } else {
          set({
            tutorialStep,
            currentStepIndex: 0,
            currentSpotlight: null,
          });
        }
      },

      resetOnboarding: () => {
        set({
          seenElements: [],
          completedTutorials: [],
          currentSpotlight: null,
          currentStepIndex: 0,
          tutorialStep: 0,
        });
      },

      syncWithProgress: (tutorialCompleted: number[]) => {
        // Merge incoming progress with local completedTutorials
        const { completedTutorials } = get();
        const merged = [...new Set([...completedTutorials, ...tutorialCompleted])];
        set({ completedTutorials: merged });
      },
    }),
    {
      name: 'robozzle-onboarding',
      // Only persist completed tutorials - not seen elements
      partialize: (state) => ({
        completedTutorials: state.completedTutorials,
      }),
    }
  )
);
