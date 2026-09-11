import type { ReactNode } from "react";

export interface PlayerTrack {
  id: string;
  title: string;
  channel?: string;
  thumbnail?: string;
}

export interface PlayerDockProps {
  track: PlayerTrack;
  playing: boolean;
  position: number;
  duration: number;
  disabled?: boolean;
  shuffle: boolean;
  repeat: boolean;
  onShuffle: () => void;
  onRepeat: () => void;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
  favourite?: ReactNode;
  trackActions?: ReactNode;
  volume?: ReactNode;
  queue: PlayerTrack[];
  queueSearch?: ReactNode;
  onQueueEdit?: (edit: { kind: "move" | "remove" | "clear"; id?: string; direction?: number }) => void;
  onQueueUndo?: () => void;
  canUndoQueue?: boolean;
  onSaveQueue?: (name: string) => Promise<void>;
  sleepControl?: ReactNode;
  onSelect: (track: PlayerTrack) => void;
  onPip: () => void;
  pipActive: boolean;
  pipLabel: string;
  pipDisabled?: boolean;
  onVideo?: () => void;
  onLyrics?: () => void;
}