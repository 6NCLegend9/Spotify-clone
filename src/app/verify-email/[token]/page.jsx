import { resolveParams } from "@/utils/routeParams";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata = {
  title: "Verify Email",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VerifyEmailPage({ params }) {
  const { token: rawToken } = await resolveParams(params);
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  return <VerifyEmailClient token={token} />;
}
