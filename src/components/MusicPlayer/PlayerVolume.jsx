"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BsFillVolumeMuteFill, BsFillVolumeUpFill, BsVolumeDownFill } from "react-icons/bs";
import { updateSetting } from "@/redux/features/settingsSlice";

export default function PlayerVolume({ className = "" }) {
  const dispatch = useDispatch();
  const volume = Number(useSelector((state) => state.settings.masterVolume) ?? 0.85);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const setVolume = (value) => dispatch(updateSetting({ key: "masterVolume", value }));
  const Icon = volume === 0 ? BsFillVolumeMuteFill : volume <= 0.5 ? BsVolumeDownFill : BsFillVolumeUpFill;

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`player-volume ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={volume === 0 ? "Unmute" : "Mute"}
        title="Volume"
        onClick={() => {
          if (window.matchMedia("(max-width: 1023px)").matches) {
            setOpen((value) => !value);
            return;
          }
          setVolume(volume === 0 ? 0.85 : 0);
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-200 hover:bg-white/10"
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
        className="player-volume-slider hidden lg:block"
      />
      {open && (
        <div className="player-volume-popover">
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-28 accent-[#00e6e6]"
          />
        </div>
      )}
    </div>
  );
}
