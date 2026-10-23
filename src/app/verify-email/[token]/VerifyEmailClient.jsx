"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { SpotlightCard } from "@/components/ReactBits/SpotlightCard";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

export default function VerifyEmailClient({ token }) {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  const tokenIsValid = /^[a-f0-9]{64}$/i.test(normalizedToken);
  const invalidTokenError = {
    title: "Invalid verification link",
    message: "This verification link is incomplete or invalid. Request a new link and try again.",
    retryable: false,
  };
  const [status, setStatus] = useState(tokenIsValid ? "ready" : "error");
  const [errorDetails, setErrorDetails] = useState(
    tokenIsValid ? null : invalidTokenError,
  );
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      };

  const verify = async () => {
    if (!tokenIsValid || status === "verifying") return;
    setStatus("verifying");
    setErrorDetails(null);
    try {
      const data = await requestJson("/api/verify-email", {
        method: "POST",
        body: { token: normalizedToken },
        fallbackTitle: "Verification failed",
        fallbackMessage: "We couldn't verify your email. Please try again.",
      });

      if (!data?.success) throw new Error("Verification did not complete.");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorDetails(userErrorDetails(error, {
        title: "Verification failed",
        message: "We couldn't verify your email. Please try again.",
      }));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1b] px-4 py-12 sm:px-6 lg:px-8">
      <SpotlightCard className="w-full max-w-md space-y-8 bg-[#0b1629]">
        <div className="relative text-center min-h-[220px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
          {status === "ready" && (
            <motion.div
              key="ready"
              {...motionProps}
              className="z-10 relative"
            >
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white mb-2">
                Verify your email
              </h2>
              <p className="mt-4 text-sm text-[#9aa8b5]">
                Confirm that you want to verify this email address.
              </p>
              <button
                type="button"
                onClick={() => void verify()}
                className="mt-7 rounded-full bg-[#096192] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#1171ba]"
              >
                Verify email
              </button>
            </motion.div>
          )}

          {status === "verifying" && (
            <motion.div
              key="verifying"
              {...motionProps}
              className="z-10 relative"
            >
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white mb-2">
                Verifying Email
              </h2>
              <div className="flex justify-center mt-4">
                 <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-[#096192]"></div>
              </div>
              <p className="mt-4 text-sm text-[#9aa8b5]">Please wait while we verify your email address...</p>
            </motion.div>
          )}

          {status === "success" && (
            <motion.div
              key="success"
              {...motionProps}
              className="z-10 relative"
            >
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white mb-2">
                Email Verified!
              </h2>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#096192]/20 mb-4 mt-6">
                <Check className="h-10 w-10 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm text-[#9aa8b5] font-medium">
                Your email has been verified. You can now log in.
              </p>
              <Link
                href="/login"
                className="mt-7 inline-block rounded-full bg-[#096192] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#1171ba]"
              >
                Continue to login
              </Link>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              key="error"
              {...motionProps}
              className="z-10 relative"
            >
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white mb-2">
                Verification Failed
              </h2>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 mb-4 mt-6">
                <X className="h-8 w-8 text-red-500" aria-hidden="true" />
              </div>
              <div className="mt-5 text-left">
                <UserMessage
                  title={errorDetails?.title}
                  message={errorDetails?.message}
                  onRetry={tokenIsValid && errorDetails?.retryable ? verify : undefined}
                  retryLabel="Verify again"
                />
              </div>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-block rounded-full bg-[#096192] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#1171ba] shadow-[0_0_15px_rgba(9,97,146,0.4)]"
                >
                  Return to Login
                </Link>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </SpotlightCard>
    </div>
  );
}
