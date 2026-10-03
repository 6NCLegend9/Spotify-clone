"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { BsFillVolumeMuteFill, BsFillVolumeUpFill, BsVolumeDownFill } from "react-icons/bs";
import { updateSetting } from "@/redux/features/settingsSlice";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import useMediaQuery, { useIsPhoneViewport } from "@/hooks/useMediaQuery";

export default function PlayerVolume({ className = "" }) {
  const dispatch = useDispatch();
  const volume = Number(useSelector((state) => state.settings.masterVolume) ?? 1);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const phoneViewport = useIsPhoneViewport();
  const narrowViewport = useMediaQuery("(max-width: 1023px)");
  const popoverVolume = phoneViewport || narrowViewport;
  const setVolume = (value) => dispatch(updateSetting({ key: "masterVolume", value }));
  const Icon = volume === 0 ? BsFillVolumeMuteFill : volume <= 0.5 ? BsVolumeDownFill : BsFillVolumeUpFill;

  const updatePopoverPosition = useCallback(() => {
    if (!open || !rootRef.current || typeof window === "undefined") return;
    const rect = rootRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current?.getBoundingClientRect();
    if (!popoverRect?.width || !popoverRect?.height) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const width = popoverRect.width;
    const height = popoverRect.height;
    const gap = 8;
    const edge = 12;
    const minLeft = viewportLeft + edge;
    const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - width - edge);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, minLeft),
      maxLeft,
    );
    const above = rect.top - height - gap;
    const below = rect.bottom + gap;
    const minTop = viewportTop + edge;
    const maxTop = Math.max(minTop, viewportTop + viewportHeight - height - edge);
    const top = above >= minTop ? above : Math.min(below, maxTop);
    setPopoverPosition({ left, top });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPosition(null);
      return undefined;
    }
    updatePopoverPosition();
    const update = () => updatePopoverPosition();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (popoverRef.current) observer?.observe(popoverRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, updatePopoverPosition]);

  useDismissOnOutside(open, () => setOpen(false), [rootRef, popoverRef], { escape: true });

  return (
    <div
      ref={rootRef}
      className={`player-volume ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Volume controls"
        aria-expanded={open}
        title="Volume"
        onClick={() => {
          if (popoverVolume) {
            setOpen((value) => !value);
            return;
          }
          setVolume(volume === 0 ? 1 : 0);
        }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-gray-200 hover:bg-white/10"
      >
        <Icon size={18} />
      </button>
      <input
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="player-volume-slider hidden !h-12 lg:block phone-landscape-hidden"
      />
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popoverRef}
          data-testid="player-volume-popover"
          className="player-volume-popover"
          style={popoverPosition
            ? { left: `${popoverPosition.left}px`, top: `${popoverPosition.top}px` }
            : { left: "0px", top: "0px", visibility: "hidden" }}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-12 w-28 accent-[#00e6e6]"
          />
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
