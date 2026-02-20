/**
 * Motion Tokens
 * Standardized durations and easing curves for consistent animations
 */

export const motion = {
  xs: 120,   // hover, tiny changes
  sm: 180,   // press/release, input focus
  md: 250,   // dropdowns, toasts
  lg: 320,   // drawers, modals
  xl: 400,   // page transitions
  exit: 200, // dismiss/close
};

export const ease = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
};

// Preset combinations for common patterns
export const motionPresets = {
  accordionEnter: {
    duration: motion.lg,
    easing: ease.decelerate,
  },
  accordionExit: {
    duration: motion.exit,
    easing: ease.accelerate,
  },
};
