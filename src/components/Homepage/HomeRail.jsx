"use client";

import { useRef } from "react";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { BsPlayFill } from "react-icons/bs";
import MediaImage from "@/components/MediaImage";
import AddToQueueButton from "@/components/AddToQueueButton";
import MixCard from "./MixCard";
import { playHomeTracks } from "@/utils/playHome";
import { cleanTitle } from "@/utils/text";
import useHorizontalRail from "@/hooks/useHorizontalRail";

export function HomeRail({ title, children, seeAllHref }) {
  const railRef = useRef(null);
  useHorizontalRail(railRef);
  if (!children) return null;
  return (
    <section className="home-rail-wrap">
      {title ? (
        <div className="home-rail-heading">
          {seeAllHref ? (
            <h2 className="home-rail-title">
              <Link href={seeAllHref} className="home-rail-title-link">{title}</Link>
            </h2>
          ) : (
            <h2 className="home-rail-title">{title}</h2>
          )}
          {seeAllHref ? (
            <Link href={seeAllHref} className="home-rail-all">Show all</Link>
          ) : null}
        </div>
      ) : null}
      <div
        ref={railRef}
        className="home-rail"
        tabIndex={0}
        role="region"
        aria-label={title ? `${title} carousel` : "Carousel"}
      >
        {children}
      </div>
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
  const play = () => playHomeTracks(dispatch, list, index >= 0 ? index : 0);

  return (
    <div className="home-shelf-card group relative w-full text-left">
      <button type="button" onClick={play} aria-label={`Play ${title}`} className="block w-full text-left">
        <span className="home-square">
          <MediaImage src={cover} size="hq" alt="" className="h-full w-full object-cover" />
          <span className="home-square-play max-md:hidden">
            <BsPlayFill aria-hidden="true" className="text-xl" />
          </span>
        </span>
        <span className="home-shelf-title">{title}</span>
        {video.kicker ? <span className="home-shelf-kicker">{video.kicker}</span> : null}
        {subtitle ? <span className="home-shelf-subtitle">{subtitle}</span> : null}
      </button>
      <AddToQueueButton track={video} className="absolute right-1 top-1 z-20 rounded-full bg-[var(--navy-deep)]/90 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100" />
    </div>
  );
}

export function MixRail({ title, mixes, seeAllHref }) {
  if (!mixes?.length) return null;
  return (
    <HomeRail title={title} seeAllHref={seeAllHref}>
      {mixes.map((mix) => (
        <div key={mix.id} className="home-rail-card">
          <div className="home-shelf-card">
            <MixCard mix={mix} />
          </div>
        </div>
      ))}
    </HomeRail>
  );
}

export function TrackRail({ title, videos, seeAllHref }) {
  if (!videos?.length) return null;
  return (
    <HomeRail title={title} seeAllHref={seeAllHref}>
      {videos.map((video) => (
        <div key={video.id} className="home-rail-card">
          <HomeSquareCard video={video} queue={videos} />
        </div>
      ))}
    </HomeRail>
  );
}
