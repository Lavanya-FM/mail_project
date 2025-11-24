/**
 * Animation utility classes for consistent UI animations
 */

export const animations = {
  // Entrance animations
  fadeIn: 'animate-fade-in',
  fadeInUp: 'animate-fade-in-up',
  fadeInDown: 'animate-fade-in-down',
  fadeInLeft: 'animate-fade-in-left',
  fadeInRight: 'animate-fade-in-right',
  slideInLeft: 'animate-slide-in-left',
  slideInRight: 'animate-slide-in-right',
  slideInUp: 'animate-slide-in-up',
  bounceIn: 'animate-bounce-in',
  scaleIn: 'animate-scale-in',
  rotateIn: 'animate-rotate-in',

  // Continuous animations
  pulseGlow: 'animate-pulse-glow',
  shimmer: 'animate-shimmer',
  float: 'animate-float',
  glowPulse: 'animate-glow-pulse',
  spinSlow: 'animate-spin-slow',

  // Exit animations (using opacity)
  slideDown: 'animate-slide-down',
  slideUp: 'animate-slide-up',
};

export const transitionClasses = {
  fast: 'transition-all duration-200',
  normal: 'transition-all duration-300',
  slow: 'transition-all duration-500',
  slower: 'transition-all duration-700',
};

export const hoverEffects = {
  scaleUp: 'hover:scale-105 transition-transform duration-300',
  scaleDown: 'hover:scale-95 transition-transform duration-300',
  lift: 'hover:shadow-lg hover:-translate-y-1 transition-all duration-300',
  glow: 'hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300',
  brightGlow: 'hover:shadow-xl hover:shadow-blue-400/60 transition-all duration-300',
};

export const focusEffects = {
  ring: 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
  glow: 'focus:outline-none focus:shadow-lg focus:shadow-blue-500/50',
};

export const containerAnimations = {
  staggerChildren: 'space-y-2',
  fadeInContainer: 'animate-fade-in',
};

/**
 * Combine multiple animation classes
 */
export function combineAnimations(...animations: string[]): string {
  return animations.filter(Boolean).join(' ');
}

/**
 * Get staggered animation delay
 */
export function getStaggerDelay(index: number): string {
  const delays = [
    'delay-0',
    'delay-100',
    'delay-200',
    'delay-300',
    'delay-400',
    'delay-500',
  ];
  return delays[Math.min(index, delays.length - 1)];
}
