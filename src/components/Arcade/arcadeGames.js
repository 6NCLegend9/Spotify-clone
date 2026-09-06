// Shared metadata for the arcade: selection cards, instructions, and the stage
// all read from here so a game's copy never drifts between screens.

export const ARCADE_GAMES = [
  {
    id: "tiles",
    title: "Magic Tiles",
    tagline: "4-lane rhythm",
    blurb: "Hit each tile as it crosses the glowing line.",
    ready: true,
    desktop: ["D · F · J · K hit lanes 1 to 4", "Perfect timing on the line scores double"],
    mobile: ["Tap a tile in its column as it reaches the line", "Four touch columns, left to right"],
  },
  {
    id: "runner",
    title: "Beat Runner",
    tagline: "3-lane endless runner",
    blurb: "Dodge obstacles on a neon grid that speeds up with the music.",
    ready: true,
    desktop: ["A / D or Left / Right arrows change lane"],
    mobile: ["Swipe left or right to change lane"],
  },
  {
    id: "invaders",
    title: "Wave Invaders",
    tagline: "Retro shooter",
    blurb: "Enemy waves spawn on treble and mid spikes.",
    ready: true,
    desktop: ["Left / Right arrows steer", "Spacebar shoots"],
    mobile: ["Drag left and right to steer", "Tap to shoot"],
  },
];

export function getArcadeGame(id) {
  return ARCADE_GAMES.find((game) => game.id === id) || ARCADE_GAMES[0];
}
