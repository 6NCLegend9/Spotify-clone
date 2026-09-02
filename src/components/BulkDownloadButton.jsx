"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MdCheckCircleOutline,
  MdDownloadForOffline,
  MdOutlineAutorenew,
} from "react-icons/md";
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
} from "./MusicPlayer/downloadUtils";

const BulkDownloadButton = ({ songList }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [progress, setProgress] = useState(0);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const resetTimerRef = useRef(null);
  const [announcement, setAnnouncement] = useState("");
  const wifiOnlyDownloads = useSelector(
    (state) => state.settings.wifiOnlyDownloads,
  );

  const songs = songList?.songs || songList || [];
  const downloadTitle = songList?.name || "songs";

  const updateMenuPosition = () => {
    if (typeof window === "undefined" || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPosition({
      top: Math.max(8, rect.top - 8),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!showMenu) return;

    const handler = (e) => {
      const clickedButton = buttonRef.current?.contains(e.target);
      const clickedMenu = menuRef.current?.contains(e.target);

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

  const handleBulkDownload = async (quality) => {
    setShowMenu(false);

    if (!songs.length) {
      const message = "No songs are available to download.";
      setAnnouncement(message);
      toast.error(message);
      return;
    }

    if (!canStartDownload()) return;

    setDownloading(true);
    setCompleted(false);
    setProgress(0);
    let downloadCreated = false;

    try {
      const [{ default: JSZip }, { applyCoverArt, applyTags }] =
        await Promise.all([import("jszip"), import("taglib-wasm/simple")]);

      const zip = new JSZip();
      const folderName = sanitize(downloadTitle) || "download";
      const folder = zip.folder(folderName) || zip;
      const availableSongs = songs.filter(
        (song) => song?.downloadUrl?.[quality.index]?.url,
      );

      if (!availableSongs.length) {
        const message = "No songs are available at this download quality.";
        setAnnouncement(message);
        toast.error(message);
        return;
      }

      let downloadedCount = 0;
      const failedSongs = [];

      for (let index = 0; index < songs.length; index += 1) {
        const song = songs[index];
        const songUrl = song?.downloadUrl?.[quality.index]?.url;

        if (!songUrl) {
          setProgress(Math.round(((index + 1) / songs.length) * 85));
          continue;
        }

        let taggedBuffer;
        let lastError;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const audioRes = await fetch(songUrl);
            if (!audioRes.ok) {
              const fetchError = new Error("Audio download failed");
              fetchError.status = audioRes.status;
              throw fetchError;
            }

            const audioBuffer = await audioRes.arrayBuffer();
            taggedBuffer = await applyTags(
              new Uint8Array(audioBuffer),
              buildTagInput(song),
            );

            const coverUrl =
              song?.image?.[2]?.url ||
              song?.image?.[1]?.url ||
              song?.image?.[0]?.url;

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
                // Keep the audio file even if artwork fetch fails.
              }
            }

            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (taggedBuffer) {
          const fileName = `${sanitize(song?.name) || "track"}.m4a`;
          folder.file(fileName, taggedBuffer);
          downloadedCount += 1;
        } else {
          failedSongs.push(song);
          if (process.env.NODE_ENV === "development") {
            console.warn("Bulk track download failed after retry:", lastError?.message || "Unknown download error");
          }
        }

        setProgress(Math.round(((index + 1) / songs.length) * 85));
      }

      if (!downloadedCount) {
        const message = `None of the ${availableSongs.length} available songs could be downloaded after one retry.`;
        setAnnouncement(message);
        toast.error(message);
        return;
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `${folderName}.zip`);
      downloadCreated = true;
      setProgress(100);
      setCompleted(true);

      const unavailableCount = songs.length - availableSongs.length;
      const resultParts = [
        `Downloaded ${downloadedCount} of ${availableSongs.length} available songs from ${folderName}.`,
      ];
      if (failedSongs.length) {
        resultParts.push(
          `${failedSongs.length} failed after one retry.`,
        );
      }
      if (unavailableCount) {
        resultParts.push(
          `${unavailableCount} ${
            unavailableCount === 1 ? "song was" : "songs were"
          } unavailable at this quality.`,
        );
      }

      const resultMessage = resultParts.join(" ");
      setAnnouncement(resultMessage);
      if (failedSongs.length) {
        toast(resultMessage, { icon: "⚠️" });
      } else {
        toast.success(resultMessage);
      }

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = setTimeout(() => {
        setCompleted(false);
        setProgress(0);
      }, 2500);
    } catch (error) {
      console.error("Bulk download error:", error);
      const userError = toUserError(error, {
        title: "Bulk download failed",
      });
      const message = `${userError.title}. ${userError.message}`;
      setAnnouncement(message);
      toast.error(message);
    } finally {
      setDownloading(false);
      if (!downloadCreated) {
        setProgress(0);
      }
    }
  };

  const availableQualities = QUALITY_OPTIONS.filter((quality) =>
    songs.some((song) => song?.downloadUrl?.[quality.index]?.url),
  );

  return (
    <div className="relative flex cursor-pointer" ref={buttonRef}>
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
        title={downloading ? "Downloading" : `Download ${downloadTitle}`}
        aria-label={downloading ? "Downloading" : `Download ${downloadTitle}`}
        aria-expanded={showMenu}
        aria-busy={downloading}
        className={`relative overflow-hidden flex h-12 w-full sm:w-auto items-center justify-center gap-3 rounded-full border border-white/25 px-5 sm:px-6 text-gray-100 shadow-[0_0_28px_rgba(0,230,230,0.12)] transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#00e6e6]/20 sm:min-w-[260px] ${
          downloading
            ? "cursor-not-allowed bg-slate-800"
            : completed
              ? "bg-emerald-500/20 border-emerald-400/40 shadow-[0_0_24px_rgba(16,185,129,0.16)]"
              : "bg-[#06131f] hover:border-[#00e6e6]/70 hover:shadow-[0_0_30px_rgba(0,230,230,0.18)]"
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 transition-[width,background-color] duration-150 ease-out ${
            downloading
              ? "bg-[#00e6e6]/25"
              : completed
                ? "bg-emerald-500/45"
                : "bg-transparent"
          }`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />

        <div className="relative z-10 flex w-full items-center justify-center gap-3 pointer-events-none font-medium tracking-wide">
          {downloading ? (
            <>
              <MdOutlineAutorenew size={24} className="animate-spin" />
              <span className="text-sm sm:text-base lg:text-lg">
                Downloading... {progress}%
              </span>
            </>
          ) : completed ? (
            <>
              <MdCheckCircleOutline size={24} />
              <span className="text-sm sm:text-base lg:text-lg">Completed</span>
            </>
          ) : (
            <>
              <MdDownloadForOffline
                size={24}
                className="group-hover:text-[#00e6e6]"
              />
              <span className="text-sm sm:text-base lg:text-lg">Download</span>
            </>
          )}
        </div>
      </button>

      {showMenu && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
              role="group"
              aria-label="Bulk download quality"
              className="bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl backdrop-blur-md z-[9999] min-w-[160px] overflow-hidden animate-fade-in"
              style={{
                position: "fixed",
                top: `${menuPosition.top}px`,
                right: `${menuPosition.right}px`,
                transform: "translateY(-100%)",
              }}
            >
              <div className="px-3 py-2 text-xs text-white/50 font-semibold uppercase tracking-wider border-b border-white/10">
                Bulk download quality
              </div>
              {availableQualities.map((quality) => (
                <button
                  key={quality.index}
                  onClick={() => handleBulkDownload(quality)}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 hover:text-[#00e6e6] transition-colors flex items-center justify-between gap-2"
                >
                  <span>{quality.label}</span>
                  {quality.index === 4 && (
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

export default BulkDownloadButton;
