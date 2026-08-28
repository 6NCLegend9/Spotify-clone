import { useRef, useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useMusicVideo } from "../hooks/useMusicVideo";
import { Icon } from "./Icon";

function getEmbedUrl(videoId, autoPlay = false) {
  const parameters = new URLSearchParams({ playsinline: "1", rel: "0", enablejsapi: "1", cc_load_policy: "1", cc_lang_pref: "en" });
  if (autoPlay) parameters.set("autoplay", "1");
  if (typeof window !== "undefined") parameters.set("origin", window.location.origin);
  return `https://www.youtube.com/embed/${videoId}?${parameters}`;
}

export function VideoPanel({ track, autoPlay = false }) {
  const videoRef = useRef(null);
  const { videoMuted, setVideoMuted } = usePlayer();
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const hasLocalVideo = Boolean(track?.videoUrl);
  const { video: musicVideo, loading, error: lookupError } = useMusicVideo(track, !hasLocalVideo);

  if (!hasLocalVideo && loading) return <section className="video-unavailable"><span className="kicker">MUSIC VIDEO</span><p>Finding a matching YouTube music video...</p></section>;
  if (!hasLocalVideo && !musicVideo) return <section className="video-unavailable"><span className="kicker">MUSIC VIDEO</span><p>{lookupError || "No matching music video is available for this track."}</p></section>;

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) {
        await video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    } catch {
      setError("The video could not be started on this device.");
    }
  };

  if (!hasLocalVideo) return <section className="video-panel" aria-label={`Music video for ${track.title}`}>
    <iframe className="youtube-embed-frame" src={getEmbedUrl(musicVideo.videoId, autoPlay)} title={`YouTube music video: ${musicVideo.title}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    <div className="youtube-embed-footer"><span>Provided by YouTube.</span></div>
  </section>;

  return <section className="video-panel" aria-label={`Video player for ${track.title}`}>
    <video ref={videoRef} poster={track.coverUrl} muted={videoMuted} preload="metadata" onError={() => setError("The video source is unavailable.")} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)}>
      <source src={track.videoUrl} />
      {track.captionUrl && <track kind="captions" src={track.captionUrl} srcLang="en" label="English captions" />}
    </video>
    <div className="video-controls"><button className="icon-button" aria-label={isPlaying ? "Pause video" : "Play video"} title={isPlaying ? "Pause video" : "Play video"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} /></button><button className="icon-button" aria-label={videoMuted ? "Unmute video" : "Mute video"} title={videoMuted ? "Unmute video" : "Mute video"} onClick={() => setVideoMuted(!videoMuted)}><Icon name={videoMuted ? "mute" : "volume"} /></button>{track.captionUrl && <span className="caption-note">Captions available</span>}</div>
    {error && <p className="inline-error">{error}</p>}
  </section>;
}