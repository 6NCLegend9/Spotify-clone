"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function PageTransit({ pathname, children }) {
  const reduced = useReducedMotion();
  if (reduced) return children;

  return (
    <div className="fx-page-live">
      <motion.div
        key={pathname}
        initial={{ opacity: 0.88 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
