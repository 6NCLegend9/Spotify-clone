import PlayButton from "@/components/PlayButton";
import SongList from "@/components/SongsList";
import { getplaylistData, homePageData } from "@/services/dataAPI";
import { resolveParams } from "@/utils/routeParams";
import { redirect } from "next/navigation";

const PlaylistPage = async ({ params }) => {
  const { playlistId } = await resolveParams(params);
  const playlistData = await getplaylistData(playlistId);
  if (!playlistData) {
    redirect("/");
  }

  return (
    <div className="page">
      <div className="flex flex-col items-center lg:flex-row lg:items-end">
        {false ? (
          <div
            role="status"
            className="space-y-8 animate-pulse md:space-y-0 md:space-x-8 md:flex md:items-center"
          >
            <div className="flex rounded-full items-center justify-center w-[300px] h-[300px] bg-gray-300 dark:bg-gray-700">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-gray-600"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 18"
              >
                <path d="M18 0H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm4.376 10.481A1 1 0 0 1 16 15H4a1 1 0 0 1-.895-1.447l3.5-7A1 1 0 0 1 7.468 6a.965.965 0 0 1 .9.5l2.775 4.757 1.546-1.887a1 1 0 0 1 1.618.1l2.541 4a1 1 0 0 1 .028 1.011Z" />
              </svg>
            </div>
          </div>
        ) : (
          <img
            className="rounded-2xl shadow-2xl"
            src={playlistData?.image?.[2]?.url || playlistData?.image?.[1]?.url || playlistData?.image?.[0]?.url || ""}
            alt={playlistData?.name || playlistData?.title}
            width={300}
            height={300}
          />
        )}

        <div className="mt-8 flex flex-col items-center gap-2 text-gray-100 md:items-start lg:ml-10 lg:mt-0">
          <h1 className=" text-xl lg:text-4xl font-bold">
            {playlistData?.name}
          </h1>
          <ul className="flex items-center text-center flex-col gap-3 text-gray-300">
            <li className="text-sm font-semibold">
              {playlistData?.description}
            </li>
          </ul>
          <PlayButton songList={playlistData} />
        </div>
      </div>
      <div className="mt-10 text-gray-200">
        <h1 className="text-3xl font-bold">Songs</h1>
        <SongList SongData={playlistData?.songs} loading={false} />
      </div>
    </div>
  );
};

export default PlaylistPage;

// 4 hour
export const revalidate = 14400;

export async function generateStaticParams() {
  try {
    const res = await homePageData(["english"]);
    if (Array.isArray(res?.charts)) {
      return res.charts.map((playlist) => ({
        playlistId: playlist?.id?.toString(),
      }));
    }
    return [];
  } catch (error) {
    console.error(error);
    return [];
  }
}
