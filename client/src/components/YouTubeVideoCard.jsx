import { navigate } from "../hooks/useHashRoute";
import { formatDuration } from "../lib/format";
import { Icon } from "./Icon";

export function YouTubeVideoCard({ video, index = 0 }) {
  if (!video?.videoId) return null;
  const openVideo = () => navigate(`/youtube/${video.videoId}`);
  const duration = Number(video.durationSec) > 0 ? formatDuration(video.durationSec) : "Video";

  return <article className={`youtube-video-card reveal delay-${Math.min(index + 1, 3)}`}>
    <button className="youtube-video-thumbnail" aria-label={`Play ${video.title} in Musicon`} onClick={openVideo}>
      {video.coverUrl ? <img src={video.coverUrl} alt={`${video.title} video thumbnail`} /> : <span className="youtube-video-placeholder">YouTube</span>}
      <span className="youtube-video-play-mark"><Icon name="play" size={19} /></span>
    </button>
    <div className="youtube-video-copy">
      <span className="youtube-video-source">YouTube</span>
      <button className="youtube-video-title" onClick={openVideo}><h3>{video.title}</h3><p>{video.artistName}</p></button>
      <div className="youtube-video-footer"><small>{duration}</small><button className="text-button" onClick={openVideo}>Play <Icon name="video" size={15} /></button></div>
    </div>
  </article>;
}