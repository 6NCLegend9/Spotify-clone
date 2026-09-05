"use client";

import { useRef, useState } from "react";
import { FiRadio, FiX, FiCopy, FiUsers } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import useJamSession from "@/hooks/useJamSession";

export default function JamController() {
  const jam = useJamSession();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const panelRef = useRef(null);

  useFocusTrap({ enabled: open, onClose: () => setOpen(false), containerRef: panelRef });

  // Feature stays fully dark until Supabase env is configured.
  if (!jam.available) return null;

  const inRoom = jam.status === "connected" || jam.status === "connecting";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(jam.code);
      toast.success("Join code copied");
    } catch {
      toast.error("Couldn't copy the code");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open HayKasa Jam"
        className="fixed bottom-24 right-4 z-[70] inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#00e6e6]/40 bg-[#07121d]/90 px-4 py-2 text-sm font-semibold text-[#00e6e6] shadow-glow backdrop-blur transition hover:border-[#00e6e6] lg:bottom-28"
      >
        <FiRadio aria-hidden="true" />
        {inRoom ? `Jam · ${jam.code}` : "Jam"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button
            type="button"
            aria-label="Close Jam"
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="HayKasa Jam"
            className="relative z-10 flex h-full w-[min(92vw,380px)] flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#07121d] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <FiRadio aria-hidden="true" className="text-[#00e6e6]" /> HayKasa Jam
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="icon-btn h-9 w-9" aria-label="Close">
                <FiX aria-hidden="true" />
              </button>
            </div>

            {!inRoom ? (
              <>
                <p className="text-sm text-[#9aa8b5]">
                  Start a live session and share the code, or join a friend&apos;s Jam to listen together.
                </p>
                <button type="button" onClick={jam.host} className="btn-primary w-full">
                  Start a Jam
                </button>
                <div className="mt-2">
                  <label htmlFor="jam-join-code" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
                    Join with a code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="jam-join-code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABC123"
                      maxLength={6}
                      className="field flex-1 uppercase tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => jam.join(joinCode)}
                      disabled={joinCode.trim().length < 6}
                      className="btn-primary shrink-0 disabled:opacity-50"
                    >
                      Join
                    </button>
                  </div>
                </div>
                {jam.status === "error" ? (
                  <p className="text-xs text-red-400">Couldn&apos;t connect to the Jam. Check the code and try again.</p>
                ) : null}
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Join code</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-2xl font-bold tracking-[0.3em] text-white">{jam.code}</span>
                    <button type="button" onClick={copyCode} className="icon-btn h-9 w-9" aria-label="Copy join code">
                      <FiCopy aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#9aa8b5]">
                    {jam.role === "host"
                      ? "You're hosting — everyone hears what you play."
                      : "You're listening along with the host."}
                  </p>
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <FiUsers aria-hidden="true" /> Listeners
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

                <button
                  type="button"
                  onClick={jam.leave}
                  className="mt-auto rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-red-500/60 hover:text-red-400"
                >
                  Leave Jam
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
