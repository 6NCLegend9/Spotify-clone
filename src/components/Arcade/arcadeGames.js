export const ARCADE_GAMES = [
  {
    id: "tiles",
    title: "Magic Tiles",
    tagline: "4-lane rhythm",
    blurb: "Tiles fall so they hit the glow line on the beat. Tap the lane at that moment.",
    ready: true,
    desktop: [
      "D · F · J · K hit lanes 1 to 4",
      "Perfect timing on the line scores more",
      "The chart follows the song that's already playing",
    ],
    mobile: [
      "Tap a column as its tile reaches the line",
      "Four touch columns, left to right",
      "Tiles are locked to the song, not a random timer",
    ],
  },
  {
    id: "runner",
    title: "Beat Runner",
    tagline: "Music highway",
    blurb: "Ride the song. Catch orbs and gold rings in your lane on the beat. Step aside for barriers.",
    ready: true,
    desktop: [
      "A / D or Left / Right change lane",
      "Stay in a lane to catch the pulse as it reaches you",
      "Gold rings are downbeats. Pink gates are dodge-only",
    ],
    mobile: [
      "Swipe left or right to change lane",
      "Drive through teal orbs and gold rings on the beat",
      "Pink gates hurt — be in another lane when they arrive",
    ],
  },
  {
    id: "invaders",
    title: "Wave Invaders",
    tagline: "Pulse shooter",
    blurb: "Snap to a lane and fire as the beat crosses the ring. Hits are timed to the song, not sprayed.",
    ready: true,
    desktop: [
      "A / D or Left / Right switch lanes",
      "Space fires a pulse in your lane",
      "Fire when the orb sits on the glow ring",
    ],
    mobile: [
      "Tap a column to move there and fire",
      "Time the tap for when the orb hits the ring",
      "Missed beats break your combo",
    ],
  },
];

export function getArcadeGame(id) {
  return ARCADE_GAMES.find((game) => game.id === id) || ARCADE_GAMES[0];
}
