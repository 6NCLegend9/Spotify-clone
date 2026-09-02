"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MdOutlineFileDownload, MdDownloadForOffline } from "react-icons/md";
import { toast } from "react-hot-toast";
import { useSelector } from "react-redux";
import { checkWifiDownloadConnection } from "@/utils/downloadConnection";
import { toUserError } from "@/utils/userError";
import {
  QUALITY_OPTIONS,
  buildTagInput,
  downloadBlob,
  getCoverType,
  sanitize,
} from "./downloadUtils";

const Downloader = ({ activeSong, icon }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const wifiOnlyDownloads = useSelector(
    (state) => state.settings.wifiOnlyDownloads,
  );

  const updateMenuPosition = () => {
    if (typeof window === "undefined" || !menuButtonRef.current) return;

    const rect = menuButtonRef.current.getBoundingClientRect();
    setMenuPosition({
      top: Math.max(8, rect.top - 8),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      const clickedButton = menuButtonRef.current?.contains(e.target);
      const clickedMenu = menuPanelRef.current?.contains(e.target);

      if (!clickedButton && !clickedMenu) {
        setShowMenu(false);
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handler);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [showMenu]);

  const canStartDownload = () => {
    if (!wifiOnlyDownloads) return true;

    const connection = checkWifiDownloadConnection();
    if (connection.status === "non-wifi") {
      const message =
        "Wi-Fi-only downloads are enabled. Connect to Wi-Fi or turn off this setting to download.";
      setAnnouncement(message);
      toast.error(message);
      return false;
    }

    if (connection.status === "unknown") {
      const message =
        "This browser can’t verify whether you’re on Wi-Fi. The download will continue, and your network may charge for data.";
      setAnnouncement(message);
      toast(message, { icon: "ℹ️" });
    }

    return true;
  };

  const handleDownload = async (quality) => {
    setShowMenu(false);
    if (!canStartDownload()) return;

    setDownloading(true);
    setProgress(0);

    try {
      const songUrl = activeSong?.downloadUrl?.[quality.index]?.url;
      if (!songUrl) {
        const message = "This quality is not available for download.";
        setAnnouncement(message);
        toast.error(message);
        return;
      }

      setProgress(10);

      // Fetch the audio file
      const audioRes = await fetch(songUrl);
      if (!audioRes.ok) throw new Error("Failed to fetch audio");
      const audioBuffer = await audioRes.arrayBuffer();
      setProgress(40);

      const songName = sanitize(activeSong?.name);
      const { applyCoverArt, applyTags } = await import("taglib-wasm/simple");
      let taggedBuffer = await applyTags(
        new Uint8Array(audioBuffer),
        buildTagInput(activeSong),
      );

      setProgress(60);

      // Fetch and embed cover art
      const coverUrl =
        activeSong?.image?.[2]?.url ||
        activeSong?.image?.[1]?.url ||
        activeSong?.image?.[0]?.url;

      if (coverUrl) {
        try {
          const imgRes = await fetch(coverUrl);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            taggedBuffer = await applyCoverArt(
              taggedBuffer,
              new Uint8Array(imgBuffer),
              getCoverType(imgRes.headers.get("content-type")),
            );
          }
        } catch {
          // Cover art fetch failed, continue with audio metadata.
        }
      }

      setProgress(80);

      downloadBlob(
        new Blob([taggedBuffer], { type: "audio/mp4" }),
        `${songName}.m4a`,
      );

      setProgress(100);
      const message = `Downloaded "${songName}" (${quality.label}).`;
      setAnnouncement(message);
      toast.success(message);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Download failed:", err?.message || "Unknown download error");
      }
      const userError = toUserError(err, {
        title: "Download failed",
      });
      const message = `${userError.title}. ${userError.message}`;
      setAnnouncement(message);
      toast.error(message);
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  // Filter to only available qualities
  const availableQualities = QUALITY_OPTIONS.filter(
    (q) => activeSong?.downloadUrl?.[q.index]?.url,
  );

  return (
    <div className="relative flex mb-1 cursor-pointer w-7" ref={menuButtonRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!downloading) {
            setShowMenu((prev) => {
              const next = !prev;
              if (next) updateMenuPosition();
              return next;
            });
          }
        }}
        disabled={downloading}
        title={downloading ? "Downloading" : "Download"}
        aria-label={downloading ? `Downloading, ${progress}%` : "Download song"}
        aria-expanded={showMenu}
        className={
          downloading ? "download-button flex justify-center items-center" : ""
        }
      >
        {downloading ? (
          <div className="text-white font-extrabold text-xs">{progress}%</div>
        ) : icon === 2 ? (
          <MdDownloadForOffline size={25} color={"#fff"} />
        ) : (
          <MdOutlineFileDownload size={25} color={"#fff"} />
        )}
      </button>

      {/* Quality selection menu */}
      {showMenu && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              onClick={(e) => e.stopPropagation()}
              role="group"
              aria-label="Download quality"
              className="bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl backdrop-blur-md z-[9999] min-w-[140px] overflow-hidden animate-fade-in"
              style={{
                position: "fixed",
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
                transform: "translateY(-100%)",
              }}
            >
              <div className="px-3 py-2 text-xs text-white/50 font-semibold uppercase tracking-wider border-b border-white/10">
                Quality
              </div>
              {availableQualities.map((q) => (
                <button
                  key={q.index}
                  onClick={() => handleDownload(q)}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 hover:text-[#00e6e6] transition-colors flex items-center justify-between gap-2"
                >
                  <span>{q.label}</span>
                  {q.index === 4 && (
                    <span className="text-[10px] bg-[#00e6e6]/20 text-[#00e6e6] px-1.5 py-0.5 rounded-full font-medium">
                      HQ
                    </span>
                  )}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
};

export default Downloader;
