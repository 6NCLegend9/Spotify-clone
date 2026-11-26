"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus as FiPlus, Radio as FiRadio } from "lucide-react";
import PlaylistModal from "@/components/Sidebar/PlaylistModal";
import BottomSheet from "@/components/BottomSheet";
import { requestJamOpen } from "@/utils/jam.mjs";
import { loginPath } from "@/utils/appOrigin.mjs";
import useAccountScope from "@/hooks/useAccountScope";

export default function CreateHub() {
  const scope = useAccountScope();
  return <AccountCreateHub key={scope.key} />;
}

function AccountCreateHub() {
  const scope = useAccountScope();
  const { status } = scope;
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  useEffect(() => {
    const open = () => { if (scope.isCurrentView()) setPickerOpen(true); };
    const playlist = () => { if (scope.isCurrent()) setPlaylistOpen(true); };
    window.addEventListener("heykasa:open-create", open);
    window.addEventListener("heykasa:create-playlist", playlist);
    return () => {
      window.removeEventListener("heykasa:open-create", open);
      window.removeEventListener("heykasa:create-playlist", playlist);
    };
  }, [scope]);

  const openPlaylist = () => {
    if (!scope.isCurrentView()) return;
    setPickerOpen(false);
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (scope.isCurrent()) setPlaylistOpen(true);
  };

  const openJam = () => {
    if (!scope.isCurrentView()) return;
    setPickerOpen(false);
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (scope.isCurrent()) requestJamOpen();
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
            <FiPlus size="1em" aria-hidden="true" />
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
            <FiRadio size="1em" aria-hidden="true" />
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
      />
    </>
  );
}
