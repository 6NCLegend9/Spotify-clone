import { useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { navigate } from "../hooks/useHashRoute";
import { api } from "../lib/api";
import { Icon } from "./Icon";

export function StartRadioButton({ seedType, seedId, children = "Start radio", className = "secondary-button", iconOnly = false, ariaLabel, title }) {
  const { play } = usePlayer();
  const { notify } = useToast();
  const [starting, setStarting] = useState(false);
  const label = ariaLabel || (typeof children === "string" ? children : "Start radio");

  const startRadio = async () => {
    if (!seedId || starting) return;
    setStarting(true);
    try {
      const response = await api.post("/api/radio/sessions", { seedType, seedId });
      if (!response.data?.id || !response.queue?.length) throw new Error("This station has no playable tracks yet");
      play(response.queue[0], response.queue, 0, { type: "radio", refId: response.data.id });
      notify(`${response.data.name} started`, "success");
      navigate(`/radio/${response.data.id}`);
    } catch (error) {
      notify(error.message || "Unable to start radio", "error");
    } finally {
      setStarting(false);
    }
  };

  return <button className={className} onClick={startRadio} disabled={!seedId || starting} aria-label={iconOnly ? label : undefined} title={title || (iconOnly ? label : undefined)}><Icon name="radio" />{!iconOnly && (starting ? "Starting..." : children)}</button>;
}