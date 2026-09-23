import { notFound } from "next/navigation";
import DiscoveryPlaylist from "@/components/DiscoveryPlaylist";
import { buildCategoryMixes, buildMoodMixes } from "@/utils/homeMixes";

export default async function MixPage({ params }) {
  const { id } = await params;
  const mix = [...buildCategoryMixes(), ...buildMoodMixes()].find((item) => item.id === id);
  if (!mix) notFound();
  return <DiscoveryPlaylist key={id} id={id} title={mix.title} query={mix.query} href={`/mix/${encodeURIComponent(id)}`} />;
}
