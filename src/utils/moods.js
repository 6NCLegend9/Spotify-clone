// Mood radio presets. Selecting a pill runs a mood-seeded search, which the player's
// existing queue auto-extend ("radio") then continues from — no new backend needed.
export const MOOD_OPTIONS = [
  { id: "chill", label: "Chill", query: "chill lofi music" },
  { id: "workout", label: "Workout", query: "workout hype music" },
  { id: "focus", label: "Focus", query: "focus study beats" },
  { id: "party", label: "Party", query: "party dance hits" },
  { id: "energy", label: "Energy", query: "high energy anthems" },
];
