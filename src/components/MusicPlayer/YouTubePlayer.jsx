"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  playPause,
  setYoutubeVideo,
  addToQueue,
  appendToQueue,
} from "@/redux/features/playerSlice";
import { FiChevronDown, FiChevronUp, FiPause, FiPlay, FiPlus, FiRotateCcw, FiRotateCw, FiSearch, FiX, FiMaximize2, FiMinimize2 } from "react-icons/fi";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";

const formatTime = (seconds) => {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

const playerErrorMessage = (code) => {
  if (code === 2) return "YouTube could not load this video.";
  if (code === 5) return "This video could not play in your browser.";
  if (code === 100) return "This video is no longer available.";
  if (code === 101 || code === 150) return "This video cannot be played outside YouTube.";
  if (code === 153) return "YouTube could not verify this player.";
  return "YouTube playback failed.";
};

const otherDeck = (key) => (key === "A" ? "B" : "A");

export default function YouTubePlayer() {
  const dispatch = useDispatch();
  const { youtubeVideo: video, youtubeQueue: queue, isPlaying } = useSelector(
    (state) => state.player,
  );
  const { dataSaver, audioOnly, videoQuality, transitionMode, crossfadeSeconds } = useSelector(
    (state) => state.settings,
  );
  // Dual decks let one track fade out while the next fades in at the same time.
  const deckHostRefs = { A: useRef(null), B: useRef(null) };
  const deckPlayerRefs = { A: useRef(null), B: useRef(null) };
  const deckGenerationRef = useRef({ A: 0, B: 0 });
  const activeDeckRef = useRef("A");
  const [activeDeck, setActiveDeck] = useState("A");
  const [fadeProgress, setFadeProgress] = useState(0);
  const crossfadeInProgressRef = useRef(false);
  const crossfadeTimerRef = useRef(null);
  const handledVideoIdRef = useRef(null);
  const tickRef = useRef(() => {});
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const autoExtendedForRef = useRef(null);
  const autoExtendingRef = useRef(false);

  const getActivePlayer = () => deckPlayerRefs[activeDeckRef.current]?.current;

  const destroyDeck = (key) => {
    deckGenerationRef.current[key] += 1;
    const player = deckPlayerRefs[key].current;
    deckPlayerRefs[key].current = null;
    player?.destroy?.();
    deckHostRefs[key].current?.replaceChildren();
  };

  const cancelCrossfade = () => {
    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    crossfadeInProgressRef.current = false;
    setFadeProgress(0);
  };

  // Abandons an in-flight fade so a manual pause/seek never leaves a second deck audibly playing.
  const abortCrossfade = () => {
    if (!crossfadeInProgressRef.current) return;
    cancelCrossfade();
    destroyDeck(otherDeck(activeDeckRef.current));
  };

  const mountDeck = (key, videoId, { onFirstPlaying } = {}) => {
    const host = deckHostRefs[key].current;
    if (!host) return null;
    destroyDeck(key);
    const generation = deckGenerationRef.current[key];
    const isCurrent = () => deckGenerationRef.current[key] === generation;

    const playerParams = new URLSearchParams({
      autoplay: "1",
      controls: "0",
      enablejsapi: "1",
      mute: "1",
      origin: window.location.origin,
      playsinline: "1",
      rel: "0",
      widget_referrer: window.location.href,
    });
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}?${playerParams}`;
    iframe.title = "YouTube video player";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    host.replaceChildren(iframe);

    let hasUnmutedOnce = false;
    const player = new window.YT.Player(iframe, {
      events: {
        onReady: (event) => {
          if (!isCurrent()) return;
          const frame = event.target.getIframe();
          frame.style.width = "100%";
          frame.style.height = "100%";
          frame.style.pointerEvents = "none";
          frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          if (key === activeDeckRef.current) {
            setDuration(event.target.getDuration());
            if (videoQuality !== "auto" && videoQuality !== "audio-only") {
              event.target.setPlaybackQuality(videoQuality);
            }
          }
          event.target.mute();
          event.target.playVideo();
        },
        onStateChange: (event) => {
          if (!isCurrent()) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            if (!hasUnmutedOnce) {
              hasUnmutedOnce = true;
              if (key === activeDeckRef.current) {
                event.target.unMute();
                event.target.setVolume(100);
              }
            }
            if (key === activeDeckRef.current) setPlayerError("");
            onFirstPlaying?.(event.target);
          }
          if (key !== activeDeckRef.current) return;
          if (event.data === window.YT.PlayerState.PLAYING) dispatch(playPause(true));
          if (event.data === window.YT.PlayerState.PAUSED) dispatch(playPause(false));
          if (event.data === window.YT.PlayerState.ENDED && !crossfadeInProgressRef.current) handleNext();
        },
        onAutoplayBlocked: () => {
          if (!isCurrent()) return;
          if (key === activeDeckRef.current) {
            dispatch(playPause(false));
          } else {
            crossfadeInProgressRef.current = false;
            destroyDeck(key);
          }
        },
        onError: (event) => {
          if (!isCurrent()) return;
          if (key === activeDeckRef.current) {
            setPlayerError(playerErrorMessage(event.data));
            dispatch(playPause(false));
          } else {
            crossfadeInProgressRef.current = false;
            destroyDeck(key);
          }
        },
      },
    });
    deckPlayerRefs[key].current = player;
    return player;
  };

  const completeCrossfade = (outgoingKey, incomingKey, nextVideo) => {
    const incomingPlayer = deckPlayerRefs[incomingKey].current;
    incomingPlayer?.setVolume?.(100);
    destroyDeck(outgoingKey);
    activeDeckRef.current = incomingKey;
    setActiveDeck(incomingKey);
    setFadeProgress(0);
    crossfadeInProgressRef.current = false;
    handledVideoIdRef.current = nextVideo.id;
    setCurrentTime(0);
    setDuration(incomingPlayer?.getDuration?.() || 0);
    dispatch(setYoutubeVideo(nextVideo));
  };

  const runCrossfadeRamp = (outgoingKey, incomingKey, nextVideo, durationSeconds) => {
    const totalMs = Math.max(500, durationSeconds * 1000);
    const startedAt = performance.now();
    const outgoingGeneration = deckGenerationRef.current[outgoingKey];
    const incomingGeneration = deckGenerationRef.current[incomingKey];

    const step = () => {
      if (
        deckGenerationRef.current[outgoingKey] !== outgoingGeneration ||
        deckGenerationRef.current[incomingKey] !== incomingGeneration
      ) {
        crossfadeInProgressRef.current = false;
        return;
      }
      const progress = Math.min(1, (performance.now() - startedAt) / totalMs);
      // Equal-power curve avoids the perceived volume dip of a plain linear fade.
      deckPlayerRefs[outgoingKey].current?.setVolume?.(Math.round(Math.cos((progress * Math.PI) / 2) * 100));
      deckPlayerRefs[incomingKey].current?.setVolume?.(Math.round(Math.sin((progress * Math.PI) / 2) * 100));
      setFadeProgress(progress);

      if (progress >= 1) {
        completeCrossfade(outgoingKey, incomingKey, nextVideo);
        return;
      }
      crossfadeTimerRef.current = window.setTimeout(step, 100);
    };
    step();
  };

  const startCrossfade = (nextVideo, durationSeconds) => {
    crossfadeInProgressRef.current = true;
    const outgoingKey = activeDeckRef.current;
    const incomingKey = otherDeck(outgoingKey);
    mountDeck(incomingKey, nextVideo.id, {
      onFirstPlaying: (incomingPlayer) => {
        incomingPlayer.unMute();
        incomingPlayer.setVolume(0);
        runCrossfadeRamp(outgoingKey, incomingKey, nextVideo, durationSeconds);
      },
    });
  };

  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      setApiReady(true);
    };
    return () => {
      window.onYouTubeIframeAPIReady = previousReady;
    };
  }, []);

  useEffect(() => {
    if (!video || !apiReady) return;

    // The crossfade engine already loaded and is playing this exact track; just adopt it.
    if (handledVideoIdRef.current === video.id) {
      handledVideoIdRef.current = null;
      return;
    }

    cancelCrossfade();
    setExpanded(false);
    setPlayerError("");
    setCurrentTime(0);
    setDuration(0);
    destroyDeck("A");
    destroyDeck("B");
    activeDeckRef.current = "A";
    setActiveDeck("A");
    mountDeck("A", video.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, apiReady]);

  useEffect(() => () => {
    cancelCrossfade();
    destroyDeck("A");
    destroyDeck("B");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tickRef.current = () => {
      const activePlayer = getActivePlayer();
      if (!activePlayer?.getCurrentTime) return;
      const time = activePlayer.getCurrentTime();
      const dur = activePlayer.getDuration();
      setCurrentTime(time);
      setDuration(dur);

      if (!isPlaying || crossfadeInProgressRef.current || transitionMode === "off" || !crossfadeSeconds || !dur) return;
      const remaining = dur - time;
      if (remaining > crossfadeSeconds || remaining <= 0.3) return;
      const index = queue.findIndex((item) => item.id === video?.id);
      const nextVideo = queue[index + 1];
      if (!nextVideo) return;
      startCrossfade(nextVideo, Math.min(crossfadeSeconds, Math.max(remaining, 1)));
    };
  });

  // Keeps the queue from running dry: pulls in more songs by the same channel once only one track is left.
  useEffect(() => {
    if (!video || autoExtendingRef.current || autoExtendedForRef.current === video.id) return;
    const index = queue.findIndex((item) => item.id === video.id);
    if (index === -1 || index < queue.length - 1) return;

    autoExtendedForRef.current = video.id;
    autoExtendingRef.current = true;
    (async () => {
      try {
        const response = await fetch(`/api/youtube-search?type=video&q=${encodeURIComponent(video.channel || video.title)}`);
        const data = response.ok ? await response.json() : null;
        const existingIds = new Set(queue.map((item) => item.id));
        const extras = (data?.results || []).filter((item) => !existingIds.has(item.id)).slice(0, 5);
        if (extras.length > 0) dispatch(appendToQueue(extras));
      } catch (error) {
        // Silent: running out of extra tracks isn't worth surfacing to the user.
      } finally {
        autoExtendingRef.current = false;
      }
    })();
  }, [video, queue, dispatch]);

  const handleAddSearch = async (event) => {
    event.preventDefault();
    if (!addQuery.trim() || addSearching) return;
    setAddSearching(true);
    try {
      const response = await fetch(`/api/youtube-search?type=video&q=${encodeURIComponent(addQuery.trim())}`);
      const data = response.ok ? await response.json() : null;
      setAddResults((data?.results || []).slice(0, 6));
    } catch (error) {
      setAddResults([]);
    } finally {
      setAddSearching(false);
    }
  };

  const handleAddTrack = (track) => {
    dispatch(addToQueue(track));
    setAddResults((current) => current.filter((item) => item.id !== track.id));
  };

  useEffect(() => {
    const interval = window.setInterval(() => tickRef.current(), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (crossfadeInProgressRef.current) abortCrossfade();
    const player = getActivePlayer();
    if (!player?.getPlayerState) return;
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handlePlayPause = () => {
    abortCrossfade();
    const player = getActivePlayer();
    if (!player?.playVideo) return;

    if (isPlaying) {
      player.pauseVideo();
      return;
    }

    player.unMute?.();
    player.setVolume?.(100);
    player.playVideo();
  };

  const handleNext = () => {
    const index = queue.findIndex((item) => item.id === video?.id);
    const nextVideo = queue[index + 1];
    if (nextVideo) dispatch(setYoutubeVideo(nextVideo));
  };

  const seekBy = (amount) => {
    abortCrossfade();
    getActivePlayer()?.seekTo?.(Math.max(0, currentTime + amount), true);
  };

  const handleSeek = (event) => {
    abortCrossfade();
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    getActivePlayer()?.seekTo?.(nextTime, true);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!video) return;
      const target = event.target;
      const isTypingTarget = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        handlePlayPause();
      } else if (event.key === "m" || event.key === "M") {
        const player = getActivePlayer();
        if (!player) return;
        if (player.isMuted?.()) player.unMute?.();
        else player.mute?.();
      } else if (event.key === "f" || event.key === "F" || event.key === "v" || event.key === "V") {
        if (!dataSaver && !audioOnly) setExpanded((value) => !value);
      } else if (event.key === "j" || event.key === "J") {
        seekBy(-10);
      } else if (event.key === "l" || event.key === "L") {
        seekBy(10);
      } else if (event.shiftKey && (event.key === "N" || event.key === "n")) {
        handleNext();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });


  if (!video) return null;

  const videoVisible = !dataSaver && !audioOnly;
  const outgoingOpacity = 1 - fadeProgress;
  const incomingOpacity = fadeProgress;

  const toggleExpanded = () => {
    if (dataSaver || audioOnly) return;
    setExpanded((value) => !value);
  };

  return (
    <div
      className={expanded && !dataSaver && !audioOnly ? "fixed inset-0 z-[70] flex min-h-screen w-screen flex-col bg-black" : "relative flex w-full items-center gap-2 border-t border-white/10 bg-[#07121d]/95 px-4 py-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-8"}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={expanded && videoVisible ? "absolute inset-0 overflow-hidden bg-black" : videoVisible ? "relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-white/10 sm:w-40" : "pointer-events-none absolute -left-[10000px] top-0 h-[200px] w-[356px] overflow-hidden"}>
        {["A", "B"].map((key) => (
          <div
            key={key}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: key === activeDeck ? outgoingOpacity : incomingOpacity }}
          >
            <div ref={deckHostRefs[key]} className="h-full w-full" />
          </div>
        ))}
        {playerError && (
          <div className="absolute inset-0 z-10 grid place-content-center bg-black/90 p-3 text-center">
            <p className="text-xs font-medium text-white">{playerError}</p>
            <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" className="mt-2 text-xs font-semibold text-[#00e6e6] hover:underline">Open on YouTube</a>
          </div>
        )}
      </div>
      {expanded && !dataSaver && !audioOnly && <div className="pointer-events-none absolute left-5 top-5 z-10"><p className="text-xs uppercase tracking-widest text-[#00e6e6]">Now playing</p><p className="mt-2 max-w-[70vw] truncate text-lg font-semibold text-white">{video.title}</p><p className="text-sm text-gray-300">{video.channel}</p></div>}
      <div className={expanded && !dataSaver && !audioOnly ? "hidden" : "flex min-w-0 flex-1 items-center gap-3"}>
        {!videoVisible && (
          <img
            src={video.thumbnail}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:h-12 sm:w-12"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{video.title}</p>
          <p className="mt-1 truncate text-xs text-gray-400">{video.channel}</p>
        </div>
      </div>
      <div className={expanded && !dataSaver && !audioOnly ? "absolute inset-x-0 bottom-4 z-10 mx-auto flex w-[min(80vw,720px)] flex-col items-center gap-2" : "contents"}>
        <div className={expanded && !dataSaver && !audioOnly ? "flex items-center gap-1 rounded-full bg-black/70 px-3 py-2 text-gray-200 backdrop-blur" : "flex shrink-0 items-center gap-1 text-gray-200"}>
          <button type="button" aria-label="Seek back 10 seconds" title="Back 10 seconds" onClick={() => seekBy(-10)} className="rounded-full p-2 hover:bg-white/10"><FiRotateCcw /></button>
          <button type="button" aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"} onClick={handlePlayPause} className="rounded-full bg-[#00e6e6] p-2 text-black hover:scale-105">{isPlaying ? <FiPause /> : <FiPlay />}</button>
          <button type="button" aria-label="Seek forward 10 seconds" title="Forward 10 seconds" onClick={() => seekBy(10)} className="rounded-full p-2 hover:bg-white/10"><FiRotateCw /></button>
        </div>
        <div className={expanded && !dataSaver && !audioOnly ? "w-full" : "min-w-0 flex-1 sm:max-w-xl"}>
          <input aria-label="YouTube song progress" type="range" min="0" max={duration || 0} value={Math.min(currentTime, duration || 0)} onChange={handleSeek} className="w-full accent-[#00e6e6]" />
          <div className="flex justify-between text-[10px] text-gray-400"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>
      </div>
      {!expanded && <FavouriteTrackButton track={video} />}
      <div className={expanded && !dataSaver && !audioOnly ? "absolute right-5 top-5 z-10 flex items-center gap-2" : "relative flex items-center gap-2"}>
        <button type="button" aria-expanded={showQueue} onClick={() => setShowQueue((value) => !value)} className={expanded && !dataSaver && !audioOnly ? "flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-gray-300 hover:bg-white/10" : "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10"}>Next up {showQueue ? <FiChevronDown /> : <FiChevronUp />}</button>
        <button type="button" aria-label={expanded ? "Minimize video" : "Expand video"} title={expanded ? "Minimize video" : "Expand video"} onClick={toggleExpanded} disabled={dataSaver || audioOnly} className={expanded && !dataSaver && !audioOnly ? "rounded-full bg-black/60 p-2 text-white hover:bg-white/10 disabled:opacity-40" : "rounded-full p-2 text-gray-300 hover:bg-white/10 disabled:opacity-40"}>{expanded ? <FiMinimize2 /> : <FiMaximize2 />}</button>
        <button
          type="button"
          aria-label="Close YouTube player"
          title="Close YouTube player"
          onClick={() => dispatch(setYoutubeVideo(null))}
          className={expanded && !dataSaver && !audioOnly ? "rounded-full bg-black/60 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white" : "rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"}
        >
          <FiX size={18} />
        </button>
        {showQueue && (
          <div className={expanded && !dataSaver && !audioOnly ? "absolute right-0 top-full mt-2 w-[min(92vw,360px)] rounded-xl border border-white/10 bg-[#07121d] p-3 shadow-2xl" : "absolute bottom-full right-0 mb-2 w-[min(92vw,360px)] rounded-xl border border-white/10 bg-[#07121d] p-3 shadow-2xl"}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#00e6e6]">Next up</p>
            <div className="max-h-64 overflow-y-auto">
              {queue.slice(queue.findIndex((item) => item.id === video.id) + 1, queue.findIndex((item) => item.id === video.id) + 4).map((item) => (
                <button key={item.id} type="button" onClick={() => dispatch(setYoutubeVideo(item))} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10"><img src={item.thumbnail} alt="" className="h-9 w-9 rounded object-cover" /><span className="truncate text-xs text-white">{item.title}</span></button>
              ))}
            </div>
            <form onSubmit={handleAddSearch} className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              <input
                type="text"
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="Add a song to queue..."
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-[#00e6e6]"
              />
              <button type="submit" aria-label="Search" disabled={addSearching} className="shrink-0 rounded-md bg-white/10 p-1.5 text-gray-200 hover:bg-white/20 disabled:opacity-50">
                <FiSearch className="h-4 w-4" />
              </button>
            </form>
            {addResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                {addResults.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/10">
                    <img src={item.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-white">{item.title}</span>
                    <button type="button" aria-label={`Add ${item.title} to queue`} onClick={() => handleAddTrack(item)} className="shrink-0 rounded-full bg-[#00e6e6]/20 p-1 text-[#00e6e6] hover:bg-[#00e6e6]/30">
                      <FiPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

