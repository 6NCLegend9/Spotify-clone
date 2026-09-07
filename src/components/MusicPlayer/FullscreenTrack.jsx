import Lyrics from "./Lyrics";
import { useDispatch, useSelector } from "react-redux";
import { setFullScreen } from "@/redux/features/playerSlice";
import { updateSetting, EQ_PRESETS } from "@/redux/features/settingsSlice";
import { useSwipeable } from "react-swipeable";
import { cleanTitle } from "@/utils/text";

const FullscreenTrack = ({
  fullScreen,
  activeSong,
  handlePrevSong,
  handleNextSong,
  currentTime = 0,
  duration = 0,
  onSeek,
}) => {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);
  const handlers = useSwipeable({
    onSwipedLeft: () => handleNextSong(),
    onSwipedRight: () => handlePrevSong(),
    onSwipedDown: () => dispatch(setFullScreen(false)),
    preventDefaultTouchmoveEvent: true,
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  const primaryArtists = Array.isArray(activeSong?.artists?.primary)
    ? activeSong.artists.primary
    : Array.isArray(activeSong?.artists)
    ? activeSong.artists
    : [];
  const artistDisplay =
    primaryArtists
      .map((artist) => artist?.name?.trim())
      .filter(Boolean)
      .join(", ") ||
    (typeof activeSong?.artists === "string" && activeSong.artists.trim()
      ? activeSong.artists
      : "Artist");

  return (
    <div
      className={`${
        fullScreen ? "block" : "hidden"
      } w-full flex lg:h-full mr-auto flex-col mt-10 min-[1180px]:flex-row max-[1180px]:items-center min-[1180px]:justify-between max-w-7xl`}
    >
      <div className="flex flex-col h-full min-[1180px]:ml-[185px] w-fit items-center">
        <div
          {...handlers}
          className=" h-72 w-72 sm:h-80 sm:w-80 min-[1180px]:h-full min-[1180px]:w-[400px] sm:mt-5 "
        >
          <img
            src={activeSong?.image?.[2]?.url || activeSong?.image?.[1]?.url || activeSong?.image?.[0]?.url || ""}
            alt="cover art"
            className="h-full w-full rounded-2xl object-cover"
          />
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full select-none cursor-pointer text-center my-5"
        >
          <p className="truncate text-white font-bold text-2xl mx-3 mb-1">
            {cleanTitle(activeSong?.name, "Song")}
          </p>
          <p className="truncate text-gray-300">
            {artistDisplay}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <span className="font-semibold text-[#9aa8b5]">EQ Preset:</span>
            <select
              value={settings?.eqPreset || "Flat / Neutral"}
              onChange={(e) => dispatch(updateSetting({ key: "eqPreset", value: e.target.value }))}
              className="rounded-full border border-white/15 bg-[#07121d] px-3 py-1 text-xs font-semibold text-[#00e6e6] outline-none transition hover:border-[#00e6e6]"
            >
              {EQ_PRESETS.map((preset) => (
                <option key={preset} value={preset} className="bg-[#07121d] text-white">
                  {preset}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-col items-center min-[1180px]:flex hidden"
      >
        <Lyrics
          activeSong={activeSong}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
};

export default FullscreenTrack;
