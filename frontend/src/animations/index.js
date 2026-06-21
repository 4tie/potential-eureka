// Cyberpunk Animation Library
// Provides reusable animation utilities for the AutoQuant dashboard

export const animations = {
  // Fade animations
  fadeInUp: "animate-fade-in-up",
  fadeInDown: "animate-fade-in-down",
  fadeInLeft: "animate-fade-in-left",
  fadeInRight: "animate-fade-in-right",
  fadeIn: "animate-fade-in",
  fadeOut: "animate-fade-out",

  // Slide animations
  slideInUp: "animate-slide-in-up",
  slideInDown: "animate-slide-in-down",
  slideInLeft: "animate-slide-in-left",
  slideInRight: "animate-slide-in-right",

  // Scale animations
  scaleIn: "animate-scale-in",
  scaleOut: "animate-scale-out",
  scaleUp: "animate-scale-up",
  scaleDown: "animate-scale-down",

  // Rotate animations
  rotateIn: "animate-rotate-in",
  rotateOut: "animate-rotate-out",

  // Pulse animations
  pulse: "animate-pulse",
  pulseSlow: "animate-pulse-slow",
  pulseFast: "animate-pulse-fast",

  // Glow animations
  glow: "neon-glow",
  glowPurple: "neon-glow-purple",
  glowPink: "neon-glow-pink",
  glowGreen: "neon-glow-green",
  glowOrange: "neon-glow-orange",
  glowRed: "neon-glow-red",
  pulseGlow: "pulse-glow",

  // Cyberpunk-specific animations
  crtFlicker: "crt-flicker",
  scanEffect: "scan-effect",
  glitch: "glitch",
  dataStream: "data-stream",
  typing: "typing",
  cyberGrid: "cyber-grid",
  scanlines: "scanlines",

  // Progress animations
  progress: "animate-progress",
  progressBar: "animate-progress-bar",
  progressRing: "animate-progress-ring",

  // Loading animations
  spin: "animate-spin",
  bounce: "animate-bounce",
  ping: "animate-ping",
};

export const animationDurations = {
  fast: "150ms",
  normal: "300ms",
  slow: "500ms",
  slower: "1000ms",
};

export const animationEasings = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
};

export function getAnimationClass(type, duration = "normal", easing = "easeInOut") {
  const anim = animations[type];
  if (!anim) return "";
  
  return `${anim} duration-${duration} ease-${easing}`;
}

export function withAnimation(element, animationType, options = {}) {
  const { duration = "normal", easing = "easeInOut", delay = "0ms" } = options;
  const animClass = getAnimationClass(animationType, duration, easing);
  
  return {
    className: `${element.className || ""} ${animClass}`,
    style: {
      ...(element.style || {}),
      animationDelay: delay,
    },
  };
}

// Animation presets for common use cases
export const presets = {
  // Card appearance
  cardAppear: {
    animation: "fadeInUp",
    duration: "normal",
    easing: "easeOut",
  },

  // Event log entry
  eventLogEntry: {
    animation: "slideInLeft",
    duration: "fast",
    easing: "easeOut",
  },

  // Success state
  success: {
    animation: "pulseGlow",
    duration: "slow",
    easing: "easeInOut",
  },

  // Error state
  error: {
    animation: "glitch",
    duration: "fast",
    easing: "easeInOut",
  },

  // Loading state
  loading: {
    animation: "pulse",
    duration: "normal",
    easing: "easeInOut",
  },

  // Progress update
  progressUpdate: {
    animation: "pulse",
    duration: "fast",
    easing: "easeOut",
  },

  // New notification
  notification: {
    animation: "slideInDown",
    duration: "normal",
    easing: "easeOut",
  },

  // Dashboard panel load
  dashboardPanel: {
    animation: "fadeIn",
    duration: "slow",
    easing: "easeInOut",
  },
};

export default animations;
