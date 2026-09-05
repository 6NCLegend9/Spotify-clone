import { FaPlayCircle } from "react-icons/fa";
import { useEffect, useState } from "react";
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";
import MediaImage from "@/components/MediaImage";
import { cleanTitle } from "@/utils/text";

const SongBar = ({ playlist, i }) => {
  const [cardColor, setCardColor] = useState([]);
  const rawTitle = playlist?.title || playlist?.name;
  const title = cleanTitle(rawTitle, "Untitled playlist");
  const rawCoverSrc =
    playlist?.image?.[1]?.url ||
    playlist?.image?.[1]?.link ||
    playlist?.image?.[2]?.url ||
    playlist?.image?.[2]?.link ||
    playlist?.image?.[0]?.url ||
    playlist?.image?.[0]?.link ||
    "";
  const coverSrc = typeof rawCoverSrc === "string" ? rawCoverSrc : "";
  const language = typeof playlist?.language === "string" ? playlist.language : "";
  const Wrapper = playlist?.id ? "a" : "div";

  useEffect(() => {
    setCardColor([]);
    if (!coverSrc) return undefined;
    let cancelled = false;
    getPixels(coverSrc, (err, pixels) => {
      if (!err && pixels?.data) {
        const data = [...pixels.data];
        const width = Math.round(Math.sqrt(data.length / 4));
        const height = width;

        extractColors({ data, width, height })
          .then((colors) => {
            if (!cancelled && Array.isArray(colors)) setCardColor(colors);
          })
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [coverSrc]);

  const hasGradient = cardColor.length >= 3;

  return (
    <Wrapper
      {...(playlist?.id
        ? {
            href: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlist.id)}`,
            rel: "noopener noreferrer",
            target: "_blank",
          }
        : {})}
      {...(!playlist?.id ? { "aria-label": `${title} is unavailable` } : {})}
    >
      <div
        className={`w-full flex flex-row items-center group bg-opacity-20 py-2 p-4 rounded-lg mb-2 ${
          playlist?.id ? "cursor-pointer" : ""
        }`}
        style={{
          background: hasGradient
            ? `linear-gradient(90deg, rgba(${cardColor[0].red}, ${cardColor[0].green}, ${cardColor[0].blue}, 0.2) 0%, rgba(${cardColor[1].red}, ${cardColor[1].green}, ${cardColor[1].blue}, 0.3) 5%,
                rgba(${cardColor[2].red}, ${cardColor[2].green}, ${cardColor[2].blue}, 0.2) 100%)`
            : undefined,
        }}
      >
        {Number.isInteger(i) ? (
          <span className="mr-3 text-base font-extrabold text-white" aria-hidden="true">
            {i + 1}.
          </span>
        ) : null}
        <div className="flex-1 flex flex-row justify-between items-center">
          <MediaImage
            width={80}
            height={80}
            alt={`${title} cover`}
            src={coverSrc}
            className="h-20 w-20 rounded-lg object-cover"
          />
          <div className="flex-1 flex flex-col justify-center mx-3">
            <p className="font-semibold text-base w-40 lg:text-xl text-white truncate md:w-full">
              {title}
            </p>
            {language ? (
              <p className="mt-1 text-sm capitalize text-gray-300 md:text-base">{language}</p>
            ) : null}
          </div>
        </div>
        <FaPlayCircle
          aria-hidden="true"
          size={35}
          className="text-gray-300 group-hover:scale-125 transform transition-all duration-300 ease-in-out"
        />
      </div>
    </Wrapper>
  );
};

export default SongBar;
