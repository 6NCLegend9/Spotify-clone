import VerifyEmailClient from "./VerifyEmailClient";
import { use } from "react";

export const metadata = {
  title: "Verify Email - Hayasaka",
};

export default function VerifyEmailPage({ params }) {
  // Unwrap parameters automatically for React 19/Next 14 constraints
  const { token } = params;
  return <VerifyEmailClient token={token} />;
}
