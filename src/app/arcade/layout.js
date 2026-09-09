import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canUseArcade } from "@/utils/arcadeAccess";
import { SITE_URL, SITE_NAME } from "@/utils/siteConfig";

export const metadata = {
  title: "Beat Arcade",
  description: `Play music-synced arcade games in time with your audio on ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/arcade` },
  robots: { index: false, follow: true },
};

export default async function ArcadeLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!canUseArcade(session?.user?.email)) redirect("/");

  return <>{children}</>;
}
