"use client";
import ListenAgainCard from "../ListenAgainCard";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setAutoAdd } from "@/redux/features/playerSlice";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

const normalizeHistory = (value) =>
  (Array.isArray(value) ? value : []).filter(
    (song) =>
      song &&
      typeof song === "object" &&
      ((typeof song.id === "string" && song.id.trim()) ||
        (typeof song.id === "number" && Number.isFinite(song.id))) &&
      ((typeof song.name === "string" && song.name.trim()) ||
        (typeof song.title === "string" && song.title.trim())),
  );

const ListenAgain = () => {
  const [songHistory, setSongHistory] = useState([]);
  const [syncError, setSyncError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const dispatch = useDispatch();
  const { status } = useSession();

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem("songHistory") || "[]");
      setSongHistory(normalizeHistory(storedHistory));
    } catch {
      setSongHistory([]);
    }
    try {
      dispatch(setAutoAdd(localStorage.getItem("autoAdd") === "true"));
    } catch {
      dispatch(setAutoAdd(false));
    }
  }, [dispatch]);

  // Prefer the account's server-synced history when signed in, so "Listen Again" follows
  // the user across devices/browsers instead of only reflecting this browser's localStorage.
  useEffect(() => {
    if (status !== "authenticated") {
      setSyncError(null);
      setSyncing(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const loadHistory = async () => {
      setSyncing(true);
      setSyncError(null);
      try {
        const json = await requestJson("/api/history", {
          signal: controller.signal,
          fallbackTitle: "Listen Again couldn’t sync",
          fallbackMessage: "Your saved listening history is still available on this device.",
        });
        const syncedHistory = normalizeHistory(json?.data);
        if (!cancelled && json?.success && syncedHistory.length > 0) {
          setSongHistory(syncedHistory);
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setSyncError(
            toUserError(error, {
              title: "Listen Again couldn’t sync",
              message: "Your saved listening history is still available on this device.",
            }),
          );
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [retryKey, status]);

  return (
    <div>
      {/* Listen Again */}
      {syncError && (
        <div className="mt-4">
          <UserMessage
            tone="warning"
            title={syncError.title}
            message={syncError.message}
            onRetry={() => setRetryKey((value) => value + 1)}
            busy={syncing}
            compact
          />
        </div>
      )}
      {songHistory.length > 0 && (
        <div>
          <h2 className=" text-white mt-4 text-2xl lg:text-3xl font-semibold mb-4 ">
            Listen Again
          </h2>
          <div className=" grid grid-cols-2 lg:grid-cols-3 gap-x-10">
            {songHistory.map((song, index) => (
              <ListenAgainCard
                key={`${song.source || "catalog"}-${song.id}`}
                song={song}
                SongData={songHistory}
                index={index}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListenAgain;
