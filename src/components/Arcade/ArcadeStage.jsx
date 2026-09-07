"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FiArrowLeft, FiGrid, FiMaximize2, FiMinimize2 } from "react-icons/fi";
import ArcadeGameSelect from "@/components/Arcade/ArcadeGameSelect";
import ArcadeSongPicker from "@/components/Arcade/ArcadeSongPicker";
import HowToPlayOverlay from "@/components/Arcade/HowToPlayOverlay";
import MagicTiles2D from "@/components/Arcade/Rhythm/MagicTiles2D";
import WaveInvaders2D from "@/components/Arcade/2D/WaveInvaders2D";
import { getArcadeGame } from "@/components/Arcade/arcadeGames";
import useAudioAnalyzer from "@/hooks/useAudioAnalyzer";
import useArcadeClock from "@/hooks/useArcadeClock";
import {
  JAM_REMOTE_PLAYBACK_EVENT,
  JAM_REMOTE_SEEK_EVENT,
} from "@/utils/jam.mjs";
import { analyzePcm, buildRhythmChart } from "@/utils/arcadeChart.mjs";
import { playPause, setYoutubeVideo } from "@/redux/features/playerSlice";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import { parseDurationSeconds } from "@/utils/radioEngine.mjs";
import { cleanTitle } from "@/utils/text";

const BeatRunner3D = dynamic(() => import("@/components/Arcade/3D/BeatRunner3D"), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-sm text-[#9aa8b5]">Loading the grid…</p>,
});

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.a11yReducedMotion === "true"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function formatArcadeTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function ArcadeProgress({ clockRef, durationHint, active }) {
  const [progress, setProgress] = useState({ time: 0, duration: 0 });

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      const time = clockRef.current.getTime();
      const duration = clockRef.current.getDuration() || durationHint || 0;
      setProgress((current) => {
        if (Math.abs(current.time - time) < 0.2 && Math.abs(current.duration - duration) < 0.05) {
          return current;
        }
        return { time, duration };
      });
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [active, clockRef, durationHint]);

  const duration = progress.duration || durationHint || 0;
  const filled = duration > 0 ? Math.min(100, (progress.time / duration) * 100) : 0;

  return (
    <>
      <p className="shrink-0 text-[11px] tabular-nums text-[#9aa8b5]">
        {formatArcadeTime(progress.time)} / {formatArcadeTime(duration)}
      </p>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/10"
        role="progressbar"
        aria-label="Song progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(progress.time)}
        aria-valuetext={`${formatArcadeTime(progress.time)} of ${formatArcadeTime(duration)}`}
      >
        <span className="block h-full bg-[#00e6e6]" style={{ width: `${filled}%` }} />
      </div>
    </>
  );
}

async function chartFromFile(file) {
  const buffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const analysis = analyzePcm(decoded.getChannelData(0), decoded.sampleRate);
    return buildRhythmChart({
      duration: analysis.duration || decoded.duration,
      bpm: analysis.bpm,
      seed: file.name,
      title: file.name,
      lanes: 4,
      onsets: analysis.onsets,
    });
  } finally {
    context.close?.().catch(() => {});
  }
}

function chartFromTrack(track) {
  const duration = parseDurationSeconds(track) || 180;
  return buildRhythmChart({
    duration,
    seed: track?.id || track?.title || "track",
    title: track?.title || "",
    lanes: 4,
  });
}

export default function ArcadeStage() {
  const dispatch = useDispatch();
  const analyzer = useAudioAnalyzer();
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const youtubeVideoId = useSelector((state) => state.player.youtubeVideo?.id || null);

  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const resumeOnExitRef = useRef(false);
  const mainVideoIdRef = useRef(null);

  const [source, setSource] = useState("none");
  const [videoId, setVideoId] = useState("");
  const clock = useArcadeClock({ source, audioRef, videoId });
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const launchRef = useRef(-1);

  const controlMainPlayer = useCallback((shouldPlay) => {
    dispatch(playPause(shouldPlay));
    const id = mainVideoIdRef.current;
    if (!id || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(JAM_REMOTE_PLAYBACK_EVENT, { detail: { videoId: id, isPlaying: shouldPlay } }),
    );
  }, [dispatch]);

  const seekMainPlayer = useCallback((time) => {
    const id = mainVideoIdRef.current;
    if (!id || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(JAM_REMOTE_SEEK_EVENT, { detail: { videoId: id, currentTime: time } }),
    );
  }, []);

  const [portalReady, setPortalReady] = useState(false);
  const [step, setStep] = useState("select");
  const [game, setGame] = useState("tiles");
  const [trackLabel, setTrackLabel] = useState("");
  const [chart, setChart] = useState(null);
  const [chartStatus, setChartStatus] = useState("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [result, setResult] = useState(null);
  const [roundKey, setRoundKey] = useState(0);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    setPortalReady(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("arcade-open");
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("arcade-open");
    };
  }, []);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    resumeOnExitRef.current = isPlaying;
    mainVideoIdRef.current = youtubeVideoId;
    if (isPlaying) controlMainPlayer(false);
    dispatch(setIsTyping(true));
    return () => {
      dispatch(setIsTyping(false));
      if (resumeOnExitRef.current) controlMainPlayer(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      const audio = audioRef.current;
      if (source === "file" && audio?.getAttribute("src")) {
        if (document.hidden) audio.pause();
        else if (step === "playing" && !result && countdown === 0) audio.play().catch(() => {});
        return;
      }
      if (source === "youtube" && step === "playing" && !result && countdown === 0) {
        controlMainPlayer(!document.hidden);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [controlMainPlayer, countdown, result, source, step]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    if (source !== "youtube" || !chart || step === "playing") return;
    const liveDuration = clockRef.current.getDuration();
    if (liveDuration > 8 && Math.abs(liveDuration - chart.duration) > 3) {
      setChart(buildRhythmChart({
        duration: liveDuration,
        bpm: chart.bpm,
        seed: videoId || trackLabel || "track",
        title: trackLabel,
        lanes: 4,
      }));
    }
  }, [chart, source, step, trackLabel, videoId]);

  useEffect(() => {
    if (step !== "playing" || result || countdown <= 0) return undefined;
    clockRef.current.reset(0);
    if (source === "file") {
      const audio = audioRef.current;
      if (audio?.getAttribute("src")) {
        audio.currentTime = 0;
        audio.pause();
      }
    } else {
      seekMainPlayer(0);
      controlMainPlayer(false);
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 750);
    return () => window.clearTimeout(timer);
  }, [controlMainPlayer, countdown, result, seekMainPlayer, source, step]);

  useEffect(() => {
    if (step !== "playing" || result || countdown !== 0) return;
    if (launchRef.current === roundKey) return;
    launchRef.current = roundKey;
    analyzer.resume();
    clockRef.current.reset(0);
    if (source === "file") {
      const audio = audioRef.current;
      if (audio?.getAttribute("src")) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    controlMainPlayer(true);
  }, [analyzer, controlMainPlayer, countdown, result, roundKey, source, step]);

  const pickFile = useCallback(async (file) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setTrackLabel(file.name.replace(/\.[^.]+$/, ""));
    setSource("file");
    setVideoId("");
    setChartStatus("analyzing");
    controlMainPlayer(false);
    const audio = audioRef.current;
    if (audio) {
      audio.src = url;
      analyzer.attach(audio);
    }
    try {
      const nextChart = await chartFromFile(file);
      setChart(nextChart || buildRhythmChart({ seed: file.name, title: file.name }));
      setChartStatus("ready");
    } catch {
      setChart(buildRhythmChart({ seed: file.name, title: file.name }));
      setChartStatus("ready");
    }
  }, [analyzer, controlMainPlayer]);

  const pickTrack = useCallback((track) => {
    analyzer.release();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    const label = cleanTitle(track.title, "Untitled track");
    setTrackLabel(label);
    setSource("youtube");
    setVideoId(track.id);
    setChart(chartFromTrack(track));
    setChartStatus("ready");
    resumeOnExitRef.current = true;
    mainVideoIdRef.current = track.id;
    dispatch(setYoutubeVideo(track));
    dispatch(playPause(false));
  }, [analyzer, dispatch]);

  const start = useCallback(() => {
    if (!chart?.notes?.length) return;
    setResult(null);
    setRoundKey((value) => value + 1);
    setCountdown(3);
    setStep("playing");
    clock.reset(0);
  }, [chart, clock]);

  const endRound = useCallback((summary) => {
    audioRef.current?.pause?.();
    if (source === "youtube") controlMainPlayer(false);
    setResult(summary || { score: 0 });
  }, [controlMainPlayer, source]);

  const backToSelect = useCallback(() => {
    audioRef.current?.pause?.();
    if (source === "youtube") controlMainPlayer(false);
    setResult(null);
    setCountdown(0);
    setStep("select");
  }, [controlMainPlayer, source]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const activeGame = getArcadeGame(game);
  const live = step === "playing" && !result && countdown === 0;
  const gameProps = {
    analyzer,
    clock,
    chart,
    running: live,
    reducedMotion,
    onGameOver: endRound,
  };
  const stage = (
    <div ref={rootRef} className="fixed inset-0 z-[100] flex flex-col bg-[#04070d]">
      <header className="relative flex shrink-0 flex-col border-b border-white/10">
        <div className="flex items-center gap-2 px-3 py-2 pb-3 sm:px-4">
          {step === "select" ? (
            <Link href="/" className="icon-btn h-11 w-11 shrink-0" aria-label="Leave the arcade" title="Leave the arcade">
              <FiArrowLeft aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={backToSelect}
              className="icon-btn h-11 w-11 shrink-0"
              aria-label="Back to game selection"
              title="Back to game selection"
            >
              <FiGrid aria-hidden="true" />
            </button>
          )}

          <div className="mr-auto min-w-0">
            <h1 className="truncate text-sm font-bold uppercase tracking-[0.24em] text-[#00e6e6]">Beat Arcade</h1>
            {step !== "select" ? (
              <p className="truncate text-[11px] text-[#9aa8b5]">
                {activeGame.title}
                {trackLabel ? ` · ${trackLabel}` : ""}
                {chart?.bpm ? ` · ${chart.bpm} BPM` : ""}
              </p>
            ) : null}
          </div>

          {step === "playing" ? (
            <ArcadeProgress clockRef={clockRef} durationHint={chart?.duration || 0} active />
          ) : null}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="icon-btn h-11 w-11 shrink-0"
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
          >
            {isFullscreen ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {step === "select" ? (
          <ArcadeGameSelect onSelect={(id) => { setGame(id); setStep("ready"); }} />
        ) : null}

        {step === "ready" ? (
          <HowToPlayOverlay
            mode={game}
            onStart={start}
            canStart={Boolean(trackLabel) && chartStatus === "ready" && Boolean(chart?.notes?.length)}
          >
            <ArcadeSongPicker
              onPickFile={pickFile}
              onPickTrack={pickTrack}
              selectedLabel={trackLabel}
              analyzerMode={analyzer.mode}
              chart={chart}
              chartStatus={chartStatus}
            />
            {chartStatus === "analyzing" ? (
              <p className="mt-3 text-[11px] text-[#00e6e6]">Reading the beat from your file…</p>
            ) : null}
            {chartStatus !== "analyzing" && !trackLabel ? (
              <p className="mt-3 text-[11px] text-[#ffb648]">Pick a song so the chart can lock to it.</p>
            ) : null}
          </HowToPlayOverlay>
        ) : null}

        {step === "playing" ? (
          <>
            {game === "tiles" ? <MagicTiles2D key={roundKey} {...gameProps} /> : null}
            {game === "invaders" ? <WaveInvaders2D key={roundKey} {...gameProps} /> : null}
            {game === "runner" ? <BeatRunner3D key={roundKey} {...gameProps} /> : null}
            {countdown > 0 && !result ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-[#04070d]/70" aria-live="assertive">
                <p className="text-7xl font-black tabular-nums text-[#00e6e6]">{countdown}</p>
              </div>
            ) : null}
            {result ? (
              <div className="absolute inset-0 z-30 grid place-items-center bg-[#04070d] p-6 text-center">
                <div role="alertdialog" aria-labelledby="arcade-result-title" className="w-full max-w-xs">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ff4ecd]">Game over</p>
                  <h2 id="arcade-result-title" className="mt-3 text-4xl font-bold tabular-nums text-[#ffb648]">
                    {Number(result.score || 0).toLocaleString()}
                    {result.unit ? <span className="ml-1 text-lg">{result.unit}</span> : null}
                  </h2>
                  <p className="mt-1 text-sm text-[#9aa8b5]">{result.detail || activeGame.title}</p>
                  <button type="button" onClick={start} className="btn-primary mt-6 min-h-11 w-full">
                    Play again
                  </button>
                  <button
                    type="button"
                    onClick={backToSelect}
                    className="mt-3 min-h-11 w-full rounded-full border border-white/15 text-sm font-semibold text-gray-200 transition hover:border-[#00e6e6] hover:text-[#00e6e6]"
                  >
                    Choose another game
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );

  if (!portalReady) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-[#04070d] text-sm text-[#9aa8b5]">
        Loading the arcade…
      </div>
    );
  }

  return createPortal(stage, document.body);
}
