"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineBell } from "react-icons/hi2";
import { IoClose } from "react-icons/io5";

const CURRENT_UPDATE_KEY = "hayasaka_updates_seen_v1";

const CHANGES = [
  {
    title: "Song downloads now include cover art and metadata",
    description:
      "Downloaded songs are tagged with artwork, title, artist, album, and other track metadata.",
  },
  {
    title: "Quality selection added for downloads",
    description:
      "Choose from multiple audio qualities before starting a download.",
  },
  {
    title: "Bulk download support added",
    description:
      "Albums, playlists, and favourites now support bulk ZIP downloads from the app.",
  },
];

const UpdatesBell = () => {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasUnread(window.localStorage.getItem(CURRENT_UPDATE_KEY) !== "true");
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

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
        aria-label="Open updates"
        title="Updates"
      >
        <HiOutlineBell className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#00e6e6] shadow-[0_0_0_2px_rgba(2,8,19,0.95)]" />
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" />
          <div
            ref={panelRef}
            className="fixed right-3 top-[72px] z-50 w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#07121d] text-white shadow-dock md:right-6"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-lg font-semibold">What&apos;s new</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn h-9 w-9"
                aria-label="Close updates"
              >
                <IoClose className="h-5 w-5" />
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
