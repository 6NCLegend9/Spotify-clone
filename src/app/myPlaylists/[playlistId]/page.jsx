import { redirect } from "next/navigation";

export default function LegacyPlaylistPage({ params }) {
  redirect(`/library/playlist/${params.playlistId}`);
}
