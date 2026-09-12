import Link from "next/link";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import { hashToken } from "@/utils/tokenHash.mjs";
import { resolveParams } from "@/utils/routeParams";

export const metadata = {
  title: "Verify Email",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VerifyEmailPage({ params }) {
  const { token: rawToken } = await resolveParams(params);
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  let verified = false;
  let alreadyVerified = false;

  if (/^[a-f0-9]{64}$/i.test(token)) {
    try {
      await dbConnect();
      const tokenHash = hashToken(token);
      const user = await User.findOne({
        verificationToken: tokenHash,
        verificationTokenExpires: { $gt: Date.now() },
      }).select("_id isVerified");

      if (user?.isVerified) {
        alreadyVerified = true;
      } else if (user) {
        const result = await User.updateOne(
          { _id: user._id, isVerified: false, verificationToken: tokenHash },
          {
            $set: {
              isVerified: true,
              verificationToken: null,
              verificationTokenExpires: null,
            },
          },
        );
        verified = result.modifiedCount === 1;
      }
    } catch {
      // Render a recoverable failure without exposing database details.
    }
  }

  const success = verified || alreadyVerified;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--navy)] px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[var(--hairline)] bg-[var(--navy-surface)] p-8 text-center shadow-2xl">
        <div
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            success ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-red-500/15 text-red-300"
          }`}
          aria-hidden="true"
        >
          <span className="text-3xl">{success ? "✓" : "!"}</span>
        </div>
        <h1 className="mt-6 text-3xl font-bold text-[var(--text)]">
          {success ? "Email verified" : "Verification failed"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {success
            ? "Your account is ready. You can now log in from Safari, Chrome, Firefox, Edge, or any modern browser."
            : "This link is invalid, expired, or has already been used. Request a new verification email and try again."}
        </p>
        <Link href="/login" className="btn-primary mt-7 inline-flex px-7 py-3">
          Continue to login
        </Link>
      </section>
    </main>
  );
}
