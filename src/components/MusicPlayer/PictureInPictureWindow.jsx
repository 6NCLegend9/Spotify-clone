"use client";

import { createPortal } from "react-dom";
import { FiPause, FiPlay, FiRotateCcw, FiRotateCw, FiX } from "react-icons/fi";
import { MdSkipNext } from "react-icons/md";
import { activeLyricIndex } from "@/utils/lyricsLookup";
import { THUMB_FALLBACK } from "@/utils/imageOptimize";
import ArtistNameLink from "@/components/ArtistNameLink";
import { cleanTitle } from "@/utils/text";

const handleThumbError = (event) => {
  if (event.currentTarget.src !== THUMB_FALLBACK) {
    event.currentTarget.src = THUMB_FALLBACK;
  }
};

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function PictureInPictureWindow({
  container,
  video,
  currentTime,
  duration,
  isPlaying,
  lines = [],
  queue = [],
  onPlayPause,
  onSeekBy,
  onNext,
  onSelect,
  onClose,
}) {
  if (!container || !video) return null;
  const activeIndex = activeLyricIndex(lines, currentTime);
  const currentLine = lines[activeIndex]?.text;
  const nextLine = lines[activeIndex + 1]?.text;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return createPortal(
    <div className="yt-pip-doc">
      <img src={video.thumbnail || THUMB_FALLBACK} alt="" onError={handleThumbError} className="yt-pip-doc-art" />
      <div className="yt-pip-doc-shade" />
      <div className="yt-pip-doc-body">
        <div className="yt-pip-doc-top">
          <p className="yt-pip-kicker">Now playing</p>
          <button type="button" aria-label="Close picture in picture" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <p className="yt-pip-title">{cleanTitle(video.title)}</p>
        <ArtistNameLink channelId={video.channelId} name={cleanTitle(video.channel)} className="yt-pip-artist" />
        <div className="yt-pip-lyric">
          <p className="yt-pip-lyric-now">{currentLine || ""}</p>
          {nextLine && <p className="yt-pip-lyric-next">{nextLine}</p>}
        </div>
        <div className="yt-pip-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="yt-pip-times">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="yt-pip-controls">
          <button type="button" aria-label="Back 10 seconds" onClick={() => onSeekBy(-10)}><FiRotateCcw /></button>
          <button type="button" aria-label={isPlaying ? "Pause" : "Play"} className="yt-pip-play" onClick={onPlayPause}>
            {isPlaying ? <FiPause /> : <FiPlay />}
          </button>
          <button type="button" aria-label="Forward 10 seconds" onClick={() => onSeekBy(10)}><FiRotateCw /></button>
          <button type="button" aria-label="Next song" onClick={onNext}><MdSkipNext /></button>
        </div>
        {queue.length > 0 && (
          <div className="yt-pip-queue">
            <p className="yt-pip-kicker">Queue</p>
            {queue.slice(0, 5).map((item) => (
              <div key={item.queueEntryId || item.id} className="yt-pip-queue-item">
                <button type="button" className="yt-pip-queue-play" onClick={() => onSelect?.(item)}>
                  <img src={item.thumbnail || THUMB_FALLBACK} alt="" onError={handleThumbError} />
                  <span>{cleanTitle(item.title)}</span>
                </button>
                <ArtistNameLink channelId={item.channelId} name={cleanTitle(item.channel)} className="yt-pip-queue-artist" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    container,
  );
}

export const PIP_DOCUMENT_STYLES = `
  html, body { margin: 0; height: 100%; background: #020813; color: #f4f7fb; font-family: Poppins, system-ui, sans-serif; overflow: hidden; }
  * { box-sizing: border-box; }
  .yt-pip-doc { position: relative; height: 100%; min-height: 100%; overflow: hidden; }
  .yt-pip-doc-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(18px) saturate(1.15); transform: scale(1.15); }
  .yt-pip-doc-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(2,8,19,.55), rgba(2,8,19,.88)); }
  .yt-pip-doc-body { position: relative; z-index: 1; display: flex; height: 100%; flex-direction: column; padding: 12px 14px 10px; }
  .yt-pip-doc-top { display: flex; align-items: center; justify-content: space-between; }
  .yt-pip-kicker { margin: 0; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #00e6e6; }
  .yt-pip-doc-top button, .yt-pip-controls button { appearance: none; border: 0; background: rgba(255,255,255,.08); color: #fff; border-radius: 8px; width: 48px; height: 48px; flex-shrink: 0; font-size: 20px; display: grid; place-items: center; cursor: pointer; }
  .yt-pip-title { margin: 10px 0 2px; font-size: 15px; font-weight: 700; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .yt-pip-artist { display: block; margin: 0; font-size: 12px; color: #9aa8b5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
  a.yt-pip-artist:hover { color: #00e6e6; text-decoration: underline; }
  .yt-pip-lyric { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; padding: 8px 0; }
  .yt-pip-lyric-now { margin: 0; font-size: 16px; font-weight: 650; color: #00e6e6; line-height: 1.35; }
  .yt-pip-lyric-next { margin: 8px 0 0; font-size: 12px; color: #9aa8b5; }
  .yt-pip-progress { height: 3px; border-radius: 99px; background: rgba(255,255,255,.15); overflow: hidden; }
  .yt-pip-progress span { display: block; height: 100%; background: #00e6e6; }
  .yt-pip-times { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: #9aa8b5; }
  .yt-pip-controls { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; }
  .yt-pip-play { width: 50px !important; height: 50px !important; font-size: 24px !important; background: #00e6e6 !important; color: #000 !important; }
  .yt-pip-queue { margin-top: 10px; min-height: 0; flex: 1; overflow: auto; }
  .yt-pip-queue-item { margin-top: 6px; padding: 4px; background: rgba(255,255,255,.06); border-radius: 8px; }
  .yt-pip-queue-play { display: flex; width: 100%; align-items: center; gap: 8px; border: 0; background: transparent; color: #fff; cursor: pointer; text-align: left; padding: 0; }
  .yt-pip-queue-item img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; }
  .yt-pip-queue-item span, .yt-pip-queue-artist { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yt-pip-queue-play span { min-width: 0; }
  .yt-pip-queue-artist { display: block; margin: 2px 0 0 40px; color: #9aa8b5; text-decoration: none; }
  a.yt-pip-queue-artist:hover { color: #00e6e6; text-decoration: underline; }
`;
