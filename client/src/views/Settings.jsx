import { useEffect, useState } from "react";
import { EQ_FREQUENCIES, EQ_PRESETS } from "../hooks/useAudioPlayer";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/UserContext";
import { getPlaybackDevice, PLAYBACK_DEVICES } from "../lib/devices";
import { formatDate } from "../lib/format";
import { Icon } from "../components/Icon";

const presetOptions = [
  { value: "Flat", label: "Flat" },
  { value: "Bass Boost", label: "Boost Bass" },
  { value: "Treble Boost", label: "Boost Treble" },
  { value: "Vocal", label: "Vocal" },
  { value: "Rock", label: "Rock" },
  { value: "Pop", label: "Pop" },
  { value: "Hip-Hop/Rap", label: "Hip-Hop/Rap" },
  { value: "Night", label: "Night" },
];

function SettingsToggle({ label, description, checked, onChange }) {
  return <label className="settings-toggle"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

export function Settings() {
  const player = usePlayer();
  const { user, profileStats, refreshProfile, updateProfile, updateSettings, logout } = useUser();
  const { notify } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setAvatarUrl(user.avatarUrl || "");
  }, [user?.id]);

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ displayName, avatarUrl });
      notify("Profile updated", "success");
    } catch (error) {
      notify(error.message || "Unable to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const applyPreset = (preset) => player.updateEqualizer({ preset, bands: EQ_PRESETS[preset] || EQ_PRESETS.Flat });
  const updateBand = (index, value) => {
    const bands = [...player.equalizer.bands];
    bands[index] = Number(value);
    player.updateEqualizer({ preset: "Custom", bands });
  };
  const activeDevice = getPlaybackDevice(user?.settings?.activeDeviceId);
  const movePlayback = (device) => {
    if (device.id === activeDevice.id) return;
    updateSettings({ activeDeviceId: device.id });
    notify(`Playback moved to ${device.name}`, "success");
  };

  return <div className="settings-view reveal">
    <span className="kicker">SETTINGS</span>
    <h1>Shape your listening.</h1>
    <p className="settings-lead">Your demo profile and playback choices are saved automatically.</p>

    <section className="settings-panel profile-settings"><div className="settings-heading"><div><span className="kicker">PROFILE</span><h2>Your demo account</h2></div><span className="settings-stat">{profileStats?.likedSongsCount ?? 0} liked songs</span></div><form className="settings-form" onSubmit={saveProfile}><label className="field-label">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength="2" maxLength="48" required /></label><label className="field-label">Avatar image URL<input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." /></label><div className="account-facts"><span><small>Email</small><strong>{user?.email || "Loading..."}</strong></span><span><small>Member since</small><strong>{formatDate(user?.createdAt)}</strong></span><span><small>Playlists</small><strong>{profileStats?.playlistCount ?? 0}</strong></span></div><div className="settings-actions"><button className="primary-button" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button><button className="secondary-button" type="button" onClick={() => logout().then(() => notify("Demo session ended")).catch(() => notify("Unable to end demo session", "error"))}>End demo session</button></div></form></section>

    <section className="settings-panel"><div className="settings-heading"><div><span className="kicker">EQUALIZER</span><h2>Ten-band studio</h2></div><SettingsToggle label="Equalizer" checked={player.equalizer.enabled} onChange={(enabled) => player.updateEqualizer({ enabled })} /></div>{!player.equalizerSupported && <p className="inline-error">Your browser does not support the equalizer. Playback continues normally.</p>}<label className="settings-select">Preset<select aria-label="Equalizer preset" value={player.equalizer.preset} onChange={(event) => applyPreset(event.target.value)}>{presetOptions.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}{player.equalizer.preset === "Custom" && <option value="Custom">Custom</option>}</select></label><div className={`equalizer ${player.equalizer.enabled ? "" : "muted"}`}>{EQ_FREQUENCIES.map((frequency, index) => <label className="band" key={frequency}><input aria-label={`${frequency} hertz gain`} type="range" min="-12" max="12" step="1" value={player.equalizer.bands[index]} onChange={(event) => updateBand(index, event.target.value)} /><output>{player.equalizer.bands[index] > 0 ? "+" : ""}{player.equalizer.bands[index]} dB</output><span>{frequency >= 1000 ? `${frequency / 1000}k` : frequency} Hz</span></label>)}</div><button className="reset-button" onClick={() => applyPreset("Flat")}>Reset to flat</button></section>

    <section className="settings-panel playback-quality"><div><span className="kicker">PLAYBACK QUALITY</span><h2>Source quality</h2><p>Auto adapts to the browser network signal and refreshes its decision every five minutes.</p></div><label className="settings-select">Quality<select value={player.qualityMode} onChange={(event) => player.setQualityMode(event.target.value)}><option value="auto">Auto (network-based)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><span className="quality-current">Current quality: <strong>{player.qualityEffective}</strong></span></section>

    <section className="settings-panel compact-settings"><div><span className="kicker">TRANSITIONS</span><h2>Crossfade</h2><p>Blend the end of one track into the next with equal-power volume curves.</p></div><select aria-label="Crossfade duration" value={player.crossfadeSeconds} onChange={(event) => player.setCrossfadeSeconds(Number(event.target.value))}>{[0, 2, 4, 6, 8].map((seconds) => <option key={seconds} value={seconds}>{seconds === 0 ? "Off" : `${seconds} seconds`}</option>)}</select></section>

    <section className="settings-panel device-settings"><div className="settings-heading"><div><span className="kicker">DEVICES & PLAYBACK</span><h2>Listening on</h2></div><span className="settings-stat">{activeDevice.name}</span></div><div className="device-list">{PLAYBACK_DEVICES.map((device) => { const isActive = device.id === activeDevice.id; return <button key={device.id} type="button" className={`device-option ${isActive ? "is-active" : ""}`} aria-pressed={isActive} aria-label={isActive ? `${device.name} is active` : `Take over playback on ${device.name}`} title={isActive ? `${device.name} is active` : `Take over playback on ${device.name}`} onClick={() => movePlayback(device)}><Icon name="device" size={18} /><span><strong>{device.name}</strong><small>{device.detail}</small></span><em>{isActive ? "Active" : "Take over"}</em></button>; })}</div></section>

    <section className="settings-panel settings-toggles"><div><span className="kicker">AUDIO BEHAVIOR</span><h2>Playback preferences</h2></div><SettingsToggle label="Normalize volume" description="Applies a modest master-gain reduction to supported browser audio." checked={player.normalizeVolume} onChange={player.setNormalizeVolume} /><SettingsToggle label="Skip silence" description="Saved for supported future media sources." checked={player.skipSilence} onChange={player.setSkipSilence} /><SettingsToggle label="Data Saver" description="Prefers lower-quality audio when Auto quality is selected." checked={player.dataSaverEnabled} onChange={player.setDataSaverEnabled} /><SettingsToggle label="Allow downloads" description="Records your download preference; offline files are not stored." checked={player.allowDownloads} onChange={player.setAllowDownloads} /><SettingsToggle label="Keyboard shortcuts" description="Space toggles playback; left and right arrows seek five seconds." checked={player.keyboardShortcutsEnabled} onChange={player.setKeyboardShortcutsEnabled} /></section>
  </div>;
}
