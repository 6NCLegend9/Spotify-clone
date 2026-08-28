export const PLAYBACK_DEVICES = [
  { id: "this-computer", name: "This computer", detail: "Web player" },
  { id: "studio-speaker", name: "Studio speaker", detail: "Living room" },
  { id: "pocket-player", name: "Pocket player", detail: "Mobile" },
];

export function getPlaybackDevice(deviceId) {
  return PLAYBACK_DEVICES.find((device) => device.id === deviceId) || PLAYBACK_DEVICES[0];
}