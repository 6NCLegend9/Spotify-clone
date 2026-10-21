"use client";

export default function PlaybackQualityControl({ provider, asset, qualities = [], selection, disabled, onChange }) {
  if (provider !== "native") return null;
  const heights = new Set(qualities.map((q) => q.height));
  const choices = [1080, 1440, 2160].filter((height) => heights.has(height));
  const details = asset ? [asset.codec.toUpperCase(), asset.height ? `${asset.height}p` : null, asset.audioBitrateKbps ? `${asset.audioBitrateEstimated !== false ? "~" : ""}${Math.round(asset.audioBitrateKbps)} kbps` : null, asset.sampleRateHz ? `${Number((asset.sampleRateHz / 1000).toFixed(1))} kHz` : null, asset.channels === 1 ? "Mono" : asset.channels === 2 ? "Stereo" : null].filter(Boolean).join(" · ") : "Preparing source…";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-1 text-xs text-muted">
      <span className="min-w-0 break-words" aria-live="polite">{details}</span>
      {asset?.height && choices.length > 0 ? (
        <label className="flex items-center gap-1">
          Quality
          <select aria-label="Video quality" className="rounded border border-white/10 bg-surface px-1 py-0.5 text-white" value={selection} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
            <option value="auto">Auto</option>
            {choices.map((height) => <option key={height} value={String(height)}>{height}p</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}
