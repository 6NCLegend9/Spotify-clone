"use client";

import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { requestJson } from "@/services/http";
import { isYoutubeVideoId } from "@/utils/youtubeComments.mjs";

const HIDDEN_KEY = "heykasa.comments.hidden";

function readHidden() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export default function VideoComments({ videoId }) {
  const privateSession = useSelector((state) => state.settings.privateSession === true);
  const [hidden, setHidden] = useState(false);
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  useEffect(() => {
    if (privateSession || hidden || !isYoutubeVideoId(videoId)) {
      setComments([]);
      setStatus(privateSession ? "private" : "idle");
      return undefined;
    }
    let cancelled = false;
    setStatus("loading");
    requestJson(`/api/youtube-comments?videoId=${encodeURIComponent(videoId)}`, {
      fallbackTitle: "Comments unavailable",
      fallbackMessage: "We couldn’t load comments for this track.",
    })
      .then((json) => {
        if (cancelled) return;
        const next = Array.isArray(json?.data?.comments)
          ? json.data.comments
          : Array.isArray(json?.comments) ? json.comments : [];
        setComments(next);
        setStatus(next.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [hidden, privateSession, videoId]);

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <section className="mt-4" aria-label="Comments on this track">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Comments</h3>
        <button
          type="button"
          onClick={toggleHidden}
          className="min-h-11 rounded-full px-3 text-xs font-semibold text-[#9aa8b5] hover:text-white"
        >
          {hidden ? "Show comments" : "Hide comments"}
        </button>
      </header>
      {privateSession ? (
        <p className="text-xs leading-5 text-[#9aa8b5]">Private session hides comments on this track.</p>
      ) : hidden ? (
        <p className="text-xs leading-5 text-[#9aa8b5]">Comments are hidden.</p>
      ) : status === "loading" ? (
        <p className="text-xs leading-5 text-[#9aa8b5]">Loading comments…</p>
      ) : status === "error" ? (
        <p className="text-xs leading-5 text-red-300">Comments could not be loaded.</p>
      ) : status === "empty" ? (
        <p className="text-xs leading-5 text-[#9aa8b5]">No top comments for this upload yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-white/10 px-3 py-2">
              <p className="text-[11px] font-semibold text-[#00e6e6]">{comment.author}</p>
              <p className="mt-1 text-xs leading-5 text-gray-200">{comment.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
