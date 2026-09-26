export const HIDDEN_YOUTUBE_VIEWPORT = Object.freeze({
  width: 320,
  height: 200,
});

export function hiddenYoutubeViewportStyle() {
  return {
    width: `${HIDDEN_YOUTUBE_VIEWPORT.width}px`,
    height: `${HIDDEN_YOUTUBE_VIEWPORT.height}px`,
  };
}
