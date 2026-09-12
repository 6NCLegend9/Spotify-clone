import VerifyEmailClient from "./VerifyEmailClient";
import { resolveParams } from "@/utils/routeParams";

export const metadata = {
  title: "Verify Email",
};

export default async function VerifyEmailPage({ params }) {
  const { token } = await resolveParams(params);
  return <VerifyEmailClient token={token} />;
}
