"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "react-hot-toast";
import { redirect, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { useSession } from "next-auth/react";
import GradientText from "@/components/ReactBits/GradientText";
import AuthMessage from "@/components/AuthMessage";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import {
  AUTH_CODES,
  humanizeError,
  validateEmail,
  validatePassword,
} from "@/utils/authErrors";
import { userErrorDetails } from "@/utils/userError";

const LoginPage = () => {
  const { status } = useSession();
  const dispatch = useDispatch();
  const searchParams = useSearchParams();
  const emailRef = useRef(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [retryAction, setRetryAction] = useState(null);

  useEffect(() => {
    const code = searchParams.get("error");
    if (code) setFormError(humanizeError(code, AUTH_CODES.CredentialsSignin));
  }, [searchParams]);

  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) {
      setFormError(null);
      setRetryAction(null);
    }
  };

  const submitCredentials = async () => {
    if (submitting || googleSubmitting) return;
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setFormError(emailError);
      setRetryAction(null);
      return;
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setFormError(passwordError);
      setRetryAction(null);
      return;
    }
    try {
      setSubmitting(true);
      setRetryAction(null);
      dispatch(setProgress(70));
      const res = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });
      if (!res || typeof res.ok !== "boolean") {
        throw new Error("Sign-in did not return a usable response.");
      }
      if (res.ok && !res.error) {
        toast.success("Logged in successfully");
        setFormError(null);
      } else {
        setFormError(humanizeError(res.error, AUTH_CODES.CredentialsSignin));
        setRetryAction(null);
      }
    } catch (error) {
      const details = userErrorDetails(error, AUTH_CODES.Default);
      setFormError(details);
      setRetryAction(details.retryable ? "credentials" : null);
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  const handelSubmit = (e) => {
    e.preventDefault();
    void submitCredentials();
  };

  const handleGoogleSignIn = async () => {
    if (submitting || googleSubmitting) return;
    setGoogleSubmitting(true);
    setFormError(null);
    setRetryAction(null);
    try {
      const result = await signIn("google", {
        callbackUrl: "/",
        redirect: false,
      });
      if (result?.error) {
        setFormError(humanizeError(result.error, AUTH_CODES.OAuthSignin));
        return;
      }
      if (!result?.url) throw new Error("Google sign-in did not return a redirect.");
      window.location.assign(result.url);
    } catch (error) {
      const details = userErrorDetails(error, AUTH_CODES.OAuthSignin);
      setFormError(details);
      setRetryAction(details.retryable ? "google" : null);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const retryRequest =
    retryAction === "google"
      ? handleGoogleSignIn
      : retryAction === "credentials"
        ? submitCredentials
        : undefined;

  if (status === "loading") {
    return (
      <div className="page-loading" role="status" aria-label="Loading sign in">
        <span className="loader" aria-hidden="true" />
      </div>
    );
  }
  if (status === "authenticated") {
    redirect("/");
  }

  return (
    <div className="page grid min-h-full place-items-center relative z-10">
      <div className="auth-card animate-fade-in backdrop-blur-md bg-white/[0.02]">
        <p className="eyebrow">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold">
          <GradientText
            colors={["#00e6e6", "#ffffff", "#008080", "#00e6e6"]}
            animationSpeed={4}
          >
            Log in
          </GradientText>
        </h1>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          Sign in to keep your likes and playlists in sync.
        </p>
        <form onSubmit={handelSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <AuthMessage
            id="login-error"
            title={formError?.title}
            message={formError?.message}
            onRetry={retryRequest}
            busy={submitting || googleSubmitting}
            href="/reset-password"
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]" htmlFor="login-email">
            Email
            <input
              ref={emailRef}
              onChange={onchange}
              value={formData.email}
              id="login-email"
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              autoComplete="email"
              maxLength={254}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "login-error" : undefined}
              className="field mt-2"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]" htmlFor="login-password">
            Password
            <input
              onChange={onchange}
              value={formData.password}
              id="login-password"
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              minLength={8}
              maxLength={72}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "login-error" : undefined}
              className="field mt-2"
            />
          </label>
          <Link href="/reset-password" className="text-xs font-semibold text-[#00e6e6]">
            Forgot password?
          </Link>
          <button type="submit" disabled={submitting || googleSubmitting} className="btn-primary w-full">
            {submitting ? "Signing in..." : "Log in"}
          </button>
          <GoogleSignInButton
            onClick={handleGoogleSignIn}
            disabled={submitting}
            busy={googleSubmitting}
          />
          <p className="text-center text-sm text-[#c9d4de]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-[#00e6e6]">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default function LoginPageWithSearch() {
  return (
    <Suspense
      fallback={
        <div className="page-loading" role="status" aria-label="Loading sign in">
          <span className="loader" aria-hidden="true" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
