import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function getEmbedUrl(videoId) {
  const parameters = new URLSearchParams({ playsinline: "1", rel: "0", enablejsapi: "1", cc_load_policy: "1", cc_lang_pref: "en" });
  if (typeof window !== "undefined") parameters.set("origin", window.location.origin);
  return `https://www.youtube.com/embed/${videoId}?${parameters}`;
}

export function YouTubeVideoDetail() {
  const { params } = useHashRoute();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showVideo, setShowVideo] = useState(true);
  const videoId = params.id || "";

  useEffect(() => {
    let active = true;
    setShowVideo(true);
    if (!VIDEO_ID_PATTERN.test(videoId)) {
      setLoading(false);
      setError("This YouTube video could not be found.");
      return () => { active = false; };
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/youtube/videos/${videoId}`);
        if (!active) return;
        setVideo(response.data || null);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message || "YouTube video is unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [videoId]);

  if (loading) return <div className="youtube-video-detail reveal"><div className="youtube-video-detail-hero skeleton-summary" /><div className="youtube-embed-panel skeleton-cover" /></div>;
  if (error || !video) return <div className="empty-state reveal"><h1>Video unavailable</h1><p>{error || "This YouTube video could not be loaded."}</p><button className="secondary-button" onClick={() => navigate("/search")}>Back to search</button></div>;

  return <div className="youtube-video-detail reveal">
    <section className="youtube-video-detail-hero"><span className="kicker">YOUTUBE</span><h1>{video.title}</h1><p>{video.artistName}</p><small>{Number(video.durationSec) > 0 ? formatDuration(video.durationSec) : "Video"}</small><button type="button" className={`secondary-button music-video-toggle ${showVideo ? "is-selected" : ""}`} aria-pressed={showVideo} onClick={() => setShowVideo((value) => !value)}><Icon name="video" />{showVideo ? "Hide music video" : "Show music video"}</button></section>
    {showVideo ? <section className="youtube-embed-panel" aria-label={`YouTube video player for ${video.title}`}>
      <iframe className="youtube-embed-frame" src={getEmbedUrl(video.videoId)} title={`YouTube video: ${video.title}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      <div className="youtube-embed-footer"><span>Captions are available when provided by YouTube.</span></div>
    </section> : <section className="video-unavailable"><span className="kicker">MUSIC VIDEO</span><p>The music video is hidden.</p></section>}
  </div>;
}