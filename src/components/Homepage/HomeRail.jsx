"use client";

import { useDispatch } from "react-redux";
import { BsPlayFill } from "react-icons/bs";
import MediaImage from "@/components/MediaImage";
import MixCard from "./MixCard";
import { playHomeTracks } from "@/utils/playHome";
import { cleanTitle } from "@/utils/text";

export function HomeRail({ title, children }) {
  if (!children) return null;
  return (
    <section className="home-rail-wrap">
      {title ? <h2 className="home-rail-title">{title}</h2> : null}
      <div className="home-rail no-scrollbar">{children}</div>
    </section>
  );
}

export function HomeSquareCard({ video, queue }) {
  const dispatch = useDispatch();
  if (!video?.id) return null;
  const title = cleanTitle(video.title || video.name, "Track");
  const subtitle = cleanTitle(video.channel || video.primaryArtists || "", "");
  const cover =
    video.thumbnail ||
    video.image?.[2]?.url ||
    video.image?.[1]?.url ||
    video.image?.[0]?.url ||
    "";

  const list = queue?.length ? queue : [video];
  const index = list.findIndex((item) => item?.id === video.id);

  return (
    <button
      type="button"
      onClick={() => playHomeTracks(dispatch, list, index >= 0 ? index : 0)}
      aria-label={`Play ${title}`}
      className="group w-full text-left"
    >
      <span className="home-square">
        <MediaImage src={cover} size="hq" alt="" className="h-full w-full object-cover" />
        <span className="home-square-play max-md:hidden">
          <BsPlayFill aria-hidden="true" className="text-xl" />
        </span>
      </span>
      <span className="mt-2 block line-clamp-2 text-sm font-bold text-white">{title}</span>
      {subtitle ? (
        <span className="mt-0.5 block truncate text-xs text-[#9aa8b5]">{subtitle}</span>
      ) : null}
    </button>
  );
}

export function MixRail({ title, mixes }) {
  if (!mixes?.length) return null;
  return (
    <HomeRail title={title}>
      {mixes.map((mix) => (
        <div key={mix.id} className="home-rail-card">
          <MixCard mix={mix} />
        </div>
      ))}
    </HomeRail>
  );
}

export function TrackRail({ title, videos }) {
  if (!videos?.length) return null;
  return (
    <HomeRail title={title}>
      {videos.map((video) => (
        <div key={video.id} className="home-rail-card">
          <HomeSquareCard video={video} queue={videos} />
        </div>
      ))}
    </HomeRail>
  );
}
