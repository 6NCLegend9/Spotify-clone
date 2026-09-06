"use client";

import { FiRefreshCw, FiUsers } from "react-icons/fi";
import { GiMusicalNotes } from "react-icons/gi";
import useCrowdRadio from "@/hooks/useCrowdRadio";
import { cleanTitle } from "@/utils/text";

export default function KasaCrowd({ jam }) {
  const crowd = useCrowdRadio({ code: jam.code, role: jam.role, status: jam.status });

  if (!crowd.supported || !crowd.active) return null;

  const isHost = jam.role === "host";
  const solo = crowd.members.length <= 1;

  return (
    <section className="rounded-xl border border-[#00e6e6]/25 bg-[#00e6e6]/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <GiMusicalNotes aria-hidden="true" className="text-[#00e6e6]" /> Kasa Crowd
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-[#9aa8b5]">
          <FiUsers aria-hidden="true" /> {crowd.members.length} sharing
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#9aa8b5]">
        {isHost
          ? "Builds one station from everyone's taste, and tells you whose taste picked each song."
          : "Your taste is in the mix. The host builds the room's station."}
      </p>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {crowd.members.map((member) => {
          const owner = crowd.owners.find((entry) => entry.id === member.id);
          return (
            <li
              key={member.id}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-200"
            >
              {member.isSelf ? "You" : member.name}
              {owner?.seedCount ? (
                <span className="ml-1 text-[#00e6e6]">{owner.seedCount}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isHost ? (
        <button
          type="button"
          onClick={() => void crowd.buildStation()}
          disabled={crowd.busy}
          aria-busy={crowd.busy}
          className="btn-primary mt-3 min-h-11 w-full gap-2 disabled:cursor-wait disabled:opacity-60"
        >
          <FiRefreshCw aria-hidden="true" className={crowd.busy ? "animate-spin" : ""} />
          {crowd.busy ? "Blending…" : crowd.station.length ? "Rebuild station" : "Build the room's station"}
        </button>
      ) : null}

      {isHost && solo ? (
        <p className="mt-2 text-[11px] text-amber-100/80">
          It&apos;s just you so far — the blend gets better as people join.
        </p>
      ) : null}

      {crowd.error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-300">{crowd.error}</p>
      ) : null}

      {crowd.station.length ? (
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Up next · {crowd.station.length}
          </p>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
            {crowd.station.slice(0, 12).map((entry) => {
              const via = entry.ownerNames?.length ? entry.ownerNames[0] : null;
              return (
                <li key={entry.id} className="rounded-lg px-2 py-1.5">
                  <p className="truncate text-xs text-gray-100">{cleanTitle(entry.title, "Untitled track")}</p>
                  <p className="truncate text-[11px] text-[#9aa8b5]">
                    {via ? (
                      <span className="mr-1 rounded-full bg-[#00e6e6]/15 px-1.5 py-0.5 text-[#00e6e6]">via {via}</span>
                    ) : null}
                    {entry.reason || cleanTitle(entry.channel)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
