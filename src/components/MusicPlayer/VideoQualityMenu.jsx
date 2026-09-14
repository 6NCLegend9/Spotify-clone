"use client";

import { useDispatch, useSelector } from "react-redux";
import { updateSetting } from "@/redux/features/settingsSlice";
import styles from "./playbackViews.module.css";

/** Reuses the application's existing quality preference; does not claim a delivered resolution. */
export default function VideoQualityMenu() {
  const dispatch = useDispatch();
  const value = useSelector((state) => state.settings.videoQuality);
  return (
    <label className={styles.quality} title="Preferred quality. The provider determines the delivered resolution.">
      <span className={styles.srOnly}>Preferred video quality</span>
      <select aria-label="Preferred video quality" value={["720p", "1080p"].includes(value) ? value : "auto"}
        onChange={(event) => dispatch(updateSetting({ key: "videoQuality", value: event.target.value }))}>
        <option value="auto">Quality: Auto</option>
        <option value="720p">Prefer 720p</option>
        <option value="1080p">Prefer 1080p</option>
      </select>
    </label>
  );
}
