"use client";
import ListenAgainCard from "../ListenAgainCard";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setAutoAdd } from "@/redux/features/playerSlice";

const ListenAgain = () => {
  const [songHistory, setSongHistory] = useState([]);
  const dispatch = useDispatch();
  const { status } = useSession();

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem("songHistory") || "[]");
      setSongHistory(Array.isArray(storedHistory) ? storedHistory : []);
    } catch (error) {
      setSongHistory([]);
    }
    dispatch(setAutoAdd(localStorage.getItem("autoAdd") === "true"));
  }, [dispatch]);

  // Prefer the account's server-synced history when signed in, so "Listen Again" follows
  // the user across devices/browsers instead of only reflecting this browser's localStorage.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/history")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data) && json.data.length > 0) {
          setSongHistory(json.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div>
      {/* Listen Again */}
      {songHistory?.length > 0 && (
        <div>
          <h2 className=" text-white mt-4 text-2xl lg:text-3xl font-semibold mb-4 ">
            Listen Again
          </h2>
          <div className=" grid grid-cols-2 lg:grid-cols-3 gap-x-10">
            {songHistory?.map((song, index) => (
              <ListenAgainCard
                key={song?.id}
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
