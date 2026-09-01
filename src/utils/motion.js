export const MOTION_EASE = [0.22, 1, 0.36, 1];

export const MOTION_FAST = {
  duration: 0.18,
  ease: MOTION_EASE,
};

export const MOTION_UI = {
  duration: 0.22,
  ease: MOTION_EASE,
};

export const fadeSlide = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: MOTION_FAST,
};

export const pressScale = {
  whileHover: { scale: 1 },
  whileTap: { scale: 0.98 },
  transition: MOTION_FAST,
};
