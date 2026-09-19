"use client";

import { useState } from "react";
import Link from "next/link";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ busy: false, message: "", error: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, message: "", error: "" });
    try {
      const result = await requestJson("/api/resend-verification", {
        method: "POST",
        body: { email },
        fallbackTitle: "Email not sent",
        fallbackMessage: "We couldn't send a verification email. Please try again.",
      });
      setState({ busy: false, message: result?.message || "Check your inbox for a new verification link.", error: "" });
    } catch (error) {
      const details = userErrorDetails(error);
      setState({ busy: false, message: "", error: details.message || "Please try again." });
    }
  };

  return (
    <main className="page grid min-h-full place-items-center px-4">
      <section className="auth-card w-full max-w-md">
        <p className="eyebrow">Account verification</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">Send a new link</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Enter the email used for your HayKasa account. The new link expires after one hour.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" htmlFor="resend-email">
            Email
            <input id="resend-email" type="email" autoComplete="email" required maxLength={254}
              value={email} onChange={(event) => setEmail(event.target.value)}
              className="field mt-2" placeholder="you@email.com" />
          </label>
          {state.message && <p role="status" className="rounded-xl border border-[var(--hairline-cyan)] bg-[var(--fill)] p-3 text-sm text-[var(--text)]">{state.message}</p>}
          {state.error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={state.busy}>
            {state.busy ? "Sending..." : "Send verification email"}
          </button>
          <Link href="/login" className="block text-center text-sm font-semibold text-[var(--accent)]">Back to login</Link>
        </form>
      </section>
    </main>
  );
}
