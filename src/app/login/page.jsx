"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "react-hot-toast";
import { redirect, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { useSession } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import GradientText from "@/components/ReactBits/GradientText";
import AuthMessage from "@/components/AuthMessage";
import {
  AUTH_CODES,
  humanizeError,
  validateEmail,
  validatePassword,
} from "@/utils/authErrors";

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

  useEffect(() => {
    const code = searchParams.get("error");
    if (code) setFormError(humanizeError(code, AUTH_CODES.CredentialsSignin));
  }, [searchParams]);

  const onchange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError(null);
  };

  const handelSubmit = async (e) => {
    e.preventDefault();
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setFormError(emailError);
      return;
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    try {
      setSubmitting(true);
      dispatch(setProgress(70));
      const res = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });
      if (!res?.error) {
        toast.success("Logged in successfully");
        setFormError(null);
      } else {
        setFormError(humanizeError(res.error, AUTH_CODES.CredentialsSignin));
      }
    } catch (error) {
      setFormError(humanizeError(error));
    } finally {
      setSubmitting(false);
      dispatch(setProgress(100));
    }
  };

  if (status === "loading") {
    return (
      <div className="page-loading">
        <span className="loader" />
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
            onRetry={() => {
              setFormError(null);
              emailRef.current?.focus();
            }}
            href="/reset-password"
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Email
            <input
              ref={emailRef}
              onChange={onchange}
              value={formData.email}
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
          <label className="text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
            Password
            <input
              onChange={onchange}
              value={formData.password}
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              minLength={8}
              maxLength={72}
              className="field mt-2"
            />
          </label>
          <Link href="/reset-password" className="text-xs font-semibold text-[#00e6e6]">
            Forgot password?
          </Link>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Signing in..." : "Log in"}
          </button>
          <div className="flex items-center gap-3 text-xs text-[#9aa8b5]">
            <span className="h-px flex-1 bg-white/15" />
            or
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <button
            onClick={() => signIn("google")}
            type="button"
            className="btn-ghost w-full"
          >
            <FaGoogle />
            Continue with Google
          </button>
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
        <div className="page-loading">
          <span className="loader" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
