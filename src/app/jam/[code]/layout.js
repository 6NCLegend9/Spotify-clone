import { resolveParams } from "@/utils/routeParams";
import { isJamCode, normalizeJamCode } from "@/utils/jam.mjs";
import { kasaShareMetadata } from "@/utils/shareCard.mjs";
import { SOCIAL_IMAGE } from "@/utils/siteConfig";

export async function generateMetadata({ params }) {
  const { code: rawCode } = await resolveParams(params);
  const code = normalizeJamCode(rawCode);
  if (!isJamCode(code)) {
    return kasaShareMetadata({
      title: "Jam",
      path: "/jam",
      image: SOCIAL_IMAGE,
      indexable: false,
    });
  }
  return kasaShareMetadata({
    title: `Jam ${code}`,
    path: `/jam/${code}`,
    image: SOCIAL_IMAGE,
    indexable: false,
  });
}

export default function JamLayout({ children }) {
  return children;
}
