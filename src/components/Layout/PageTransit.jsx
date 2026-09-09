"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function PageTransit({ pathname, children }) {
  const reduced = useReducedMotion();
  if (reduced) return children;

  return (
    <div className="fx-page-live">
      <motion.div
        key={`${pathname}-veil`}
        className="fx-page-veil"
        initial={{ opacity: 1, scaleY: 1.08 }}
        animate={{ opacity: 0, scaleY: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
      />
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
