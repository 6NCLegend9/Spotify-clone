"use client";

import { useEffect, useState } from "react";
import { youtubeThumb } from "@/utils/imageOptimize";

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%2307121d'/%3E%3Ccircle cx='200' cy='200' r='88' fill='%2300e6e6' fill-opacity='.16'/%3E%3Cpath d='M229 114v155a42 42 0 1 1-18-34V146l95-20v109a42 42 0 1 1-18-34V104z' fill='%23a7ffff'/%3E%3C/svg%3E";

export default function MediaImage({
  src,
  alt = "",
  size = "mq",
  className = "",
  onError,
  ...props
}) {
  const optimizedSrc = youtubeThumb(src, size) || src;
  const resolved =
    typeof optimizedSrc === "string" && optimizedSrc.trim()
      ? optimizedSrc
      : FALLBACK_IMAGE;
  const [currentSrc, setCurrentSrc] = useState(resolved);

  useEffect(() => {
    setCurrentSrc(resolved);
  }, [resolved]);

  return (
    <img
      loading="lazy"
      decoding="async"
      {...props}
      src={currentSrc}
      alt={alt}
      className={className}
      onError={(event) => {
        if (typeof currentSrc === "string" && currentSrc.includes("maxresdefault.jpg")) {
          setCurrentSrc(currentSrc.replace("maxresdefault.jpg", "hqdefault.jpg"));
        } else if (typeof currentSrc === "string" && currentSrc.includes("sddefault.jpg")) {
          setCurrentSrc(currentSrc.replace("sddefault.jpg", "hqdefault.jpg"));
        } else if (currentSrc !== FALLBACK_IMAGE) {
          setCurrentSrc(FALLBACK_IMAGE);
        }
        onError?.(event);
      }}
    />
  );
}
