import MixCard from "@/components/Homepage/MixCard";
import { buildCategoryMixes, buildMoodMixes } from "@/utils/homeMixes";

export const metadata = { title: "Browse mixes" };

export default function MixesPage() {
  return (
    <main className="page text-white">
      <h1 className="mb-6 text-3xl font-bold">Browse mixes</h1>
      {[{ title: "Genres and activities", mixes: buildCategoryMixes() }, { title: "Moods", mixes: buildMoodMixes() }].map((section) => (
        <section key={section.title} className="mb-10" aria-label={section.title}>
          <h2 className="mb-4 text-xl font-bold">{section.title}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {section.mixes.map((mix) => <MixCard key={mix.id} mix={mix} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
