import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/utils/authOptions";
import JamJoinClient from "@/components/Jam/JamJoinClient";
import JamInvite from "@/components/Jam/JamInvite";
import { isJamCode, normalizeJamCode } from "@/utils/jam.mjs";
import { resolveParams } from "@/utils/routeParams";

export default async function JamJoinPage({ params }) {
  const { code: rawCode } = await resolveParams(params);
  const code = normalizeJamCode(rawCode);
  if (!isJamCode(code)) redirect("/");

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return <JamInvite code={code} />;
  }

  return <JamJoinClient code={code} />;
}
