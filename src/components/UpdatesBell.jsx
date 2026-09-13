"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineBell } from "react-icons/hi2";
import { IoClose } from "react-icons/io5";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const CURRENT_UPDATE_KEY = "HeyKasa_updates_seen_v1";

const CHANGES = [
  {
    title: "Updated Privacy Policy",
    description:
      "We have updated our Privacy Policy to better protect your data.",
  }
];

const UpdatesBell = () => {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useFocusTrap({
    enabled: open,
    onClose: () => setOpen(false),
    containerRef: panelRef,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasUnread(window.localStorage.getItem(CURRENT_UPDATE_KEY) !== "true");
  }, []);

  useDismissOnOutside(open, () => setOpen(false), [panelRef, buttonRef]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
    if (hasUnread) {
      setHasUnread(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CURRENT_UPDATE_KEY, "true");
      }
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="icon-btn relative h-9 w-9 sm:h-10 sm:w-10"
        aria-label={hasUnread ? "Open updates, unread" : "Open updates"}
        title="Updates"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="updates-panel"
      >
        <HiOutlineBell aria-hidden="true" className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#00e6e6] shadow-[0_0_0_2px_rgba(2,8,19,0.95)]">
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close updates"
            className="fixed inset-0 z-40 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id="updates-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="updates-title"
            className="fixed right-3 top-[72px] z-50 w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#07121d] text-white shadow-dock md:right-6"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="updates-title" className="text-lg font-semibold">What&apos;s new</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn h-11 w-11"
                aria-label="Close updates"
              >
                <IoClose aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
              {CHANGES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/70">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default UpdatesBell;
