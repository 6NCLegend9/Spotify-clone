import { BsPlayFill } from "react-icons/bs";

export default function PlayFab({ className = "", standAlone = false, on = false }) {
  return (
    <span
      className={`play-fab ${standAlone ? "play-fab--static" : ""} ${on ? "is-on" : ""} ${className}`}
      aria-hidden="true"
    >
      <BsPlayFill className="ml-0.5 text-xl" />
    </span>
  );
}
