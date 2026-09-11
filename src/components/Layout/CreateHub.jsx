"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FiPlus, FiRadio } from "react-icons/fi";
import PlaylistModal from "@/components/Sidebar/PlaylistModal";
import BottomSheet from "@/components/BottomSheet";
import { requestJamOpen } from "@/utils/jam.mjs";

export default function CreateHub() {
  const { status } = useSession();
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  useEffect(() => {
    const open = () => setPickerOpen(true);
    window.addEventListener("heykasa:open-create", open);
    return () => window.removeEventListener("heykasa:open-create", open);
  }, []);

  const openPlaylist = () => {
    setPickerOpen(false);
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setPlaylistOpen(true);
  };

  const openJam = () => {
    setPickerOpen(false);
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    requestJamOpen();
  };

  return (
    <>
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} label="Create">
        <p className="mb-3 text-2xl font-bold tracking-tight text-white">Create</p>
        <button
          type="button"
          onClick={openPlaylist}
          className="create-action"
        >
          <span className="create-action-icon">
            <FiPlus aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">Playlist</span>
            <span className="block text-xs text-[#9aa8b5]">Build a list you can come back to</span>
          </span>
        </button>
        <button
          type="button"
          onClick={openJam}
          className="create-action"
        >
          <span className="create-action-icon">
            <FiRadio aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">Jam</span>
            <span className="block text-xs text-[#9aa8b5]">Listen together in realtime</span>
          </span>
        </button>
      </BottomSheet>
      <PlaylistModal
        show={playlistOpen}
        setShow={setPlaylistOpen}
        onCreated={() => {
          window.dispatchEvent(new Event("heykasa:playlists-changed"));
        }}
      />
    </>
  );
}
