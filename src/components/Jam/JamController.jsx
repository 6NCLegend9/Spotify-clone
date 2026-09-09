"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { FiRadio, FiCopy, FiUsers, FiLink, FiShare2, FiX } from "react-icons/fi";
import { toast } from "react-hot-toast";
import BottomSheet from "@/components/BottomSheet";
import JamQr from "@/components/Jam/JamQr";
import KasaCrowd from "@/components/Jam/KasaCrowd";
import { useJam } from "@/components/Jam/JamProvider";
import {
  JAM_OPEN_EVENT,
  consumeJamOpenRequest,
  isJamCode,
  jamPath,
  normalizeJamCode,
} from "@/utils/jam.mjs";

const JAM_FAB_POS_KEY = "heykasa.jam.fab-pos";
const FAB_EDGE = 12;
const DRAG_THRESHOLD_PX = 6;

function readFabPosition() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(JAM_FAB_POS_KEY) || "null");
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function writeFabPosition(position) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JAM_FAB_POS_KEY, JSON.stringify(position));
  } catch {
    // Storage may be unavailable in hardened/private browsing contexts.
  }
}

function clampFabPosition(x, y, width, height) {
  const maxX = Math.max(FAB_EDGE, window.innerWidth - width - FAB_EDGE);
  const maxY = Math.max(FAB_EDGE, window.innerHeight - height - FAB_EDGE);
  return {
    x: Math.min(maxX, Math.max(FAB_EDGE, x)),
    y: Math.min(maxY, Math.max(FAB_EDGE, y)),
  };
}

export default function JamController() {
  const jam = useJam();
  const pathname = usePathname();
  const fullScreen = useSelector((state) => state.player.fullScreen);
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [fabPos, setFabPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fabRef = useRef(null);
  const dragRef = useRef(null);
  const skipClickRef = useRef(false);

  useEffect(() => {
    const openSheet = () => {
      consumeJamOpenRequest();
      setOpen(true);
    };
    if (consumeJamOpenRequest()) setOpen(true);
    window.addEventListener(JAM_OPEN_EVENT, openSheet);
    return () => window.removeEventListener(JAM_OPEN_EVENT, openSheet);
  }, []);

  useEffect(() => {
    if (!jam?.code || typeof window === "undefined") {
      setShareUrl("");
      return;
    }
    setShareUrl(`${window.location.origin}${jamPath(jam.code)}`);
  }, [jam?.code]);

  useEffect(() => {
    if (!fullScreen) {
      setDragging(false);
      dragRef.current = null;
      return undefined;
    }
    const apply = () => {
      const node = fabRef.current;
      if (!node) return;
      const saved = readFabPosition();
      if (!saved) return;
      setFabPos(clampFabPosition(
        saved.x,
        saved.y,
        node.offsetWidth || 88,
        node.offsetHeight || 44,
      ));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [fullScreen]);

  if (!jam?.available || pathname?.startsWith("/arcade")) return null;

  const inRoom = Boolean(jam.role && jam.code);

  const copyText = async (value, success) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
    } catch {
      toast.error("Couldn't copy that");
    }
  };

  const shareLink = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "HayKasa Jam",
          text: `Join my Jam with code ${jam.code}`,
          url: shareUrl,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    void copyText(shareUrl, "Jam link copied");
  };

  const moveFab = (event) => {
    const drag = dragRef.current;
    const node = fabRef.current;
    if (!drag || !node) return;
    const next = clampFabPosition(
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY,
      node.offsetWidth,
      node.offsetHeight,
    );
    setFabPos(next);
    writeFabPosition(next);
  };

  const beginFabDrag = (event) => {
    if (!fullScreen || event.button) return;
    const node = fabRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    node.setPointerCapture?.(event.pointerId);
  };

  const updateFabDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      skipClickRef.current = true;
      setDragging(true);
    }
    moveFab(event);
  };

  const endFabDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) moveFab(event);
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const trigger = (
    <button
      ref={fabRef}
      type="button"
      data-testid="jam-button"
      onClick={() => {
        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }
        setOpen(true);
      }}
      onPointerDown={beginFabDrag}
      onPointerMove={updateFabDrag}
      onPointerUp={endFabDrag}
      onPointerCancel={endFabDrag}
      aria-label="Open HayKasa Jam"
      title={fullScreen ? "Drag to move · tap to open Jam" : "Open HayKasa Jam"}
      style={fullScreen && fabPos ? { left: fabPos.x, top: fabPos.y, right: "auto" } : undefined}
      className={`${
        fullScreen
          ? `fixed z-[80] touch-none select-none ${fabPos ? "" : "left-4 top-20"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`
          : "fixed right-3 z-[25] bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:absolute md:bottom-4 md:right-4"
      } ${fullScreen ? "hidden md:inline-flex" : "inline-flex"} min-h-11 items-center gap-2 rounded-full border border-[#00e6e6]/40 bg-[#07121d]/95 px-3.5 py-2 text-sm font-semibold text-[#00e6e6] shadow-glow backdrop-blur ${dragging ? "" : "transition hover:border-[#00e6e6]"}`}
    >
      <FiRadio aria-hidden="true" />
      {inRoom && jam.code ? `Jam · ${jam.code}` : "Jam"}
    </button>
  );

  return (
    <>
      {fullScreen && typeof document !== "undefined"
        ? createPortal(trigger, document.body)
        : trigger}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        label="HayKasa Jam"
        className="jam-sheet"
        overlayClassName="jam-sheet-overlay"
      >
        <div className="flex items-center justify-between gap-3 text-lg font-semibold text-white">
          <span className="flex items-center gap-2">
            <FiRadio aria-hidden="true" className="text-[#00e6e6]" />
            HayKasa Jam
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="icon-btn h-11 w-11 shrink-0"
            aria-label="Close Jam"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        {!inRoom ? (
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-sm text-[#9aa8b5]">
              Start a live session, then share the code, QR, or link. Friends can also type a code below.
            </p>
            <button
              type="button"
              onClick={jam.host}
              disabled={jam.status === "connecting"}
              className="btn-primary min-h-11 w-full disabled:cursor-wait disabled:opacity-60"
            >
              {jam.status === "connecting" ? "Connecting…" : "Start a Jam"}
            </button>
            <div>
              <label htmlFor="jam-join-code" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
                1. Join with a code
              </label>
              <div className="flex gap-2">
                <input
                  id="jam-join-code"
                  value={joinCode}
                  onChange={(event) => setJoinCode(normalizeJamCode(event.target.value))}
                  placeholder="H7KM3P"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="field min-h-11 min-w-0 flex-1 uppercase tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => jam.join(joinCode)}
                  disabled={!isJamCode(joinCode) || jam.status === "connecting"}
                  className="btn-primary min-h-11 shrink-0 disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
            <p className="text-xs text-[#9aa8b5]">
              2. Scan a host&apos;s QR code with your camera.
              <br />
              3. Open a Jam link while signed in.
            </p>
            {jam.status === "error" ? (
              <p className="text-xs text-red-400">Couldn&apos;t join that Jam. Check the code or ask for a new one.</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {jam.status === "connecting" ? (
              <p className="text-sm text-[#9aa8b5]">Connecting…</p>
            ) : null}
            {jam.status === "error" ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">
                <p>Connection interrupted.</p>
                <button
                  type="button"
                  onClick={() => void jam.reconnect()}
                  className="min-h-11 shrink-0 rounded-full border border-amber-200/30 px-3 font-semibold hover:bg-white/5"
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div className="glass-panel rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">1. Code</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span data-testid="jam-code" className="text-2xl font-bold tracking-[0.28em] text-white">{jam.code || "······"}</span>
                <button
                  type="button"
                  onClick={() => jam.code && copyText(jam.code, "Join code copied")}
                  disabled={jam.status !== "connected"}
                  className="icon-btn h-11 w-11"
                  aria-label="Copy join code"
                >
                  <FiCopy aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[#9aa8b5]">
                {jam.role === "host"
                  ? "You're hosting — everyone hears what you play."
                  : "You're listening along with the host."}
              </p>
              {jam.role === "host" && jam.listeners.length <= 1 ? (
                <p className="mt-2 text-[11px] text-amber-100/80">
                  This code expires if nobody joins within 10 minutes.
                </p>
              ) : null}
            </div>

            {jam.role === "host" && shareUrl && jam.status === "connected" ? (
              <>
                <div className="glass-panel rounded-xl p-4 text-center">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">2. QR</p>
                  <JamQr url={shareUrl} label={`QR code for Jam ${jam.code}`} />
                  <p className="mt-2 text-[11px] text-[#9aa8b5]">Friends scan this to open the Jam link.</p>
                </div>

                <div className="glass-panel rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">3. Link</p>
                  <p className="mt-2 break-all text-xs text-gray-200">{shareUrl}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(shareUrl, "Jam link copied")}
                      className="btn-ghost min-h-11 flex-1 gap-2"
                    >
                      <FiLink aria-hidden="true" /> Copy link
                    </button>
                    <button type="button" onClick={shareLink} className="btn-primary min-h-11 flex-1 gap-2">
                      <FiShare2 aria-hidden="true" /> Share
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#9aa8b5]">
                    The link only opens the Jam if they&apos;re signed in.
                  </p>
                </div>
              </>
            ) : null}

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <FiUsers aria-hidden="true" /> People in this Jam
                <span className="text-xs font-normal text-[#9aa8b5]">{jam.listeners.length}</span>
              </p>
              <ul className="flex flex-col gap-1">
                {jam.listeners.map((name, index) => (
                  <li key={`${name}-${index}`} className="truncate rounded-lg px-2 py-1.5 text-sm text-gray-200">
                    {name}
                  </li>
                ))}
              </ul>
            </div>

            <KasaCrowd jam={jam} />

            <button
              type="button"
              onClick={() => {
                if (jam.role === "host") void jam.endJam("Jam ended.");
                else void jam.leave();
                setOpen(false);
              }}
              className="min-h-11 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-red-500/60 hover:text-red-400"
            >
              {jam.role === "host" ? "End Jam" : "Leave Jam"}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
