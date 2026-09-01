"use client";

import { youtubeThumb } from "@/utils/imageOptimize";

export default function MediaImage({
  src,
  alt = "",
  size = "mq",
  className = "",
  ...props
}) {
  const resolved = youtubeThumb(src, size) || src;
  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      {...props}
    />
  );
}
