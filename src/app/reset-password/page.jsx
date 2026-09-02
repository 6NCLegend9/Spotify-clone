"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import { requestJson } from "@/services/http";
import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import Link from "next/link";
import { SpotlightCard } from "@/components/ReactBits/SpotlightCard";
import AuthMessage from "@/components/AuthMessage";
import { RESET_ERRORS, validateEmail } from "@/utils/authErrors";
import { userErrorDetails } from "@/utils/userError";

const ForgotPasswordPage = () => {
  const dispatch = useDispatch();
  const emailRef = useRef(null);
  const [formData, setFormData] = useState({ email: "" });
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const sendResetLink = async () => {
    if (submitting) return;
    setSuccess(null);
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setFormError(emailError.title === "Email required" ? RESET_ERRORS.blankEmail : RESET_ERRORS.invalidEmail);
      return;
    }
    try {
      setSubmitting(true);
      dispatch(setProgress(70));
      const res = await requestJson("/api/forgotPassword", {
        method: "POST",
        body: { email: formData.email },
        fallbackTitle: "Couldn't send link",
        fallbackMessage: "We couldn't send a reset link. Please try again.",
      });
      if (res?.success === true) {
        setFormError(null);
        setSuccess({
          title: "Check your email",
          message: "If an account matches that email, a reset link is on the way. It expires in 15 minutes.",
        });
        toast.success("If that email can receive mail, a reset link is on the way.");
      } else {
        setFormError({
          title: "Couldn't send link",
          message: "We couldn't send a reset link. Please try again.",
          retryable: true,
        });
      }
    } catch (error) {
      setFormError(userErrorDetails(error, {
        title: "Couldn't send link",
        message: "We couldn't send a reset link. Please try again.",
      }));
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  const handelSubmit = (event) => {
    event.preventDefault();
    void sendResetLink();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000814] px-4 py-12 sm:px-6 lg:px-8">
      <SpotlightCard className="w-full max-w-md space-y-8 animate-fade-in bg-[#07121d]">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-[#00e6e6] uppercase">Account recovery</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white mb-2">Forgot password</h1>
          <p className="mt-4 text-sm text-[#9aa8b5]">
            Enter your email and we will send a reset link.
          </p>
        </div>
        <form onSubmit={handelSubmit} className="mt-8 flex flex-col gap-6" noValidate>
          <AuthMessage
            tone={success ? "success" : "error"}
            title={(success || formError)?.title}
            message={(success || formError)?.message}
            onRetry={formError?.retryable ? sendResetLink : undefined}
            retryLabel="Try sending again"
            busy={submitting}
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5] ml-1">
              Email Address
            </label>
            <input
              ref={emailRef}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (formError) setFormError(null);
              }}
              value={formData.email}
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              autoComplete="email"
              maxLength={254}
              aria-invalid={Boolean(formError)}
              className="mt-2 w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 focus:border-[#00e6e6] focus:outline-none focus:ring-1 focus:ring-[#00e6e6] sm:text-sm"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Sending..." : "Send reset link"}
          </button>
          <div className="text-center mt-2">
            <Link href="/login" className="text-sm font-semibold text-[#00e6e6] hover:text-[#00c2c2] transition">
              Back to login
            </Link>
          </div>
        </form>
      </SpotlightCard>
    </div>
  );
};

export default ForgotPasswordPage;
