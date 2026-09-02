"use client";

import { setProgress } from "@/redux/features/loadingBarSlice";
import { requestJson } from "@/services/http";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";
import { SpotlightCard } from "@/components/ReactBits/SpotlightCard";
import Link from "next/link";
import AuthMessage from "@/components/AuthMessage";
import { validatePassword } from "@/utils/authErrors";
import { userErrorDetails } from "@/utils/userError";

const ResetPasswordPage = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const params = useParams();
  const tokenValue = Array.isArray(params?.token) ? params.token[0] : params?.token;
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const tokenIsValid = /^[a-f0-9]{64}$/i.test(token);
  const tokenError = tokenIsValid
    ? null
    : {
        title: "Invalid reset link",
        message: "This password reset link is incomplete or invalid. Request a new link and try again.",
      };
  
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError(null);
  };

  const submitPassword = async () => {
    if (submitting) return;
    if (!tokenIsValid) {
      setFormError(tokenError);
      return;
    }
    const passwordError = validatePassword(formData.password, {
      confirm: formData.confirmPassword,
    });
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    const { password, confirmPassword } = formData;
    try {
      setSubmitting(true);
      dispatch(setProgress(70));
      const res = await requestJson("/api/forgotPassword", {
        method: "PUT",
        body: { password, confirmPassword, token },
        fallbackTitle: "Couldn't reset password",
        fallbackMessage: "We couldn't reset your password. Please try again.",
      });
      if (res?.success === true) {
        toast.success("Password updated. You can log in now.");
        router.push("/login");
      } else {
        setFormError({
          title: "Couldn't reset password",
          message: "We couldn't reset your password. Please try again.",
          retryable: true,
        });
      }
    } catch (error) {
      setFormError(userErrorDetails(error, {
        title: "Couldn't reset password",
        message: "We couldn't reset your password. Please try again.",
      }));
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  const handelSubmit = (event) => {
    event.preventDefault();
    void submitPassword();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000814] px-4 py-12 sm:px-6 lg:px-8">
      <SpotlightCard className="w-full max-w-md space-y-8 bg-[#07121d]">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-[#00e6e6] uppercase">Account recovery</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white mb-2">Reset password</h1>
          <p className="mt-4 text-sm text-[#9aa8b5]">
            Please enter your new password below.
          </p>
        </div>
        <form onSubmit={handelSubmit} className="mt-8 flex flex-col gap-5" noValidate>
          <AuthMessage
            title={(formError || tokenError)?.title}
            message={(formError || tokenError)?.message}
            onRetry={tokenIsValid && formError?.retryable ? submitPassword : undefined}
            retryLabel="Try resetting again"
            busy={submitting}
            href="/reset-password"
            hrefLabel="Request a new password link"
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5] ml-1">
              New password
            </label>
            <input
              onChange={onchange}
              value={formData.password}
              name="password"
              type="password"
              placeholder="New password"
              required
              disabled={!tokenIsValid}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              className="mt-2 w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 focus:border-[#00e6e6] focus:outline-none focus:ring-1 focus:ring-[#00e6e6] sm:text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5] ml-1">
              Confirm password
            </label>
            <input
              onChange={onchange}
              value={formData.confirmPassword}
              name="confirmPassword"
              type="password"
              placeholder="Confirm password"
              required
              disabled={!tokenIsValid}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              className="mt-2 w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 focus:border-[#00e6e6] focus:outline-none focus:ring-1 focus:ring-[#00e6e6] sm:text-sm"
            />
          </div>
          <button type="submit" disabled={submitting || !tokenIsValid} className="mt-2 w-full rounded-full bg-[#00e6e6] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#00c2c2] disabled:cursor-wait disabled:opacity-60 shadow-[0_0_15px_rgba(0,230,230,0.4)]">
            {submitting ? "Saving password..." : "Save password"}
          </button>
        </form>
      </SpotlightCard>
    </div>
  );
};

export default ResetPasswordPage;
