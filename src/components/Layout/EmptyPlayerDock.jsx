import { Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";

export default function EmptyPlayerDock() {
  return <div className="empty-player-dock" aria-label="Player: choose a song to start listening">
    <div />
    <div className="empty-player-center"><div className="flex items-center justify-center gap-4">
      {[['Shuffle', Shuffle], ['Previous song', SkipBack], ['Play', Play], ['Next song', SkipForward], ['Repeat', Repeat]].map(([label, Icon]) => <button type="button" key={label} disabled aria-label={label} className="grid h-11 w-11 place-items-center text-white/30"><Icon size={label === 'Play' ? 24 : 18} /></button>)}
    </div><div className="flex items-center gap-2 text-xs text-white/30"><span>0:00</span><input type="range" min="0" max="100" value="0" disabled aria-label="Playback position: no track selected" className="h-1 w-full accent-white" /><span>0:00</span></div></div>
    <div className="flex items-center justify-end gap-2 text-white/30"><Volume2 size={18} /><input type="range" disabled value="100" aria-label="Volume: no track selected" className="h-1 w-20 accent-white" /></div>
  </div>;
}
