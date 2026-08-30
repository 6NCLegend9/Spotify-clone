import { redirect } from "next/navigation";
import { resolveParams } from "@/utils/routeParams";

export default async function LegacyPlaylistPage({ params }) {
  const { playlistId } = await resolveParams(params);
  redirect(`/library/playlist/${playlistId}`);
}
