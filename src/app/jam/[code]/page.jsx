import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/utils/authOptions";
import JamJoinClient from "@/components/Jam/JamJoinClient";
import { isJamCode, normalizeJamCode } from "@/utils/jam.mjs";

export default async function JamJoinPage({ params }) {
  const { code: rawCode } = await params;
  const code = normalizeJamCode(rawCode);
  if (!isJamCode(code)) redirect("/");

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/jam/${code}`)}`);
  }

  return <JamJoinClient code={code} />;
}
