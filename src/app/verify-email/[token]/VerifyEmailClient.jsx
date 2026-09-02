"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SpotlightCard } from "@/components/ReactBits/SpotlightCard";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

export default function VerifyEmailClient({ token }) {
  const [status, setStatus] = useState("verifying"); // verifying, success, error
  const [message, setMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  const redirectTimerRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      };

  useEffect(() => {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token.trim())) {
      setStatus("error");
      setErrorDetails({
        title: "Invalid verification link",
        message: "This verification link is incomplete or invalid. Request a new link and try again.",
        retryable: false,
      });
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const verify = async () => {
      setStatus("verifying");
      setErrorDetails(null);
      try {
        const data = await requestJson("/api/verify-email", {
          method: "POST",
          body: { token: token.trim() },
          signal: controller.signal,
          fallbackTitle: "Verification failed",
          fallbackMessage: "We couldn't verify your email. Please try again.",
        });

        if (!cancelled && data?.success) {
          setStatus("success");
          setMessage("Your email has been verified successfully. You will be redirected to the login page shortly.");
          redirectTimerRef.current = window.setTimeout(() => {
            router.push("/login");
          }, 3500);
        } else {
          throw new Error("Verification did not complete.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setErrorDetails(userErrorDetails(error, {
            title: "Verification failed",
            message: "We couldn't verify your email. Please try again.",
          }));
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
      controller.abort();
      if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
    };
  }, [attempt, token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000814] px-4 py-12 sm:px-6 lg:px-8">
      <SpotlightCard className="w-full max-w-md space-y-8 bg-[#07121d]">
        <div className="relative text-center min-h-[220px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
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
                 <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-[#00e6e6]"></div>
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
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#00e6e6]/20 mb-4 mt-6">
                <svg className="h-10 w-10 text-[#00e6e6]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="mt-4 text-sm text-[#9aa8b5] font-medium">{message}</p>
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
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="mt-5 text-left">
                <UserMessage
                  title={errorDetails?.title}
                  message={errorDetails?.message}
                  onRetry={errorDetails?.retryable ? () => setAttempt((value) => value + 1) : undefined}
                  retryLabel="Verify again"
                />
              </div>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-block rounded-full bg-[#00e6e6] px-8 py-3 text-sm font-bold text-black transition hover:bg-[#00c2c2] shadow-[0_0_15px_rgba(0,230,230,0.4)]"
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
