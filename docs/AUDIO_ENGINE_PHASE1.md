# Retired audio-engine prototype

The unintegrated phase-one audio subsystem and its isolated tests were removed during
the dead-code cleanup. Production playback continues through the existing MusicPlayer,
playerSlice, source adapters, and PlaybackPersistence. Queue and persistence behavior
remain covered by tests for that active implementation.
