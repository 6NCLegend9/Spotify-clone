"use client";
import SwiperLayout from "@/components/Homepage/Swiper";
import SongCard from "@/components/Homepage/SongCard";
import SongListSkeleton from "@/components/SongListSkeleton";
import SongList from "@/components/SongsList";
import { setProgress } from "@/redux/features/loadingBarSlice";
import {
  getArtistAlbums,
  getArtistData,
  getArtistSongs,
} from "@/services/dataAPI";
import Link from "next/link";
import React from "react";
import { useEffect } from "react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { SwiperSlide } from "swiper/react";
import { useParams } from "next/navigation";

const ArtistPage = () => {
  const { artistId } = useParams();
  const dispatch = useDispatch();
  const [artistDetails, setArtistDetails] = useState({});
  const [artistSongs, setArtistSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artistAlbums, setArtistAlbums] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      dispatch(setProgress(30));
      const details = await getArtistData(artistId);
      dispatch(setProgress(60));
      setArtistDetails(details || {});
      const songs = await getArtistSongs(artistId, 1);
      dispatch(setProgress(90));
      setArtistSongs(songs);
      const albums = await getArtistAlbums(artistId, 1);
      setArtistAlbums(albums?.albums || (Array.isArray(albums) ? albums : []));
      dispatch(setProgress(100));
      setLoading(false);
    };
    fetchData();
  }, [artistId, dispatch]);

  const songsList = Array.isArray(artistSongs?.songs)
    ? artistSongs.songs
    : Array.isArray(artistSongs)
    ? artistSongs
    : [];

  const albumsList = Array.isArray(artistAlbums) ? artistAlbums : [];

  if (!loading && !artistDetails?.name) {
    return (
      <div className="page text-gray-200">
        <h1 className="text-3xl font-bold text-white">Artist unavailable</h1>
        <p className="mt-3 text-sm text-[#9aa8b5]">
          This catalog page is no longer available. Search YouTube music instead.
        </p>
        <Link href="/" className="mt-6 inline-block text-[#00e6e6] hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="flex flex-col lg:flex-row lg:items-end">
        {loading ? (
          <div
            role="status"
            className="space-y-8 animate-pulse md:space-y-0 md:space-x-8 md:flex md:items-center"
          >
            <div className="flex lg:w-[400px] lg:h-[400px] items-center justify-center w-[300px] h-[300px] bg-gray-300 dark:bg-gray-700">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
          </div>
        ) : (
          <div className=" relative">
            <img
              src={artistDetails?.image?.[2]?.url || artistDetails?.image?.[1]?.url || artistDetails?.image?.[0]?.url || ""}
              alt={artistDetails?.name}
              width={300}
              height={300}
              className="h-[300px] w-[300px] rounded-2xl object-cover shadow-2xl lg:h-[400px] lg:w-[400px]"
            />
            <div className="absolute lg:w-[400px] w-[300px] inset-0 bg-gradient-to-t from-black via-transparent"></div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-y-2 text-gray-100 lg:ml-10 lg:mt-0">
          <h1 className="text-2xl lg:text-4xl font-bold">
            {artistDetails?.name}
          </h1>
          <div className="flex gap-2 capitalize ml-2">
            <h2 className="lg:text-xl font-semibold">
              {artistDetails?.dominantType}
            </h2>
            <p className="lg:text-xl font-semibold">|</p>
            <h4 className="lg:text-xl font-semibold">
              {artistDetails?.dominantLanguage}
            </h4>
          </div>
          <ul className="flex items-center gap-3 text-gray-300">
            <li className=" text-sm lg:text-lg font-semibold">
              • {artistDetails?.fanCount || artistDetails?.followerCount || 0} listeners
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-10 text-gray-200">
        <h1 className="text-3xl font-bold">Songs</h1>
        {loading ? (
          <SongListSkeleton />
        ) : (
          <div>
            <SongList SongData={songsList} />
          </div>
        )}
      </div>

      <div className="mt-10 text-gray-200">
        <SwiperLayout title={"Albums"}>
          {albumsList.map((album, index) => (
            <SwiperSlide key={album?.id || index}>
              <SongCard song={album} />
            </SwiperSlide>
          ))}
        </SwiperLayout>
      </div>
    </div>
  );
};

export default ArtistPage;
