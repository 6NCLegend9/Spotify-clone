"use client";

import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BsFillVolumeMuteFill, BsFillVolumeUpFill, BsVolumeDownFill } from "react-icons/bs";
import { updateSetting } from "@/redux/features/settingsSlice";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

export default function PlayerVolume({ className = "" }) {
  const dispatch = useDispatch();
  const volume = Number(useSelector((state) => state.settings.masterVolume) ?? 1);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const setVolume = (value) => dispatch(updateSetting({ key: "masterVolume", value }));
  const Icon = volume === 0 ? BsFillVolumeMuteFill : volume <= 0.5 ? BsVolumeDownFill : BsFillVolumeUpFill;

  useDismissOnOutside(open, () => setOpen(false), [rootRef], { escape: true });

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
          if (window.matchMedia("(max-width: 1023px)").matches) {
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
        className="player-volume-slider hidden !h-12 lg:block"
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
            className="h-12 w-28 accent-[#00e6e6]"
          />
        </div>
      )}
    </div>
  );
}
