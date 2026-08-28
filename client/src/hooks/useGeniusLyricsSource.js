import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";

export function useGeniusLyricsSource(track) {
  const title = typeof track?.title === "string" ? track.title.trim() : "";
  const artistName = typeof track?.artistName === "string" ? track.artistName.trim() : "";
  const trackKey = `${title}\n${artistName}`;
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestedTrackKey, setRequestedTrackKey] = useState("");
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    let active = true;
    if (!title || !artistName || requestedTrackKey !== trackKey) {
      setSong(null);
      setLoading(false);
      setError("");
      return () => { active = false; };
    }

    setSong(null);
    setLoading(true);
    setError("");
    api.get(withQuery("/api/lyrics/genius", { title, artist: artistName }))
      .then((response) => {
        if (active) setSong(response.data || null);
      })
      .catch((requestError) => {
        if (active) {
          setSong(null);
          setError(requestError.message || "Genius lyrics lookup is unavailable");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [artistName, requestNumber, requestedTrackKey, title, trackKey]);

  const lookup = () => {
    if (!title || !artistName || loading) return;
    setRequestedTrackKey(trackKey);
    setRequestNumber((value) => value + 1);
  };

  return { song, loading, error, lookup };
}