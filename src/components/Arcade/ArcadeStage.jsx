"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { JAM_REMOTE_PLAYBACK_EVENT } from "@/utils/jam.mjs";
import { playPause, setYoutubeVideo } from "@/redux/features/playerSlice";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import { cleanTitle } from "@/utils/text";

// Three.js is only fetched if someone actually picks the 3D runner.
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

export default function ArcadeStage() {
  const dispatch = useDispatch();
  const analyzer = useAudioAnalyzer();
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);

  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const resumeOnExitRef = useRef(false);
  const mainVideoIdRef = useRef(null);

  // Redux alone does not stop the YouTube frame: it only pauses itself when the
  // user pressed its own button, so drive it through the remote playback event.
  const controlMainPlayer = useCallback((shouldPlay) => {
    dispatch(playPause(shouldPlay));
    const videoId = mainVideoIdRef.current;
    if (!videoId || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(JAM_REMOTE_PLAYBACK_EVENT, { detail: { videoId, isPlaying: shouldPlay } }),
    );
  }, [dispatch]);

  const [step, setStep] = useState("select");
  const [game, setGame] = useState("tiles");
  const [trackLabel, setTrackLabel] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [result, setResult] = useState(null);
  const [roundKey, setRoundKey] = useState(0);

  // Pause the main player on entry without touching the queue, index, or progress.
  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    resumeOnExitRef.current = isPlaying;
    mainVideoIdRef.current = youtubeVideo?.id || null;
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

  // Hidden tabs stop firing animation frames while audio keeps going, so hold
  // the track too and the round stays in sync when the player comes back.
  useEffect(() => {
    const onVisibility = () => {
      const audio = audioRef.current;
      if (!audio || !audio.getAttribute("src")) return;
      if (document.hidden) audio.pause();
      else if (step === "playing") audio.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [step]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const pickFile = useCallback((file) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setTrackLabel(file.name.replace(/\.[^.]+$/, ""));
    // Silence anything still coming from the main player before the file starts.
    controlMainPlayer(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    analyzer.attach(audio);
  }, [analyzer, controlMainPlayer]);

  // An app track keeps playing through the normal player, so the round runs on tempo.
  const pickTrack = useCallback((track) => {
    analyzer.release();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    setTrackLabel(cleanTitle(track.title, "Untitled track"));
    resumeOnExitRef.current = true;
    mainVideoIdRef.current = track.id;
    dispatch(setYoutubeVideo(track));
    dispatch(playPause(true));
  }, [analyzer, dispatch]);

  const start = useCallback(() => {
    setResult(null);
    setRoundKey((value) => value + 1);
    setStep("playing");
    analyzer.resume();
    const audio = audioRef.current;
    if (audio?.getAttribute("src")) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, [analyzer]);

  const endRound = useCallback((summary) => {
    audioRef.current?.pause?.();
    setResult(summary || { score: 0 });
  }, []);

  const backToSelect = useCallback(() => {
    audioRef.current?.pause?.();
    setResult(null);
    setStep("select");
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const activeGame = getArcadeGame(game);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex flex-col bg-[#04070d]">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
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
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="icon-btn h-11 w-11 shrink-0"
          aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
          title={isFullscreen ? "Exit full screen" : "Enter full screen"}
        >
          {isFullscreen ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {step === "select" ? (
          <ArcadeGameSelect onSelect={(id) => { setGame(id); setStep("ready"); }} />
        ) : null}

        {step === "ready" ? (
          <HowToPlayOverlay mode={game} onStart={start} canStart={Boolean(trackLabel)}>
            <ArcadeSongPicker
              onPickFile={pickFile}
              onPickTrack={pickTrack}
              selectedLabel={trackLabel}
              analyzerMode={analyzer.mode}
            />
            {!trackLabel ? (
              <p className="mt-3 text-[11px] text-[#ffb648]">Pick some music to enable the start button.</p>
            ) : null}
          </HowToPlayOverlay>
        ) : null}

        {step === "playing" ? (
          <>
            {game === "tiles" ? <MagicTiles2D key={roundKey} analyzer={analyzer} running reducedMotion={reducedMotion} onGameOver={endRound} /> : null}
            {game === "invaders" ? <WaveInvaders2D key={roundKey} analyzer={analyzer} running reducedMotion={reducedMotion} onGameOver={endRound} /> : null}
            {game === "runner" ? <BeatRunner3D key={roundKey} analyzer={analyzer} running reducedMotion={reducedMotion} onGameOver={endRound} /> : null}
            {result ? (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[#04070d]/92 p-6 text-center">
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

      {/* Same-origin blob audio is what makes real frequency analysis possible. */}
      <audio ref={audioRef} loop className="hidden" />
    </div>
  );
}
