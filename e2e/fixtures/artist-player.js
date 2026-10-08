const { installUiFixtures } = require("./ui-redesign");

// Keep the real provider lifecycle/router; isolate only the remote YouTube player.
async function installArtistPlayer(page, track, options = {}) {
  await installUiFixtures(page, { ...options, playback: true, track });
  await page.addInitScript(({ durationById }) => {
    window.__artistProviderMounts = 0;
    window.__artistProviderDestroys = 0;
    window.YT = {
      PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
      Player: class {
        constructor(mount, options) {
          this.videoId = options.videoId;
          const target = typeof mount === "string" ? document.getElementById(mount) : mount;
          this.frame = document.createElement("iframe");
          this.frame.id = target.id;
          this.frame.title = "Artist navigation test player";
          target.replaceWith(this.frame);
          window.__artistProviderMounts += 1;
          setTimeout(() => options.events.onReady({ target: this }), 0);
        }
        getIframe() { return this.frame; }
        getDuration() { return durationById[this.videoId] ?? 180; }
        getCurrentTime() { return 12; }
        getPlayerState() { return 2; }
        getVideoData() { return { video_id: this.videoId }; }
        getPlaybackQuality() { return "medium"; }
        playVideo() {} pauseVideo() {} mute() {} unMute() {} setVolume() {}
        setPlaybackQuality() {} seekTo() {}
        loadVideoById(input) { this.videoId = typeof input === "string" ? input : input.videoId; }
        cueVideoById(input) { this.loadVideoById(input); }
        destroy() { window.__artistProviderDestroys += 1; this.frame.remove(); }
      },
    };
  }, { durationById: options.durationById || {} });
}

module.exports = { installArtistPlayer };
