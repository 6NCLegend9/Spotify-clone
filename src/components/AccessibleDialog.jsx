"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export default function AccessibleDialog({
  open,
  onClose,
  titleId,
  describedBy,
  children,
  panelClassName = "",
  closeLabel = "Close dialog",
  disableClose = false,
}) {
  const panelRef = useRef(null);
  const handleClose = disableClose ? undefined : onClose;

  useFocusTrap({
    enabled: open,
    onClose: handleClose,
    containerRef: panelRef,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center px-4">
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={disableClose ? -1 : 0}
        disabled={disableClose}
        className="absolute inset-0 cursor-default bg-black/70 disabled:cursor-not-allowed"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative z-10 outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
